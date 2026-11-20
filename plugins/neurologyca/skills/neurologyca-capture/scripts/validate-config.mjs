#!/usr/bin/env node
// validate-config.mjs — Neurologyca skill script. Read-only, no dependencies, Node.js 20+. Never prints a secret.
// Checks the client config (neuro.config.json) and the backend environment (.env) of a project:
//   node validate-config.mjs [project-dir]
// With @neurologyca/capture installed in the project it also runs the SDK's defineTenantConfig; without it (for example
// before npm install), its own rules only. neuro.config.json is for the SDK way; with the HTTP API only the .env checks
// apply. In the recording (deferred) mode it also checks the `processing` key of neuro.config.json and the processing
// service's variables of the .env (PROCESSOR_URL, PUBLIC_BASE_URL and the secrets, never echoed). Exit code 1 when there
// is any ERROR. The key pattern below is published on purpose: it is not secret and it
// lets this script spot a key where it must not be.
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const KEY_PATTERN = /kop_[a-z]+_[A-Za-z0-9_-]{8,}/
const KEY_EXACT = /^kop_[a-z]+_[A-Za-z0-9_-]{8,}$/
const JWT_PATTERN = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/
// The processing service's key (PROCESSOR_API_KEY), published on purpose too: no line can carry one.
const PROCESSOR_KEY_PATTERN = /nlp_[A-Za-z0-9_-]{20,}/
const JWT_LIKE = /^ey[A-Za-z0-9_-]+\./ // what defineTenantConfig rejects
// The key-name fragments defineTenantConfig rejects (lower case, without _ and -).
const CREDENTIAL_NAMES = ['secret', 'apikey', 'securitykey', 'token', 'password', 'credential', 'privatekey', 'passwd', 'bearer']
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])$/
// A query or fragment parameter of engineBaseUrl whose name looks like a credential.
// Whole name segments (split on _ - . and camelCase), so `monkey` or `author` are not credentials but `x-api-key`,
// `accessToken` or `client_secret` are. Names are never echoed: a bare `?<secret>` or `#<secret>` parses as a name.
const CREDENTIAL_SEGMENTS = new Set(['key', 'apikey', 'token', 'secret', 'password', 'passwd', 'pwd', 'pass', 'auth', 'authorization',
  'credential', 'credentials', 'bearer', 'jwt', 'sig', 'signature', 'code'])
const credentialParam = (name) => name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase().split(/[^a-z0-9]+/).some((s) => CREDENTIAL_SEGMENTS.has(s))
// A context id is echoed only when it has the plain shape of one.
const PLAIN_ID = /^[a-z0-9_]{1,64}$/i
// A byte order mark at the start of a file (some Windows editors write one).
const BOM = new RegExp(`^${String.fromCharCode(0xfeff)}`)

const dir = resolve(process.argv[2] ?? '.')
let errors = 0, warnings = 0
// Every line goes through the redaction as a last line of defense: no message can carry a key or a token. The checks
// below never echo a value they flagged, and the parser's message (which quotes the text) is never printed.
const redact = (s) => String(s)
  .replace(new RegExp(KEY_PATTERN.source, 'g'), '<key>')
  .replace(new RegExp(JWT_PATTERN.source, 'g'), '<token>')
  .replace(new RegExp(PROCESSOR_KEY_PATTERN.source, 'g'), '<processor key>')
  .replace(/\bey[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '<token>')
// Levels: ERROR (exit 1), WARN, OK and INFO. INFO is for what is optional or only worth knowing: it never counts as a warning.
const say = (level, msg) => {
  if (level === 'ERROR') errors++
  if (level === 'WARN') warnings++
  console.log(`${level.padEnd(5)} ${redact(msg)}`)
}
const text = (p) => readFileSync(p, 'utf8').replace(BOM, '').replace(/\r\n?/g, '\n')
const first = (rels) => rels.map((r) => join(dir, r)).find((p) => existsSync(p)) ?? null
const credentialName = (k) => CREDENTIAL_NAMES.some((f) => k.toLowerCase().replace(/[_-]/g, '').includes(f))
const credentialValue = (v) => KEY_PATTERN.test(v) || JWT_PATTERN.test(v) || JWT_LIKE.test(v) || PROCESSOR_KEY_PATTERN.test(v)

function walk(value, path, out) {
  if (typeof value === 'string') { if (credentialValue(value)) out.push({ path: path || '(root)', what: 'value' }); return }
  if (!value || typeof value !== 'object') return
  for (const [k, v] of Object.entries(value)) {
    const at = path ? `${path}.${k}` : k
    const before = out.length
    walk(v, at, out)
    if (out.length === before && credentialName(k)) out.push({ path: at, what: 'name' })
  }
}

// Never the parser's message: V8 quotes the text around the error, which can be part of a secret. Only the position.
function where(raw, e) {
  const m = String(e?.message ?? '')
  const lc = m.match(/line (\d+) column (\d+)/)
  if (lc) return `at line ${lc[1]}, column ${lc[2]}`
  const pos = m.match(/position (\d+)/)
  if (!pos) return /end of JSON input/i.test(m) ? 'unexpected end' : 'at an unexpected character'
  const before = raw.slice(0, Number(pos[1])).split('\n')
  return `at line ${before.length}, column ${before[before.length - 1].length + 1}`
}

// A value is echoed only after the credential checks pass, and only its harmless part (the path, the origin).
function checkBaseUrl(base, flagged, engineBase) {
  if (typeof base !== 'string' || !base) return say('ERROR', 'engineBaseUrl is missing: copy it from your kit (/engine)')
  if (flagged) return // already reported as a credential, never echoed
  const isPath = base.startsWith('/') && !base.startsWith('//')
  let u
  try { u = isPath ? new URL(base, 'http://proxy.invalid') : new URL(base) } catch {
    return say('ERROR', 'engineBaseUrl is neither a path nor a URL: copy it from your kit (/engine)')
  }
  const names = [...new URLSearchParams(u.search), ...new URLSearchParams(u.hash.slice(1))].map(([k]) => k)
  if (names.some(credentialParam)) return say('ERROR', 'engineBaseUrl carries a credential in its query or fragment')
  if (isPath) return say('OK', `engineBaseUrl is your proxy (${u.pathname})`)
  if (!/^https?:$/.test(u.protocol)) return say('ERROR', 'engineBaseUrl must be a path (/engine) or an http(s) URL to your own backend')
  const engine = engineHostOf(engineBase)
  if (engine && isEngineHost(u.hostname.toLowerCase(), engine)) return say('ERROR', 'engineBaseUrl points at Engine directly: point it at your backend proxy (/engine), which adds the Engine access token. Keep your Engine API key on the server')
  if (u.username || u.password) return say('ERROR', 'engineBaseUrl carries credentials: remove them')
  if (!engine) say('WARN', 'could not check that engineBaseUrl is not Engine (no valid ENGINE_BASE in .env): it must be your own backend, never Engine')
  if (u.protocol !== 'https:' && !LOCAL_HOST.test(u.hostname)) return say('WARN', 'engineBaseUrl is not HTTPS: the page needs a secure context')
  if (engine) say('OK', `engineBaseUrl is an absolute URL to your own backend (${u.origin})`)
}

// Engine's host is not written in this script: it comes from ENGINE_BASE in the project's .env (your kit). An absolute
// engineBaseUrl on that host, or anywhere in its zone (the parent domain, when it has at least two labels), is Engine.
function engineHostOf(base) {
  if (!base) return null
  try {
    const u = new URL(base)
    return /^https?:$/.test(u.protocol) && u.hostname ? u.hostname.toLowerCase() : null
  } catch { return null }
}
function isEngineHost(host, engine) {
  if (host === engine) return true
  const parent = engine.split('.').slice(1).join('.')
  return parent.split('.').length >= 2 && host.endsWith(`.${parent}`)
}

async function checkConfig() {
  const file = first(['neuro.config.json', 'public/neuro.config.json', 'src/neuro.config.json', 'static/neuro.config.json'])
  if (!file) return say('ERROR', 'neuro.config.json not found (looked in ., public/, src/ and static/): copy it from your kit')
  let cfg
  const raw = text(file)
  try { cfg = JSON.parse(raw) } catch (e) { return say('ERROR', `${file}: neuro.config.json is not valid JSON (${where(raw, e)})`) }
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) return say('ERROR', `${file}: neuro.config.json must be a JSON object`)
  say('OK', `found ${file}`)
  const leaks = []
  walk(cfg, '', leaks)
  for (const l of leaks) {
    if (l.what === 'value') say('ERROR', `neuro.config.json: a credential-shaped value at ${l.path}: the key lives only in your backend`)
    else say('ERROR', `neuro.config.json: a credential-named key at ${l.path}: this file ships to the browser; credentials live only in your backend`)
  }
  const flagged = new Set(leaks.map((l) => l.path))
  checkBaseUrl(cfg.engineBaseUrl, flagged.has('engineBaseUrl'), readEnv()?.env.ENGINE_BASE)
  const ctx = cfg.taxonomy?.contextId
  if (typeof ctx !== 'string' || !ctx) say('ERROR', 'taxonomy.contextId is missing: copy neuro.config.json from your kit (Measurement uses "measurement")')
  else if (flagged.has('taxonomy.contextId')) { /* already reported as a credential, never echoed */ }
  else if (!PLAIN_ID.test(ctx)) say('WARN', 'taxonomy.contextId does not look like a context id (letters, digits and _): copy it from your kit')
  else say('OK', `taxonomy.contextId: ${ctx}`)
  if (ctx === 'measurement') {
    if (cfg.triggerAnalysis === undefined) say('WARN', 'Measurement only measures: pass triggerAnalysis: false to captureProtocol')
    else if (cfg.triggerAnalysis !== false) say('ERROR', 'Measurement only measures: triggerAnalysis must be false')
    else say('OK', 'Measurement with triggerAnalysis: false')
  }
  checkOptionals(cfg, flagged.has('taxonomy.contextId') ? undefined : ctx)
  checkProcessing(cfg, flagged)
  // `processing` and triggerAnalysis are your app's keys, never part of the tenant config: strip them, as the starters do.
  const { processing: _p, triggerAnalysis: _t, ...tenant } = cfg
  await checkWithSdk(tenant)
}

// What a context may leave out, said as INFO (never a warning): the subcontext (Engine uses the context's default) and, in a
// context with voice steps, `transcribe` (the on-device SDK transcribes only with it; the recording starter ignores it and
// has `processing.transcribeSteps`). Measurement has no voice step, so it is not asked.
function checkOptionals(cfg, ctx) {
  if (typeof ctx !== 'string' || !ctx) return
  const t = cfg.taxonomy ?? {}
  const map = t.subcontextByMechanic
  if (!t.subcontextId && !(map && typeof map === 'object' && Object.keys(map).length)) say('INFO', "no subcontext set (taxonomy.subcontextId or taxonomy.subcontextByMechanic): Engine uses the context's default; it is optional")
  if (ctx !== 'measurement' && cfg.transcribe === undefined && cfg.processing === undefined) say('INFO', "`transcribe` is absent: the voice steps are not transcribed (add transcribe: { language: 'es' }, a language without a region, to transcribe on the device; it opens the microphone)")
}

// The recording starter's `processing` key: each job's language and the step types the processing service transcribes.
// Your backend sends them on every submit (Neurologyca's service requires language, like taxonomy.contextId).
const PLAIN_LANG = /^[a-z]{2}(-[A-Za-z]{2})?$/
const PLAIN_STEP = /^[a-z0-9_]{1,64}$/
function checkProcessing(cfg, flagged) {
  if (cfg.processing === undefined) return
  const p = cfg.processing
  if (!p || typeof p !== 'object' || Array.isArray(p)) return say('ERROR', 'processing must be an object: { "language": "en", "transcribeSteps": [] } (copy it from your recording starter)')
  if ([...flagged].some((f) => f.startsWith('processing'))) return // already reported as a credential, never echoed
  const extra = Object.keys(p).filter((k) => !['language', 'transcribeSteps'].includes(k))
  if (extra.length) say('WARN', `processing has ${extra.length} key(s) the starter does not use: only language and transcribeSteps travel with each job`)
  if (typeof p.language !== 'string' || !p.language) say('ERROR', "processing.language is missing: the session's language (en or es); Neurologyca's processing service requires it on every job")
  else if (!PLAIN_LANG.test(p.language)) say('WARN', 'processing.language does not look like a language code (en, es)')
  else say('OK', `processing.language: ${p.language}`)
  const steps = p.transcribeSteps
  if (steps === undefined) say('INFO', 'processing.transcribeSteps is absent: nothing is transcribed with the hosted service')
  else if (!Array.isArray(steps) || steps.some((x) => typeof x !== 'string' || !x)) say('ERROR', 'processing.transcribeSteps must be a list of step types (strings); [] transcribes nothing')
  else if (steps.some((x) => !PLAIN_STEP.test(x))) say('WARN', 'processing.transcribeSteps has an entry that does not look like a step type (letters, digits and _)')
  else say('OK', steps.length ? `processing.transcribeSteps: ${steps.join(', ')} (tell the people you record that their audio is transcribed)` : 'processing.transcribeSteps: [] (nothing is transcribed)')
}

async function checkWithSdk(cfg) {
  let entry
  try { entry = createRequire(join(dir, 'package.json')).resolve('@neurologyca/capture') } catch {
    return say('INFO', 'the SDK is not installed here: own rules only (run npm install, then run this again)')
  }
  let define
  try {
    const mod = await import(pathToFileURL(entry).href)
    define = mod.defineTenantConfig ?? mod.default?.defineTenantConfig
  } catch (e) { return say('INFO', `the SDK is installed but could not be loaded here (${e.message}): own rules only`) }
  if (typeof define !== 'function') return say('INFO', 'this SDK version has no defineTenantConfig: own rules only')
  try { define(cfg); say('OK', 'defineTenantConfig accepts it') } catch (e) { say('ERROR', `defineTenantConfig: ${e?.message ?? e}`) }
}

// The project's .env (., server/ or backend/), parsed; null when there is none.
function readEnv() {
  const file = first(['.env', 'server/.env', 'backend/.env'])
  if (!file) return null
  const env = {}
  for (const line of text(file).split('\n')) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)
    if (m) env[m[1]] = m[2].replace(/^(["'])(.*)\1$/, '$2')
  }
  return { file, env }
}

function checkEnv() {
  const read = readEnv()
  if (!read) {
    const example = first(['.env.example', 'server/.env.example', 'backend/.env.example'])
    return say('WARN', example ? `.env not found: copy ${example} to .env and fill ENGINE_API_KEY` : '.env not found (., server/ or backend/): copy .env.example from your kit')
  }
  const { file, env } = read
  const key = env.ENGINE_API_KEY
  if (!key) say('ERROR', `ENGINE_API_KEY: absent in ${file} (copy it from your DevLab account, or use the kit with your key)`)
  else if (!KEY_EXACT.test(key)) say('ERROR', `ENGINE_API_KEY: invalid format in ${file}`)
  else say('OK', 'ENGINE_API_KEY: present')
  const base = env.ENGINE_BASE
  if (!base) say('ERROR', 'ENGINE_BASE: absent (it is in your kit)')
  else {
    let u = null
    try { u = new URL(base) } catch { /* reported below, without the value */ }
    // An `@` before any `?` or `#` is userinfo even when the password has a `/` (the parser then sees a broken host).
    if (u?.username || u?.password || /^[a-z][a-z0-9+.-]*:\/\/[^?#]*@/i.test(base)) say('ERROR', 'ENGINE_BASE carries credentials: remove them (the key goes in ENGINE_API_KEY)')
    else if (!u || !/^https?:$/.test(u.protocol)) say('ERROR', 'ENGINE_BASE must be the absolute Engine URL from your kit, not your proxy path')
    else say('OK', 'ENGINE_BASE: present')
  }
  checkNarrativeLanguage(env.NARRATIVE_LANGUAGE)
  checkProcessorEnv(env)
}

// NARRATIVE_LANGUAGE (your kit, with a context protocol): the language of the interpretation, which your backend sets on
// each person it creates (createUser's narrative.language; without it Engine writes 'en'). A code without a region, like
// your kit's. The package does not validate it, so here only a warning; the value is echoed only when it is a plain code.
function checkNarrativeLanguage(v) {
  if (v === undefined) return
  if (/^[a-z]{2}$/.test(v)) return say('OK', `NARRATIVE_LANGUAGE: ${v}`)
  if (/^[a-z]{2}-[A-Za-z]{2}$/.test(v)) return say('WARN', 'NARRATIVE_LANGUAGE has a region: use the code without it, as your kit writes it (es, en)')
  say('WARN', 'NARRATIVE_LANGUAGE is not a language code: use the one of your kit (es, en), without a region')
}

// The recording (deferred) mode: only when the .env names the processing service. No value is ever echoed: the URL and the
// IP come from your kit, the key and the secret from your organization's admin team (DevLab: /account).
const PRIVATE_HOST = /^(localhost$|[^/]+\.localhost$|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.0\.0\.0$|\[(::1|f[cd][0-9a-f]{2}:|fe80:))/i
function checkProcessorEnv(env) {
  if (!['PROCESSOR_URL', 'PROCESSOR_API_KEY', 'PROCESSOR_SECRET', 'PUBLIC_BASE_URL'].some((n) => n in env)) return
  say('INFO', 'the .env names the processing service: checking the recording (deferred) mode')
  const url = env.PROCESSOR_URL
  if (!url) say('WARN', 'PROCESSOR_URL is empty: copy it from your kit (KIT.md, «Deferred processing»)')
  else {
    let u = null
    try { u = new URL(url) } catch { /* below */ }
    if (!u || u.protocol !== 'https:' || u.username || u.password) say('ERROR', 'PROCESSOR_URL must be the https URL from your kit, with no credentials')
    else say('OK', 'PROCESSOR_URL: present')
  }
  for (const n of ['PROCESSOR_API_KEY', 'PROCESSOR_SECRET']) {
    if (!env[n]) say('WARN', `${n} is empty: your organization's admin team has it in DevLab (/account → Deferred processing), or downloads the recording starter with «Include my key and the processor credentials»`)
    else say('OK', `${n}: present`)
  }
  if (env.PROCESSOR_SECRET && env.PROCESSOR_SECRET.length < 32) say('ERROR', 'PROCESSOR_SECRET is shorter than 32 characters: copy it again from DevLab (/account)')
  if (env.UPLOAD_URL_SECRET !== undefined) {
    if (!env.UPLOAD_URL_SECRET) say('WARN', 'UPLOAD_URL_SECRET is empty: generate one of at least 32 characters, yours alone')
    else if (env.UPLOAD_URL_SECRET.length < 32) say('ERROR', 'UPLOAD_URL_SECRET is shorter than 32 characters')
    else if (env.UPLOAD_URL_SECRET === env.PROCESSOR_SECRET) say('ERROR', 'UPLOAD_URL_SECRET and PROCESSOR_SECRET are the same: whoever has the processor secret could forge any video URL; generate a new UPLOAD_URL_SECRET')
    else say('OK', 'UPLOAD_URL_SECRET: present, different from PROCESSOR_SECRET')
  }
  const base = env.PUBLIC_BASE_URL
  if (!base) return say('WARN', "PUBLIC_BASE_URL is missing: your backend's public https origin, where Neurologyca's processing service calls the video, the token URL and the webhook (to test on your machine, a public HTTPS tunnel)")
  let b = null
  try { b = new URL(base) } catch { /* below */ }
  if (!b || b.protocol !== 'https:') return say('ERROR', 'PUBLIC_BASE_URL must be an https origin: the processing service never calls http:')
  if (b.username || b.password) return say('ERROR', 'PUBLIC_BASE_URL carries credentials: remove them')
  if (PRIVATE_HOST.test(b.hostname)) return say('ERROR', 'PUBLIC_BASE_URL is localhost or a private address: the processing service cannot reach it; use a public HTTPS tunnel or deploy')
  if (b.pathname !== '/' || b.search || b.hash) return say('ERROR', 'PUBLIC_BASE_URL must be an origin, with no path, query or fragment')
  say('OK', 'PUBLIC_BASE_URL: a public https origin')
}

try {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) say('ERROR', `project directory not found: ${dir}`)
  else {
    say('INFO', `checking ${dir} (neuro.config.json is for the SDK way; with the HTTP API only the .env checks apply)`)
    // The HTTP API way (a backend in any language): no neuro.config.json and no @neurologyca/capture. Only the .env counts.
    const pkg = (() => { try { return JSON.parse(text(join(dir, 'package.json'))) } catch { return null } })()
    // The SDK without npm (capture.global.js from a CDN or your own copy) is still the SDK way: look at the served HTML too.
    const pages = ['index.html', 'public/index.html', 'src/index.html', 'static/index.html'].map((r) => join(dir, r)).filter((p) => existsSync(p))
    const usesCdn = pages.some((p) => { try { return /capture\.global\.js|NeuroCapture\b/.test(text(p)) } catch { return false } })
    const usesSdk = usesCdn || !!(pkg?.dependencies?.['@neurologyca/capture'] || pkg?.devDependencies?.['@neurologyca/capture'])
    const hasConfig = !!first(['neuro.config.json', 'public/neuro.config.json', 'src/neuro.config.json', 'static/neuro.config.json'])
    if (!usesSdk && !hasConfig) say('INFO', 'no neuro.config.json and no @neurologyca/capture: the HTTP API way, so only the .env is checked')
    else await checkConfig()
    checkEnv()
  }
} catch (e) {
  say('ERROR', `could not finish the checks: ${e?.message ?? e}`)
}
console.log(`validate-config: ${errors} errors, ${warnings} warnings`)
process.exit(errors ? 1 : 0)
