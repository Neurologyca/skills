# Quickstart code, offline

The tested code of https://devlab.neurologyca.com/docs/start/quickstart.md (SDK tab), here so you can read it without network: a Measurement capture from the camera or from a video file of the user's. Each file here is run by DevLab's tests; change only what the comments say is yours.

## Contents

- Your backend: `server.mjs`
- Your page: `page.js`
- `index.html`
- Show the results
- Run it end to end, headless
- Next.js (App Router)
- Several steps with one video
- Bundler

## Your backend: `server.mjs`

It creates one person, enrols them in Measurement and mounts the proxy at `/engine`, the only place the key lives. Run it with `ENGINE_BASE` and `ENGINE_API_KEY` from the kit.

```js
// Your backend for the quickstart (Node 22.12+). It creates one person, enrols them in Measurement and proxies the
// browser's calls to Engine with your key, which only lives here.
//   ENGINE_BASE=<your Engine URL> ENGINE_API_KEY=<your key> node server.mjs
import http from 'node:http'
import { readFile } from 'node:fs/promises'
import { createEngineAdmin, createTokenSource, createEngineProxy, ownsAll } from '@neurologyca/capture-server'
import { toNodeListener } from '@neurologyca/capture-server/node'

const { ENGINE_BASE, ENGINE_API_KEY, PORT = '3000' } = process.env
if (!ENGINE_BASE || !ENGINE_API_KEY) throw new Error('Set ENGINE_BASE (your environment\'s Engine URL, in your kit) and ENGINE_API_KEY')

// 1. One person and their enrolment. In your app: your signed-in user, and the pair saved in your database.
const admin = createEngineAdmin({ baseUrl: ENGINE_BASE, apiKey: ENGINE_API_KEY })
const measurement = (await admin.listProtocolLibrary()).find((p) => p.name === 'Measurement' && p.status === 'published')
if (!measurement) {
  console.error('Your environment does not offer the Measurement protocol yet. Ask Neurologyca, or use the cURL tab with another protocol.')
  process.exit(1)
}
const { externalId } = await admin.createUser({ name: 'quickstart-user' }) // the package generates an opaque UUID
const { userProtocolId } = await admin.enrol(externalId, measurement.pid)
const next = await admin.getNextPosition(userProtocolId)
if (!next) throw new Error('The enrolment has no position to capture')
const pair = { userProtocolId, protocolMechanicId: next.protocolMechanicId }
console.log(`Person ${externalId} enrolled in Measurement. Each start creates one: delete it when you are done (irreversible), with ENGINE_BASE and ENGINE_API_KEY set as for server.mjs:
  node --input-type=module -e "import { createEngineAdmin } from '@neurologyca/capture-server'; await createEngineAdmin({ baseUrl: process.env.ENGINE_BASE, apiKey: process.env.ENGINE_API_KEY }).deleteUser('${externalId}')"`)

// 2. The proxy: the browser calls /engine/* with no token and the proxy adds yours. ownsAll checks every id a route
// carries: here, only this person's enrolment.
const tokens = createTokenSource({ baseUrl: ENGINE_BASE, apiKey: ENGINE_API_KEY })
const engine = toNodeListener(createEngineProxy({
  baseUrl: ENGINE_BASE,
  tokens,
  mountPath: '/engine',
  authorize: async (_req, route) => ownsAll(route, {
    userProtocol: async (up) => up === pair.userProtocolId,
    user: async (userId) => userId === externalId,
  }),
}))

// 3. The page, its bundle and the pair.
const files = new Map([['/', ['index.html', 'text/html']], ['/page.js', ['public/page.js', 'text/javascript']]])
const server = http.createServer(async (req, res) => {
  const url = req.url ?? '/'
  if (url.startsWith('/engine/')) return engine(req, res) // before any body parser
  if (url === '/pair') {
    res.writeHead(200, { 'content-type': 'application/json' })
    return res.end(JSON.stringify(pair))
  }
  const file = files.get(url)
  if (!file) { res.writeHead(404); return res.end() }
  res.writeHead(200, { 'content-type': file[1] })
  res.end(await readFile(new URL(file[0], import.meta.url)))
})
server.listen(Number(PORT), () => {
  const { port } = /** @type {import('node:net').AddressInfo} */ (server.address())
  console.log(`Open http://localhost:${port}`)
})
```

## Your page: `page.js`

One client per page, prepared once before the click; the capture starts only from the person's click, after consent. With a video file, give the `<video>` its `src` before capturing and rewind it once the capture starts.

```js
// Your page: a short Measurement capture with the SDK, from the camera or from a video file of yours.
// Bundle it for the browser: npx esbuild page.js --bundle --format=esm --outfile=public/page.js
import { createProtocolClient, classifyMediaError } from '@neurologyca/capture'

const out = /** @type {HTMLPreElement} */ (document.querySelector('#out'))
const video = /** @type {HTMLVideoElement} */ (document.querySelector('#video'))
const picker = /** @type {HTMLInputElement} */ (document.querySelector('#file'))
const cancel = /** @type {HTMLButtonElement} */ (document.querySelector('#cancel'))

// One client for the whole page, created when it loads and reused for every capture.
const client = createProtocolClient({
  baseUrl: '/engine', // your backend proxy: it adds the Engine access token
  keepPrepared: true, // what prepare() loaded survives a capture: measure again without preparing in between
  taxonomy: { contextId: 'measurement' }, // Measurement: any value; required by the SDK, though Measurement does not send it (0.29.0)
  startup: { includeUserAgent: false }, // the startup report stays in the SDK: no user agent, and nothing is sent anywhere
  // The SDK's own words for each startup stage of a capture (userMessage), ready to show.
  onStartupStage: (e) => { if (e.kind === 'capture' && e.userMessage) out.textContent = e.userMessage },
  onWarning: (w) => console.warn(w.code, w.message),
  onError: (e) => { out.textContent = `${e.code}: ${e.message}` }, // a failure mid-capture (a 409, a lost session): its cause
})
// Prepare once, before the first click, so Start does not wait for the face model. It never calls Engine and asks for no
// permission. With keepPrepared the models stay between captures: no prepare() after one. It does not reject on a failed
// load (the capture then loads it itself). The SDK releases what it kept when the page goes away (pagehide): you do not
// listen for it. Call client.release() only when you drop the client, or between one person and the next.
const prepare = () => { client.prepare().catch((e) => console.warn(e.code, e.message)) }
prepare()

document.querySelector('#start')?.addEventListener('click', async () => {
  out.textContent = 'Capturing…'
  // Cancel: before the capture starts, the signal cuts the start; once it runs, session.abort() ends it.
  const stopper = new AbortController()
  /** @type {Awaited<ReturnType<typeof client.captureProtocol>> | null} */
  let session = null
  cancel.disabled = false
  cancel.onclick = () => { stopper.abort(); void session?.abort().catch(() => { /* already over */ }) }
  try {
    // The pair comes from your backend (it enrolled the person), never from the browser.
    const { userProtocolId, protocolMechanicId } = await (await fetch('/pair')).json()
    const file = picker.files?.[0]
    video.srcObject = null // an earlier camera run left its stream here, and it would hide your video
    if (file) video.src = URL.createObjectURL(file) // a video of yours: give it its src BEFORE capturing
    session = await client.captureProtocol({
      captureId: crypto.randomUUID(), // yours: it joins this capture's warnings and startup report
      userProtocolId,
      protocolMechanicId,
      source: file ? { type: 'video', el: video } : { type: 'webcam' },
      signal: stopper.signal,
      // Your video: play it now (muted, so it plays on its own). The camera: show the SDK's preview in your <video>.
      onStarted: (preview) => { if (!file) video.srcObject = preview.srcObject; video.play().catch((e) => { out.textContent = String(e) }) },
      triggerAnalysis: false, // Measurement: nothing to interpret. SDK 0.29.0 skips it when Engine returns interpreted: false; keep it until yours does
    })
    const [step] = session.plan.steps // Measurement has one step, of 6 s or more
    if (file) video.currentTime = 0 // the SDK loaded its model meanwhile: rewind so no second of your file is lost
    await session.step(step.order).run({ durationMs: 15_000 }) // a shorter video ends it earlier
    const outcome = await session.stop()
    console.log(outcome)
    out.textContent = JSON.stringify(outcome, null, 2)
  } catch (e) {
    // classifyMediaError names the cause: insecure-context (not HTTPS or localhost), denied, no-device, in-use, no-frames…
    const err = /** @type {Error & { code?: string }} */ (e)
    out.textContent = stopper.signal.aborted ? 'Cancelled.' : `${classifyMediaError(e) ?? err.code ?? err.name}: ${err.message}`
    await session?.abort().catch(() => { /* already over */ })
  } finally {
    cancel.onclick = null
    cancel.disabled = true
  }
})
```

## `index.html`

```html
<!doctype html>
<html lang="en">
<meta charset="utf-8">
<title>Quickstart: Measurement with the SDK</title>
<p><label>Optional, a video of yours with a face: <input id="file" type="file" accept="video/*"></label></p>
<video id="video" muted playsinline width="320"></video>
<p><button id="start">Start</button> <button id="cancel" disabled>Cancel</button></p>
<pre id="out"></pre>
<script type="module" src="/page.js"></script>
</html>
```

## Show the results

The quickstart is Measurement, which returns indicator values without an interpretation (`interpretation: null`). With an interpreted protocol, paint **everything** that arrives, not just the indicators or the interpretation's text: never put `interpretation` on the page as plain text (it is Markdown, and `structured` carries the summary and the sections). These modules are DevLab's tested rule, the same as the playground's. **Copy the four files whole, with these names, and delete nothing** (each piece paints only when it arrives, so nothing is dead code for another protocol):

- `show-results.mjs`: what to show (`indicatorsToShow`, `interpretationToShow`);
- `group-by-question.mjs`: the results per question, from `pairs[]` and `speech`;
- `show-results-page.mjs`: paints it all into one element, with `textContent` only;
- `show-results-wiring.js`: `resultHandlers({ root, PUBLIC, keep })`, the `onResult` and `onInterpretation` you spread into `createProtocolClient({ …, ...resultHandlers({ root, PUBLIC, keep }) })`.

`root` is the element that shows the results. `PUBLIC` is the public list of SKILL.md (step 6) as `{ key, name }`: the key exactly as written, the name in brackets without «Preview» (the key itself when there is none). `keep` is yours: it receives `{ userProtocolId, protocolMechanicId, status, audienceApplied }`; send it to a route of your backend that saves it next to the person, so you can read the interpretation again for free.

What the page shows, in order: the indicators as soon as `onResult` comes (the interpretation can take minutes), the relevant ones of the context first once the interpretation names them; a notice when the reading is `degraded` (with `failed` nothing is shown as a result, the indicators still hold); the summary; the main emotion; the 0 to 100 index when your domain has one; who it was written for («Default reading» without `audience_applied`); the reading by its sections (or the Markdown, painted as text); and the results per question, with what the person said, only on that person's page. `speech` reaches `onResult`'s `raw` only in the test environment's Engine; from your backend it is `getResults().speech`.

```js
// What to show when the indicators and the interpretation arrive (guides/show-results), with no DOM: paint what these
// return with textContent (and the Markdown with a renderer that drops raw HTML). Never log what they return: the
// summary, the sections and the transcript are what the person said and what was read in them.
// PUBLIC: the public indicators of concepts/results, each { key, name } (the key exactly as /results sends it).

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '')
const isObj = (x) => typeof x === 'object' && x !== null && !Array.isArray(x)
const str = (x) => (typeof x === 'string' && x.trim() ? x.trim() : null)

// The indicators, from onResult's `hcis` (or `hcisByStep[order]`): only the public ones that arrived, in the order of
// PUBLIC. A missing key was not received (your context, your agreement), never a zero: leave it out.
export function indicatorsToShow(hcis, PUBLIC) {
  const values = isObj(hcis) ? hcis : {}
  return PUBLIC.filter((h) => typeof values[h.key] === 'number' && Number.isFinite(values[h.key]))
    .map((h) => ({ key: h.key, name: h.name, value: values[h.key] }))
}

// The interpretation, from onInterpretation's event ({ interpretation, structured, metadata, raw }). `structured` is the
// interpretation's structured_data; readScoreIndex comes from '@neurologyca/capture' (pass it in, the key of your
// domain's index as indexKey). Returns null when there is nothing to show as a result.
/**
 * @param {any} event onInterpretation's event
 * @param {{ key: string, name: string }[]} PUBLIC
 * @param {{ readScoreIndex?: (structured: unknown, key?: any) => any, indexKey?: string }} [options]
 */
export function interpretationToShow(event, PUBLIC, { readScoreIndex, indexKey = 'wellness_index' } = {}) {
  const status = str(event?.metadata?.status)
  // failed never reaches onInterpretation (the page gets E_ANALYSIS_FAILED), but never show one as a result
  if (status !== 'complete' && status !== 'degraded') return null
  const sd = isObj(event.structured) ? event.structured : {}
  const sections = (Array.isArray(sd.sections) ? sd.sections : []).filter(isObj)
    .map((s) => ({ key: str(s.key), title: str(s.title) ?? '', body: str(s.body) ?? '', severity: str(s.severity) }))
    .filter((s) => s.title || s.body)
  const raw = isObj(event.raw) ? event.raw : {}
  const applied = 'audience_applied' in raw ? raw.audience_applied : isObj(raw.payload) ? raw.payload.audience_applied : undefined
  return {
    status, // 'degraded': show it, with a notice that the reading is less reliable
    // The summary first: insight, else headline, else the first section (some readings have no headline by design)
    summary: str(sd.insight) ?? str(sd.headline) ?? sections[0]?.body ?? null,
    // The whole reading, ONE of the two: your own layout of the sections (match by key, never by title), or the Markdown
    reading: sections.length ? { sections } : { markdown: str(event.interpretation) ?? '' },
    // A 0 to 100 index, only if your domain publishes one: value and label as they come; no number with not_shown
    index: readScoreIndex ? readScoreIndex(sd, indexKey) : null,
    // Who it was written for: the audience Engine applied (an echo, not proof); null: the default reading
    audienceApplied: typeof applied === 'string' ? applied : null,
    // Preview fields, only when they arrive (the page works without them)
    primaryEmotion: str(sd.primary_emotion?.term), // a catalogue term in English: show it as it comes
    relevant: relevantOf(sd.selected_ehcis, PUBLIC), // first among the indicators, whole-session values
    pairs: Array.isArray(sd.pairs) ? sd.pairs : [], // results per question: groupByQuestion({ pairs, speech, orders })
  }
}

// selected_ehcis[]: the indicators the context declares relevant, in its order, with the whole-session measured_value.
// The id is not the /results key: match it with the key or the name, ignoring case and anything not a letter or digit
// (stress_intensity → Stress intensity, key Stress_intens). Only public ones: Motivation and the four that need
// previous sessions are not in PUBLIC, so they drop out here.
function relevantOf(list, PUBLIC) {
  const out = [], seen = new Set()
  for (const e of Array.isArray(list) ? list : []) {
    if (!isObj(e) || typeof e.id !== 'string' || typeof e.measured_value !== 'number') continue
    const h = PUBLIC.find((p) => norm(p.key) === norm(e.id) || norm(p.name) === norm(e.id))
    if (!h || seen.has(h.key)) continue
    seen.add(h.key)
    out.push({ key: h.key, name: h.name, value: e.measured_value })
  }
  return out
}
```

```js
// Groups one session's steps by question. pairs: structured_data.pairs of POST /analyze
// (Preview); speech: from GET /results; orders: the steps read, e.g.
// Object.keys(aggResults). Each group: steps (order and role: question, answer, opening,
// closing or single), questionText, transcript and answerOrder (the answer's step).
export function groupByQuestion({ pairs = [], speech = null, orders }) {
  orders = orders.map(Number)
  const ok = (x) => Number.isInteger(x) && x >= 1
  const have = new Set(orders), used = new Set(), out = []
  const sp = (o) => speech?.[String(o)] ?? {}
  const st = (order, role) => ({ order, role })
  const add = (steps, questionText, transcript, answerOrder) =>
    out.push({ steps, questionText, transcript, answerOrder })
  for (const p of Array.isArray(pairs) ? pairs : []) {
    const c = p?.windows?.closing?.order
    const prev = p?.status === 'incomplete' && ok(c) && c > 1 &&
      Array.isArray(p.notes) && p.notes.includes('question_from_preceding_step')
    const o = prev ? c - 1 : p?.windows?.opening?.order
    if (!ok(p?.index) || (!prev && p.status !== 'complete')) continue
    if (!ok(o) || !ok(c) || o > c) continue
    if (!have.has(o) || !have.has(c) || used.has(o) || used.has(c)) continue
    used.add(o); used.add(c)
    const roles = speech ? ['question', 'answer'] : ['opening', 'closing']
    add([st(o, roles[0]), st(c, roles[1])],
      sp(o).questionText ?? null, sp(c).transcript ?? null, c)
  }
  const rest = speech ? orders.filter((o) => !used.has(o)).sort((a, b) => a - b) : []
  for (let k = 0; k < rest.length; k++) {
    const o = rest[k], next = rest[k + 1], q = sp(o).questionText, t = sp(o).transcript
    if (q && (t || orders.length === 1)) add([st(o, 'single')], q, t ?? null, o)
    else if (q && next === o + 1 && ((sp(next).transcript && !sp(next).questionText) ||
        sp(next).questionText === q)) {
      add([st(o, 'question'), st(next, 'answer')], q, sp(next).transcript ?? null, next)
      k++
    } else if (q) add([st(o, 'question')], q, null, null)
    else if (t) add([st(o, 'answer')], null, t, o)
  }
  out.sort((a, b) => a.steps[0].order - b.steps[0].order)
  return out.map((g, i) => ({ n: i + 1, ...g }))
}
```

```js
// Paint everything that arrives into one element of your page, with the rules of show-results.mjs and
// group-by-question.mjs (copy the three modules whole). Only textContent: no text from Engine becomes HTML.
// Call paintIndicators from onResult and paintInterpretation from onInterpretation; questions come from your backend
// (getResults().speech, only in the test environment's Engine) or from onResult's raw.speech.
import { indicatorsToShow, interpretationToShow } from './show-results.mjs'
import { groupByQuestion } from './group-by-question.mjs'

const el = (tag, text, cls) => { const n = document.createElement(tag); if (text != null) n.textContent = String(text); if (cls) n.className = cls; return n }
const fmt = (v) => (Math.round(v * 100) / 100).toString()

// The indicators, as soon as they arrive (the interpretation can take minutes). Relevant ones go first once the
// interpretation names them: call it again with view.relevant.
export function paintIndicators(root, hcis, PUBLIC, relevant = []) {
  const box = root.querySelector('.indicators') ?? root.appendChild(el('section', null, 'indicators'))
  const first = new Set(relevant.map((r) => r.key))
  const rows = indicatorsToShow(hcis, PUBLIC)
  box.replaceChildren(el('h2', 'Indicators'))
  if (relevant.length) {
    box.append(el('h3', 'Relevant in this context · whole session'))
    for (const r of relevant) box.append(el('p', `${r.name}: ${fmt(r.value)}`, 'relevant'))
  }
  for (const h of rows) if (!first.has(h.key)) box.append(el('p', `${h.name}: ${fmt(h.value)}`, 'indicator'))
}

// The interpretation. Returns what your backend keeps next to the pair (status and audience), or null.
/**
 * @param {HTMLElement} root
 * @param {any} event onInterpretation's event
 * @param {{ key: string, name: string }[]} PUBLIC
 * @param {{ readScoreIndex?: (structured: unknown, key?: any) => any, indexKey?: string, hcis?: Record<string, number | null>, speech?: unknown, orders?: string[] }} [options]
 */
export function paintInterpretation(root, event, PUBLIC, { readScoreIndex, indexKey, hcis, speech = null, orders = [] } = {}) {
  const view = interpretationToShow(event, PUBLIC, { readScoreIndex, indexKey })
  const box = root.querySelector('.reading') ?? root.appendChild(el('section', null, 'reading'))
  box.replaceChildren()
  if (!view) return null // nothing to show as a result; the indicators still hold
  if (hcis) paintIndicators(root, hcis, PUBLIC, view.relevant)
  if (view.status === 'degraded') box.append(el('p', 'This reading is partial: take it as less reliable.', 'notice'))
  if (view.summary) box.append(el('p', view.summary, 'summary'))
  if (view.primaryEmotion) box.append(el('p', `Main emotion: ${view.primaryEmotion}`, 'emotion'))
  if (view.index && view.index.status !== 'not_shown') box.append(el('p', `${view.index.label ?? ''} ${view.index.value ?? ''}`.trim(), 'index'))
  box.append(el('p', view.audienceApplied ? `Written for: ${view.audienceApplied}` : 'Default reading', 'audience'))
  if (view.reading.sections) {
    for (const s of view.reading.sections) {
      const sec = el('article', null, `section ${s.key ?? ''}`.trim())
      if (s.title) sec.append(el('h3', s.title))
      paintMarkdown(sec, s.body)
      box.append(sec)
    }
  } else paintMarkdown(box, view.reading.markdown)
  const questions = groupByQuestion({ pairs: view.pairs, speech, orders })
  if (questions.length) {
    const q = el('section', null, 'questions')
    q.append(el('h3', 'Per question'))
    for (const g of questions) {
      const item = el('article', null, 'question')
      item.append(el('h4', g.questionText ?? `Steps ${g.steps.map((s) => s.order).join(' and ')}`))
      if (g.transcript) item.append(el('p', g.transcript, 'said')) // what the person said: only on their own page
      q.append(item)
    }
    box.append(q)
  }
  return { status: view.status, audienceApplied: view.audienceApplied }
}

// A small Markdown painter with no HTML at all: headings, bullets and paragraphs, each as textContent (bold and links
// stay as their plain text). Use your own renderer only if it drops raw HTML.
export function paintMarkdown(parent, md) {
  for (const block of String(md ?? '').split(/\n\s*\n/)) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean)
    if (!lines.length) continue
    const plain = (s) => s.replace(/\*\*|__|`/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    if (lines.every((l) => /^[-*] /.test(l))) {
      const ul = el('ul')
      for (const l of lines) ul.append(el('li', plain(l.slice(2))))
      parent.append(ul)
      continue
    }
    for (const l of lines) {
      const h = /^(#{1,6})\s+(.*)$/.exec(l)
      parent.append(h ? el('h4', plain(h[2])) : el('p', plain(l)))
    }
  }
}
```

```js
// Wire the three modules into your client: spread what resultHandlers returns into createProtocolClient({ … }).
// keep is yours: it sends what your backend keeps next to the pair (to read the interpretation again for free).
import { readScoreIndex } from '@neurologyca/capture'
import { paintIndicators, paintInterpretation } from './show-results-page.mjs'

/**
 * @typedef {{ userProtocolId: string, protocolMechanicId: string, status: string, audienceApplied: string | null }} Kept
 * @param {{ root: HTMLElement, PUBLIC: { key: string, name: string }[], keep: (kept: Kept) => void, indexKey?: string }} o
 * @returns {Pick<import('@neurologyca/capture').ProtocolClientConfig, 'onResult' | 'onInterpretation'>}
 */
export function resultHandlers({ root, PUBLIC, keep, indexKey }) {
  /** @type {import('@neurologyca/capture').ProtocolResultEvent | null} */
  let last = null
  return {
    // The indicators first: the interpretation can take minutes.
    onResult: (r) => { last = r; paintIndicators(root, r.hcis, PUBLIC) },
    onInterpretation: (event) => {
      const same = last && last.userProtocolId === event.userProtocolId && last.protocolMechanicId === event.protocolMechanicId ? last : null
      const raw = /** @type {{ speech?: unknown } | null} */ (same?.raw ?? null)
      const kept = paintInterpretation(root, event, PUBLIC, {
        readScoreIndex,
        indexKey,
        hcis: same?.hcis,
        speech: raw?.speech ?? null, // only in the test environment's Engine; from your backend, getResults().speech
        orders: Object.keys(same?.hcisByStep ?? {}),
      })
      if (kept) keep({ userProtocolId: event.userProtocolId, protocolMechanicId: event.protocolMechanicId, ...kept })
    },
  }
}
```

## Run it end to end, headless

To check a capture before handing over, drive the page with a browser you can automate (Playwright with `channel: 'chrome'`, or `puppeteer-core` with the installed Chrome), launched with `--autoplay-policy=no-user-gesture-required` and a video file as the source. Keep the harness out of the project, or in a git-ignored folder, and expose from the page only statuses and counts for it to read (for example `window.__capture = { status, frames, indicators, interpretationStatus, sections }`), never texts. Start the backend on a free port: if another app already listens on it, `doctor` reports an unexpected 404 through your proxy.

## Next.js (App Router)

In a Next.js app the proxy is a route handler, `app/engine/[...path]/route.js`, mounted at `/engine` like `server.mjs`'s (the page's `engineBaseUrl: '/engine'` does not change). It runs on the Node.js runtime, reads the key from the server's environment (in `.env` (or `.env.local`), never a `NEXT_PUBLIC_` variable) and authorizes only the signed-in user's enrolment through `pairOf`, yours: return the `userProtocolId` and `externalId` you saved for that user, or `null`. Create the person and the enrolment in your own server code, as `server.mjs` does with `createEngineAdmin`. The route handler gets the raw request, so no body parser caps the frame batches; the proxy applies its own `maxBodyBytes`. It also keeps Engine's event stream open for the whole capture, which a serverless function's maximum duration cuts: run the app on a long-running Node.js server (`next start` in a container, a VPS, Cloud Run), not as functions that time out (https://devlab.neurologyca.com/docs/api/proxy.md, «Serverless functions»). The page code is the same as `page.js`, run only in the browser: a Client Component (`'use client'`) that creates the client once in an effect and calls `client.release()` in its cleanup (React's StrictMode runs effects twice in development, and a client dropped without `release()` keeps its models until the page goes away).

```js
// app/engine/[...path]/route.js: the same proxy as server.mjs in a Next.js App Router route handler. The browser calls
// /engine/* with no token and the proxy adds yours; the key lives only on the server: ENGINE_BASE and ENGINE_API_KEY
// in .env (or .env.local), never NEXT_PUBLIC_*.
import { createTokenSource, createEngineProxy, ownsAll } from '@neurologyca/capture-server'
// Yours: the enrolment of the signed-in user, from your session and your database ({ userProtocolId, externalId }, or null).
import { pairOf } from '../../../lib/pairs.js'

export const runtime = 'nodejs' // the proxy needs Node.js, not the Edge runtime

// Created on the first request, not on import: `next build` imports this file, where the environment may not be set.
/** @type {((req: Request) => Promise<Response>) | undefined} */
let proxy
function engineProxy() {
  const { ENGINE_BASE, ENGINE_API_KEY } = process.env
  if (!ENGINE_BASE || !ENGINE_API_KEY) throw new Error('Set ENGINE_BASE (your environment\'s Engine URL, in your kit) and ENGINE_API_KEY')
  return createEngineProxy({
    baseUrl: ENGINE_BASE,
    tokens: createTokenSource({ baseUrl: ENGINE_BASE, apiKey: ENGINE_API_KEY }),
    mountPath: '/engine',
    // ownsAll checks every id a route carries: only the signed-in user's enrolment and person.
    authorize: async (req, route) => {
      const pair = await pairOf(req)
      return pair !== null && ownsAll(route, {
        userProtocol: async (up) => up === pair.userProtocolId,
        user: async (userId) => userId === pair.externalId,
      })
    },
  })
}
/** @param {Request} req */
const handler = (req) => (proxy ??= engineProxy())(req)
// The proxy's routes use these three methods. The route handler gets the raw body: no body parser caps it.
export { handler as GET, handler as POST, handler as PATCH }
```

## Several steps with one video

Measurement has one step, and the video's end closes it. With a protocol of several steps and one video for all of them, set `video.loop = true` (a looping video never ends) and close each step at the first of: its minimum reached and the user's «Next» (`session.stepTiming().minReached`), or its maximum (`describeStep(step).maxSeconds`). Pause the video after the last `end()`. In an automated test, with no one to press «Next», run each step with `session.step(order).run({ durationMs })` and a duration between `describeStep(step).minSeconds` and `maxSeconds` (either may be `null`: no bound on that side). A step with no text of its own keeps the previous one on screen (an answer step keeps its question): https://devlab.neurologyca.com/docs/sdk/steps.md. With a recorded voice as the source, start the speech with the step that expects it (`describeStep(step).expectsSpeech === 'yes'`, rewinding the video there): what is said during the question's step is transcribed into that step.

## Bundler

With `@neurologyca/capture` 0.46.1 no bundler setting is needed: any bundler (esbuild, Vite, webpack) with its defaults works. An old `minifyIdentifiers: false` in a Vite or esbuild config is no longer necessary.
