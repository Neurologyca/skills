#!/usr/bin/env node
// doctor.mjs — Neurologyca skill script. Read-only, no dependencies, Node.js 20+. Never prints a secret.
//   node doctor.mjs [project-dir] [--url http://localhost:3000] [--static <dir>]...
// Checks: installed SDK versions against this skill and the public changelog; that npm takes @neurologyca from the
// public registry (the npm_config_* variables, the project's, your user and the global npmrc, and the lockfile; it asks no
// registry and runs no npm command); the Engine key in files served to the
// browser; this skill's DevLab against your kit's ("DevLab: <origin>" in KIT.md or AGENTS.md); with --url, one cheap read
// through your proxy (GET <url><engineBaseUrl>/catalog/protocols: the SDK proxy answers 404 E_ROUTE_NOT_ALLOWED without
// calling Engine; a proxy written by hand may forward it to Engine); in the recording (deferred) mode, that PUBLIC_BASE_URL
// is set when PROCESSOR_URL is, and that the processor's key and secret are not in what you serve; and whether a newer
// skill is published.
// The only network calls are that read and DevLab's public changelog and published skill. Network towards DevLab is a
// soft check: it never fails the run. Exit code 1 only when there is an ERROR. The key pattern below is published on
// purpose: it is not secret and it lets this script spot a key where it must not be.
import { existsSync, readFileSync, readdirSync, lstatSync, statSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'

const KEY_PATTERN = /kop_[a-z]+_[A-Za-z0-9_-]{8,}/
const JWT_PATTERN = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/
const VERSION = /^\d+\.\d+\.\d+(?:-(?:alpha|beta|rc)\.\d+)?$/
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])$/
const BOM = new RegExp(`^${String.fromCharCode(0xfeff)}`)
const TIMEOUT_MS = 4000
const MAX_BODY = 1 << 20 // what is read of a network answer
const MAX_FILE = 20 << 20 // served files above this size are skipped

let errors = 0, warnings = 0
// Every line goes through the redaction as a last line of defense: no message can carry a key or a token. The checks
// never echo a value read from a file or a response (only paths, origins and version numbers of a plain shape), and no
// error message of a parser or of the network is printed (they can quote the input).
const redact = (s) => String(s)
  .replace(new RegExp(KEY_PATTERN.source, 'g'), '<key>')
  .replace(new RegExp(JWT_PATTERN.source, 'g'), '<token>')
  .replace(/\bey[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '<token>')
const say = (level, msg) => {
  if (level === 'ERROR') errors++
  if (level === 'WARN') warnings++
  console.log(`${level.padEnd(5)} ${redact(msg)}`)
}
const done = () => { console.log(`doctor: ${errors} errors, ${warnings} warnings`); process.exit(errors ? 1 : 0) }
const clean = (t) => t.replace(BOM, '').replace(/\r\n?/g, '\n')
const text = (p) => clean(readFileSync(p, 'utf8'))
const ver = (v) => (typeof v === 'string' && VERSION.test(v) ? v : null)
// A prerelease (1.0.0-rc.1) is older than its release (1.0.0); between prereleases: alpha < beta < rc, then the number.
const cmp = (a, b) => {
  const split = (v) => { const [core, pre] = v.split('-'); return { n: core.split('.').map(Number), pre: pre ? pre.split('.') : null } }
  const x = split(a), y = split(b)
  for (let i = 0; i < 3; i++) if (x.n[i] !== y.n[i]) return x.n[i] - y.n[i]
  if (!x.pre || !y.pre) return x.pre ? -1 : y.pre ? 1 : 0
  const tag = ['alpha', 'beta', 'rc']
  return tag.indexOf(x.pre[0]) - tag.indexOf(y.pre[0]) || Number(x.pre[1]) - Number(y.pre[1])
}
const shown = (u) => `${u.origin}${u.pathname}` // never the query, the fragment or the userinfo

function unquote(v) {
  const s = v.trim()
  if (!s.startsWith('"')) return s.replace(/^'(.*)'$/, '$1')
  try { return JSON.parse(s) } catch { return '' }
}
function frontmatter(t) {
  const m = clean(t).match(/^---\n([\s\S]*?)\n---/)
  const data = { metadata: {} }
  if (!m) return null
  for (const line of m[1].split('\n')) {
    const c = line.match(/^ {2}([\w-]+):\s*(.+)$/), kv = line.match(/^([\w-]+):\s*(.+)$/)
    if (c) data.metadata[c[1]] = unquote(c[2]); else if (kv) data[kv[1]] = unquote(kv[2])
  }
  return data
}

// Arguments: [dir] --url <url> --static <dir>. Values are checked, never echoed when malformed.
const argv = process.argv.slice(2)
const urls = [], statics = []
let dirArg = null, badArgs = false
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === '--url' || a === '--static') {
    const v = argv[i + 1]
    if (v === undefined || v.startsWith('--')) { say('ERROR', `${a} needs ${a === '--url' ? 'a URL (http://localhost:3000)' : 'a directory'}`); badArgs = true; continue }
    ;(a === '--url' ? urls : statics).push(v); i++
  } else if (a.startsWith('--')) { say('ERROR', 'unknown option: use [project-dir] [--url http://localhost:3000] [--static <dir>]'); badArgs = true }
  else if (dirArg === null) dirArg = a
}
const dir = resolve(dirArg ?? '.')

async function get(url, { redirect = 'follow' } = {}) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), redirect, headers: { accept: 'application/json, text/markdown;q=0.9, */*;q=0.1' } })
    const body = (await r.text()).slice(0, MAX_BODY)
    return { ok: r.ok, status: r.status, type: r.headers.get('content-type') ?? '', body, headers: r.headers, redirected: r.redirected }
  } catch (e) {
    // Only a code (ECONNREFUSED, TimeoutError...): never the message, which can quote the URL.
    // fetch's rejection of a forbidden port ("bad port") has no code: it gets a word of its own.
    const code = e?.cause?.message === 'bad port' ? 'blocked port' : String(e?.cause?.code ?? e?.name ?? 'error')
    return { error: /^[A-Za-z_]{1,40}$/.test(code) || code === 'blocked port' ? code : 'error' }
  }
}
// When the docs of this DevLab require a session: a 302 to /login and then the sign-in page (HTML, 200).
const signIn = (r) => /text\/html/i.test(r.type) || /^\s*</.test(r.body) || (r.redirected && /\/login\b/.test(r.body))

function installed(pkg) {
  for (const base of [dir, join(dir, 'server'), join(dir, 'backend')]) {
    const p = join(base, 'node_modules', ...pkg.split('/'), 'package.json')
    if (!existsSync(p)) continue
    let v
    try { v = JSON.parse(text(p))?.version } catch { return { bad: true } }
    return ver(v) ? { v } : { bad: true }
  }
  return null
}

async function versions(META, DOCS, ORIGIN, logP) {
  const log = await logP
  const where = shown(new URL(`${DOCS}/resources/changelog.json`))
  let changelog = null
  if (log.error) say('INFO', `could not reach ${where} (${log.error}): skipped`)
  else if (!log.ok) say('INFO', `could not read ${where} (${log.status}): skipped`)
  else if (signIn(log) && !/json/i.test(log.type)) say('INFO', 'the public changelog is behind a sign-in: skipped')
  else {
    try { changelog = JSON.parse(log.body) } catch { /* below */ }
    if (!changelog || typeof changelog !== 'object' || Array.isArray(changelog)) { changelog = null; say('INFO', 'the public changelog is not readable: skipped') }
  }
  for (const [pkg, verifiedRaw] of [['@neurologyca/capture', META.sdk], ['@neurologyca/capture-server', META.captureServer]]) {
    const got = installed(pkg)
    if (!got) { say('INFO', `${pkg} is not installed in this project`); continue }
    if (got.bad) { say('WARN', `${pkg}: its package.json is not readable (or has no plain version): reinstall it`); continue }
    const v = got.v, verified = ver(verifiedRaw)
    if (!verified) say('INFO', `${pkg} ${v} is installed (this skill does not say which version it was verified with)`)
    else if (v === verified) say('OK', `${pkg} ${v} is the version this skill was verified with`)
    else if (cmp(v, verified) < 0) say('WARN', `${pkg} ${v} is older than the ${verified} this skill was verified with: update it`)
    else say('WARN', `${pkg} ${v} is newer than the ${verified} this skill was verified with: reinstall the skill from ${ORIGIN}`)
    const rows = Array.isArray(changelog?.[pkg]) ? changelog[pkg] : []
    const later = rows.filter((e) => e && ver(e.version) && cmp(e.version, v) > 0)
    const breaking = later.filter((e) => e.breaking === true).map((e) => e.version)
    if (breaking.length) say('WARN', `breaking changes after ${v} (${breaking.join(', ')}): read ${DOCS}/resources/changelog.md`)
    else if (later.length) say('INFO', `${pkg} ${later.map((e) => e.version).sort((a, b) => cmp(b, a))[0]} is available`)
  }
}

// The SDK is on the public npm registry. A setting left over from the private previews sends @neurologyca elsewhere,
// and npm answers 404; a lockfile can still resolve it there. doctor reads, for each folder with a package.json, what
// npm reads, in npm's order: the npm_config_* environment variables, the folder's .npmrc, your user .npmrc and the
// global npmrc (where it can find it without running npm). From those files it takes only the @neurologyca scope line
// and the registry= line; it runs no npm command, asks no registry and never prints the host it finds.
const NPMJS = 'https://registry.npmjs.org/'
const SCOPE_KEY = '@neurologyca:registry', REG_KEY = 'registry'
const norm = (v) => (v.replace(/^["']|["']$/g, '').replace(/\/?$/, '/') === NPMJS ? 'npmjs' : 'other')
function rcValues(p) {
  if (!p || !existsSync(p)) return {}
  const out = {}
  try {
    for (const l of text(p).split('\n')) {
      const m = l.match(/^\s*(@neurologyca:registry|registry)\s*=\s*(\S+?)\s*$/i)
      if (m) out[m[1].toLowerCase()] = norm(m[2])
    }
  } catch { return {} }
  return out
}
// Launched by npm (npx or an npm script): npm exports its own resolved configuration as npm_config_* for the folder it ran
// in, so those variables are not your environment's and doctor does not read them as such (it says so instead).
const envAny = (k) => Object.entries(process.env).find(([n, v]) => n.toLowerCase() === k && v)?.[1]
const fromNpm = () => !!(envAny('npm_lifecycle_event') || envAny('npm_execpath'))
// npm_config_<key>, any case (Windows does not tell them apart either).
function envSetting(key) {
  if (fromNpm()) return undefined
  const want = `npm_config_${key}`.toLowerCase()
  const hit = Object.entries(process.env).find(([k, v]) => k.toLowerCase() === want && v)
  return hit ? norm(hit[1]) : undefined
}
// The global npmrc: NPM_CONFIG_GLOBALCONFIG, or <prefix>/etc/npmrc. Without NPM_CONFIG_PREFIX, the prefix= of npm's
// builtin npmrc, next to npm itself (the official Windows installer writes prefix=${APPDATA}/npm there; read, but `known: false`:
// that npm may not be the one in use). Without either,
// the prefix is a guess (on Windows %APPDATA%/npm if its etc/npmrc exists, else the folder of node; its parent
// elsewhere); `known: false` says so. The path is never printed.
function builtinPrefix(nodeDir) {
  const p = process.platform === 'win32' ? join(nodeDir, 'node_modules', 'npm', 'npmrc') : join(dirname(nodeDir), 'lib', 'node_modules', 'npm', 'npmrc')
  try {
    const m = readFileSync(p, 'utf8').match(/^\s*prefix\s*=\s*(.+?)\s*$/m)
    if (!m) return null
    let missing = false
    const v = m[1].replace(/^["']|["']$/g, '').replace(/\$\{([^}]+)\}/g, (_, k) => { const x = envAny(k.toLowerCase()); if (!x) missing = true; return x ?? '' })
    return missing || !v ? null : v
  } catch { return null }
}
function globalRc() {
  const explicit = envAny('npm_config_globalconfig')
  if (explicit) return { path: explicit, known: true }
  const prefix = envAny('npm_config_prefix')
  if (prefix) return { path: join(prefix, 'etc', 'npmrc'), known: true }
  const nodeDir = dirname(process.execPath)
  const builtin = builtinPrefix(nodeDir)
  if (builtin) return { path: join(builtin, 'etc', 'npmrc'), known: false } // the npm next to node may not be the one in use (global update, nvm)
  if (process.platform === 'win32') {
    const appData = envAny('appdata')
    const roaming = appData ? join(appData, 'npm', 'etc', 'npmrc') : null
    if (roaming && existsSync(roaming)) return { path: roaming, known: false }
    return { path: join(nodeDir, 'etc', 'npmrc'), known: false }
  }
  return { path: join(dirname(nodeDir), 'etc', 'npmrc'), known: false }
}
const CHECK = 'npm config get @neurologyca:registry'
function registry() {
  // Under npm, npm_config_userconfig, _globalconfig and _prefix are npm's own resolved paths: still the right files.
  const userRc = envAny('npm_config_userconfig') || join(homedir(), '.npmrc')
  const user = rcValues(userRc), glob = globalRc(), global = rcValues(glob.path)
  const folders = ['.', 'server', 'backend'].filter((r) => existsSync(join(dir, r, 'package.json')))
  if (!folders.length) folders.push('.')
  let bad = 0
  for (const r of folders) {
    const where = r === '.' ? 'this project' : `${r}/`
    const rc = r === '.' ? '.npmrc' : `${r}/.npmrc`
    const proj = rcValues(join(dir, r, '.npmrc'))
    // npm's order: environment, project, user, global. The scope line wins over registry=, wherever each one is.
    const layers = [['the environment variable npm_config_@neurologyca:registry', envSetting(SCOPE_KEY), 'the environment variable npm_config_registry', envSetting(REG_KEY)],
      [rc, proj[SCOPE_KEY], rc, proj[REG_KEY]], ['your user .npmrc', user[SCOPE_KEY], 'your user .npmrc', user[REG_KEY]],
      ['the global npmrc', global[SCOPE_KEY], 'the global npmrc', global[REG_KEY]]]
    const scope = layers.find((l) => l[1])
    const reg = scope ? null : layers.find((l) => l[3])
    const [source, value] = scope ? [scope[0], scope[1]] : reg ? [reg[2], reg[3]] : [null, 'npmjs']
    if (value === 'other') {
      bad++
      say('WARN', `in ${where}, ${source} sends @neurologyca to another registry (left over from the private previews?): the SDK is public on npm. Remove that setting and its _authToken, or add @neurologyca:registry=${NPMJS} to ${rc}. Check with \`${CHECK}\` in that folder: it must print ${NPMJS} or undefined`)
    }
  }
  if (fromNpm()) say('INFO', `doctor was launched from npm (npx or an npm script): the npm_config_* variables it sees are npm's own resolved settings, not your environment's, so it left them out; to check your environment variables too, run it with \`node doctor.mjs\``)
  if (!bad) say('OK', `@neurologyca resolves to the public npm registry in what doctor can read${glob.known ? '' : ' (it could not locate your global npmrc for sure)'}; confirm with \`${CHECK}\` in each folder you install in`)
  for (const r of ['.', 'server', 'backend']) {
    const lock = join(dir, r, 'package-lock.json')
    if (!existsSync(lock)) continue
    let pkgs
    try { pkgs = JSON.parse(text(lock))?.packages } catch { continue }
    if (!pkgs || typeof pkgs !== 'object') continue
    const stale = Object.entries(pkgs).filter(([k, e]) => /(^|\/)node_modules\/@neurologyca\//.test(k) && typeof e?.resolved === 'string' && !e.resolved.startsWith(NPMJS))
    if (stale.length) say('WARN', `${r === '.' ? '' : `${r}/`}package-lock.json resolves @neurologyca from another registry: delete the lockfile and node_modules, then run npm install once`)
  }
}

function envValue(name) {
  const envFile = ['.env', 'server/.env', 'backend/.env'].map((r) => join(dir, r)).find((p) => existsSync(p))
  if (!envFile) return null
  try {
    const m = text(envFile).match(new RegExp(String.raw`^[ \t]*(?:export[ \t]+)?${name}[ \t]*=[ \t]*["']?([^"'\s#]*)`, 'm'))
    return m ? m[1] : null
  } catch { return null }
}
const envKey = () => envValue('ENGINE_API_KEY') ?? ''

// The recording (deferred) mode with Neurologyca's processing service: with PROCESSOR_URL set, the service calls your
// backend at PUBLIC_BASE_URL (a public https origin). Values are never echoed; validate-config checks their shape.
function processorEnv() {
  const url = envValue('PROCESSOR_URL')
  if (!url) return
  if (!envValue('PUBLIC_BASE_URL')) say('WARN', "PROCESSOR_URL is set but PUBLIC_BASE_URL is missing: set your backend's public https origin, where the processing service calls the video, the token URL and the webhook (to test on your machine, a public HTTPS tunnel)")
  // validate-config only ships with the SDK skill: the HTTP API skill has none, so do not point to it there.
  else say('OK', `PROCESSOR_URL and PUBLIC_BASE_URL are set${existsSync(join(dirname(fileURLToPath(import.meta.url)), 'validate-config.mjs')) ? ' (run validate-config to check their shape)' : ''}`)
}

function walkFiles(d, depth, out) {
  if (depth < 0 || out.length > 20000) return out
  let names
  try { names = readdirSync(d) } catch { return out }
  for (const n of names) {
    if (n === 'node_modules' || n === '.git') continue
    const p = join(d, n)
    let s
    try { s = lstatSync(p) } catch { continue }
    if (s.isSymbolicLink()) continue
    if (s.isDirectory()) walkFiles(p, depth - 1, out)
    else if (s.isFile() && s.size <= MAX_FILE) out.push(p)
  }
  return out
}

function keyLeaks() {
  const value = envKey()
  // The processing service's key and secret (recording mode) must never be served either.
  const processorValues = ['PROCESSOR_API_KEY', 'PROCESSOR_SECRET'].map((n) => envValue(n) ?? '').filter((v) => v.length >= 16)
  // templates/ and views/: the pages a backend renders (Flask, Django, Express views) are served too.
  const isDir = (d) => { try { return statSync(d).isDirectory() } catch { return false } }
  // A --static folder that is not there is said: a typo would otherwise leave the check without what it was asked to read.
  for (const s of new Set(statics)) if (!isDir(resolve(dir, s))) say('WARN', `--static folder not found: ${resolve(dir, s)}`)
  // A Vite or Next project serves its page from the sources (index.html at the root and src/; Next also app/ and pages/),
  // not from public/: read those too. Without one of them, src/ may be a backend's, so it is left alone.
  const pkg = (() => { try { return JSON.parse(readFileSync(resolve(dir, 'package.json'), 'utf8')) } catch { return {} } })()
  const deps = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) }
  const rootPage = existsSync(resolve(dir, 'index.html'))
  const fromSources = rootPage || 'vite' in deps || 'next' in deps
  // Next serves its compiled client from .next/static (only that: the rest of .next is the server's, which may hold the key).
  const sources = fromSources ? ['src', ...('next' in deps ? ['app', 'pages', join('.next', 'static')] : [])] : []
  const dirs = [...new Set(['public', 'dist', 'build', 'static', 'www', 'out', 'templates', 'views', ...sources, ...statics].map((d) => resolve(dir, d)))].filter(isDir)
  const SERVED = /\.(html?|m?js|cjs|jsx|tsx?|mts|vue|svelte|css|json|map|txt|xml|svg|webmanifest)$/i
  // What there is to read, per folder: one that exists but has nothing to read is not an OK ("found nothing" is not "clean").
  const toRead = dirs.map((d) => [d, walkFiles(d, 12, []).filter((p) => SERVED.test(p))])
  if (rootPage) { dirs.push(resolve(dir, 'index.html')); toRead.push([resolve(dir, 'index.html'), [resolve(dir, 'index.html')]]) }
  const hint = fromSources ? 'build first (npm run build) or pass --static <dir> with what you serve' : 'pass --static <dir> with what you serve'
  // An empty folder is said only when nothing at all was read, or when it was asked for with --static.
  const asked = new Set(statics.map((s) => resolve(dir, s)))
  const none = toRead.every(([, list]) => !list.length)
  for (const [d, list] of toRead) if (!list.length && (none || asked.has(d))) say('WARN', `found nothing to review in ${d}: the folder has no served files (html, js, css, json...); ${hint}`)
  // A Vite or Next project read from its sources: a key in VITE_* or NEXT_PUBLIC_* only shows in the build, so say when
  // there was none to read (dist/ or build/ for Vite, .next/static for Next).
  const builds = 'next' in deps ? [join('.next', 'static')] : ['dist', 'build']
  const built = toRead.some(([d, list]) => list.length && builds.some((b) => d === resolve(dir, b)))
  // Only with vite or next (a static index.html has no bundle), and as an INFO: a key in VITE_* or NEXT_PUBLIC_* is caught
  // in the .env* files below. The command is the project's build script, or the tool's own.
  const tool = 'next' in deps ? 'next' : 'vite' in deps ? 'vite' : null
  const buildCmd = typeof pkg?.scripts?.build === 'string' ? 'npm run build' : `npx ${tool} build`
  if (tool && !built) say('INFO', `the build was not reviewed: build first to check the bundle (${buildCmd}), or pass --static <dir> with it`)
  let found = 0, reviewed = 0
  for (const f of toRead.flatMap(([, list]) => list)) {
    reviewed++
    let t
    try { t = readFileSync(f, 'utf8') } catch { continue }
    if (KEY_PATTERN.test(t) || (value.length >= 8 && t.includes(value))) {
      found++
      say('ERROR', `the Engine key appears in ${f}: it is served to the browser; remove it (the key lives only in your backend)`)
    }
    if (processorValues.some((v) => t.includes(v))) {
      found++
      say('ERROR', `a processor credential (PROCESSOR_API_KEY or PROCESSOR_SECRET) appears in ${f}: it is served to the browser; remove it and ask your admin team to rotate it`)
    }
  }
  // VITE_* and NEXT_PUBLIC_* variables go into the browser bundle: one that holds the key (by name or by value) leaks it.
  // Only the variable's name is said, never its value.
  for (const f of readdirSync(dir).filter((n) => /^\.env(\..+)?$/.test(n))) {
    let body = ''
    try { body = text(join(dir, f)) } catch { continue }
    for (const m of body.matchAll(/^[ \t]*(?:export[ \t]+)?((?:VITE|NEXT_PUBLIC)_[A-Za-z0-9_]*)[ \t]*=[ \t]*["']?([^"'\s#]*)/gm)) {
      const [, name, v] = m
      // Also a value that expands the key ($ENGINE_API_KEY or ${ENGINE_API_KEY}, as Vite's .env expansion does).
      if (/ENGINE_API_KEY/i.test(name) || /\$\{?ENGINE_API_KEY\b/.test(v) || KEY_PATTERN.test(v) || (value.length >= 8 && v === value)) {
        found++
        say('ERROR', `${f}: ${name} puts the Engine key in the browser bundle (VITE_ and NEXT_PUBLIC_ variables are served): remove it; the key lives only in your backend`)
      }
    }
  }
  if (!dirs.length) say('WARN', 'no static directory found (public, dist, build, static, www, out, templates, views): pass --static <dir> with what you serve, or the key is not checked')
  else if (!found && reviewed) say('OK', `the key does not appear in what you serve (${toRead.filter(([, list]) => list.length).map(([d]) => d).join(', ')})`)
  // The .env with the key must never reach git.
  let ignore = ''
  try { ignore = readFileSync(resolve(dir, '.gitignore'), 'utf8') } catch { /* no .gitignore */ }
  if (existsSync(resolve(dir, '.env')) && !/^\/?\.env(\*|\.\*)?\s*$/m.test(ignore)) say('WARN', '.env is not in .gitignore: add it, so the key never reaches git')
}

// This skill's DevLab (metadata.docs) against the kit's (the "DevLab: <origin>" line of KIT.md or AGENTS.md).
function origins(ORIGIN) {
  const kits = walkFiles(dir, 2, []).filter((p) => /[\\/](KIT|AGENTS)\.md$/.test(p) && !/[\\/]\.[^\\/]+[\\/]/.test(p.slice(dir.length)))
  const found = new Set()
  for (const p of kits) {
    let line
    try { line = text(p).match(/^DevLab:[ \t]*(\S+)[ \t]*$/m)?.[1] } catch { continue }
    if (!line) continue
    let u = null
    try { u = new URL(line) } catch { /* below */ }
    if (!u || !/^https?:$/.test(u.protocol)) { say('WARN', `the "DevLab:" line of ${p} is not a URL: download your kit again from ${ORIGIN}/integration`); continue }
    found.add(u.origin)
  }
  if (!found.size) return say('INFO', `no kit with a "DevLab:" line here: download your kit again from ${ORIGIN}/integration`)
  for (const kit of found) {
    if (kit === ORIGIN) say('OK', 'your skill and your kit are from the same DevLab')
    // A kit from localhost is a DevLab under development: reinstalling the skill from it is not advice.
    else if (LOCAL_HOST.test(new URL(kit).hostname)) say('INFO', `your kit is from a local DevLab (${kit}) and your skill from ${ORIGIN}`)
    else say('WARN', `your skill is from ${ORIGIN} and your kit from ${kit}: reinstall the skill from ${kit}`)
  }
}

function engineBase() {
  const cfgFile = ['neuro.config.json', 'public/neuro.config.json', 'src/neuro.config.json', 'static/neuro.config.json'].map((r) => join(dir, r)).find((p) => existsSync(p))
  let base = null
  try { if (cfgFile) base = JSON.parse(text(cfgFile))?.engineBaseUrl } catch { /* the SDK skill's validate-config reports it */ }
  // Only a plain path is used here; an absolute engineBaseUrl is the SDK skill's validate-config business.
  if (typeof base === 'string' && /^\/[A-Za-z0-9._~/-]*$/.test(base) && !base.startsWith('//')) return base.replace(/\/+$/, '')
  return '/engine'
}

async function throughProxy(raw, envValue) {
  let u = null
  try { u = new URL(raw) } catch { /* below */ }
  if (!u || !/^https?:$/.test(u.protocol)) return say('ERROR', '--url is not an http(s) URL: pass your app\'s address, like http://localhost:3000')
  // The origin is echoed only for a loopback or IP address; any other host is named by its scheme and port.
  const app = LOCAL_HOST.test(u.hostname) || /^[\d.]+$/.test(u.hostname) ? u.origin : `the --url host (${u.protocol.slice(0, -1)}${u.port ? `, port ${u.port}` : ''})`
  if (u.protocol !== 'https:' && !LOCAL_HOST.test(u.hostname)) say('WARN', `${app} is not a secure context: the camera needs HTTPS or localhost`)
  const target = new URL(`${engineBase()}/catalog/protocols`, u.origin)
  const r = await get(target.href, { redirect: 'manual' })
  if (r.error) return say('ERROR', `cannot reach ${app} (${r.error}): is your backend running?`)
  let leak = false
  if (r.headers.has('authorization')) { leak = true; say('ERROR', 'the response through your proxy carries an Authorization header: never send the token or the key back to the browser') }
  const headerValues = [...r.headers.values()].join('\n')
  if (KEY_PATTERN.test(r.body) || KEY_PATTERN.test(headerValues)) { leak = true; say('ERROR', 'the response through your proxy carries a key-shaped value: never send the key back to the browser') }
  if (JWT_PATTERN.test(r.body) || JWT_PATTERN.test(headerValues)) { leak = true; say('ERROR', 'the response through your proxy carries a token-shaped value: this route must not return a token') }
  if (envValue.length >= 8 && (r.body.includes(envValue) || headerValues.includes(envValue))) { leak = true; say('ERROR', 'the response through your proxy carries the value of your ENGINE_API_KEY: never send the key back to the browser') }
  let code = null
  try { code = JSON.parse(r.body)?.error?.code } catch { /* not JSON */ }
  // Only the SDK proxy answers without calling Engine; a proxy written by hand may forward the read.
  if (r.status === 404 && code === 'E_ROUTE_NOT_ALLOWED') { if (!leak) say('OK', `your proxy only opens the SDK's routes (${target.pathname} answered 404 E_ROUTE_NOT_ALLOWED; no call reached Engine)`) }
  else if (r.ok) say('WARN', `your proxy forwards routes beyond the SDK's (GET ${target.pathname} answered ${r.status}; this read may have reached Engine through your proxy): open only the SDK routes`)
  // QA F3d-1: a 404 without the SDK proxy's code is often another app on that port, not your backend.
  else say('WARN', `unexpected answer through your proxy (GET ${target.pathname} answered ${r.status}; if your proxy is written by hand, this read may have reached Engine): compare it with the SDK proxy${r.status === 404 ? `; or another app may be listening on this port: check that ${app} is your backend (stop the other app or use another port and --url)` : ''}`)
}

async function publishedSkill(SELF, META, ORIGIN, skillP) {
  const r = await skillP
  if (r.error) return say('INFO', `could not read the published skill (${r.error}): skipped`)
  if (!r.ok) return say('INFO', `could not read the published skill (${r.status}): skipped`)
  const fm = clean(r.body).startsWith('---') ? frontmatter(r.body) : null
  // With docs that require a session, the sign-in page answers 200 in HTML.
  if (!fm) return say('INFO', signIn(r) ? 'the published skill is behind a sign-in: skipped' : 'the published skill is not readable: skipped')
  const v = ver(fm.metadata.version), mine = ver(META.version)
  if (!v || !mine) return say('INFO', 'the published skill has no plain version: skipped')
  if (cmp(v, mine) > 0) say('WARN', `a newer skill is published (${v}): reinstall it with npx skills add ${ORIGIN}`)
  else say('OK', `this skill (${mine}) is the published one`)
}

try {
  // The script runs from an installed skill (<skill>/scripts/doctor.mjs, with <skill>/SKILL.md next to it).
  const selfFile = join(dirname(fileURLToPath(import.meta.url)), '..', 'SKILL.md')
  if (!existsSync(selfFile)) {
    say('ERROR', 'this script must run from an installed skill (<skill>/scripts/doctor.mjs, next to <skill>/SKILL.md): reinstall the skill')
    done()
  }
  const SELF = frontmatter(text(selfFile)) ?? { metadata: {} }
  const META = SELF.metadata
  let docs = null
  try { docs = new URL(META.docs) } catch { /* below */ }
  if (!docs || !/^https?:$/.test(docs.protocol)) {
    say('ERROR', 'this SKILL.md has no valid metadata.docs: reinstall the skill from your DevLab')
    done()
  }
  const ORIGIN = docs.origin, DOCS = `${ORIGIN}${docs.pathname.replace(/\/+$/, '')}`
  if (badArgs) done()
  if (!existsSync(dir) || !statSync(dir).isDirectory()) { say('ERROR', `project directory not found: ${dir}`); done() }
  if (!walkFiles(dir, 2, []).length) say('WARN', `found nothing to review in ${dir}: the folder is empty`)
  say('INFO', `checking ${dir} with the skill ${/^[a-z0-9-]{1,64}$/.test(SELF.name ?? '') ? SELF.name : '(unnamed)'} from ${ORIGIN}`)
  // The two reads towards DevLab start together (a soft check: their failure is an INFO).
  const logP = get(`${DOCS}/resources/changelog.json`)
  const skillP = /^[a-z0-9-]{1,64}$/.test(SELF.name ?? '') ? get(`${DOCS}/agents/skills/${SELF.name}/SKILL.md`) : Promise.resolve({ error: 'unnamed' })
  await versions(META, DOCS, ORIGIN, logP)
  registry()
  keyLeaks()
  origins(ORIGIN)
  processorEnv()
  const engineKey = envKey()
  for (const url of urls) await throughProxy(url, engineKey)
  await publishedSkill(SELF, META, ORIGIN, skillP)
} catch {
  // Never a stack trace (it can quote paths or values): one clean line.
  say('ERROR', 'could not finish the checks (an unexpected error): run it again, and if it repeats, report it with this output')
}
done()
