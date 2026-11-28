# Startup screen and preparing before Start

Verified with `@neurologyca/capture` 0.46.1. The five ways to load the models, with the same tested code: https://devlab.neurologyca.com/docs/guides/load-models.md. The detail of the startup: https://devlab.neurologyca.com/docs/sdk/on-device.md («The startup screen», «Prepare before Start» and «Keep the models between captures»), the caps in https://devlab.neurologyca.com/docs/guides/timeouts.md and the codes in https://devlab.neurologyca.com/docs/sdk/errors.md. Whether a device can measure and transcribe at all: [choose-mode-and-device.md](choose-mode-and-device.md). Never invent an option: `createProtocolClient` throws `E_UNKNOWN_OPTION` for any key it does not have, also inside `startup`.

## Contents

- [Which way to choose](#which-way-to-choose)
- [The five ways](#the-five-ways)
- [Checking it in the app](#checking-it-in-the-app)
- [The startup screen](#the-startup-screen)
- [Preparing before Start](#preparing-before-start)
- [Keeping the models between captures](#keeping-the-models-between-captures)
- [The startup report](#the-startup-report)

## Which way to choose

Nothing is required: without preparing, the capture fetches what it needs when it starts, and preparing only moves that wait to a moment when the user is busy with something else (on-device mode only; a deferred recording, Preview, downloads nothing). Take the first case that applies:

- One device shared by a queue of users: E, with `client.release()` at each change of user.
- A baseline plus measurements of one user: E. The baseline adopts the prepared face and leaves speech for the measurement.
- Transcription, once the user has agreed to it: C. Speech is about 170 MB the first time, on their data plan.
- An earlier page on the same origin (landing, waiting room): D, which only warms the browser's cache.
- A screen before Start (a form, the instructions, the consent): B.
- Otherwise: A.

What changes it, whatever the case: on Safari and iOS only the face is fetched ahead and kept (`transcription: 'not-prepared'`, `partialReason: 'speech-not-prepared'`, not a failure), and speech comes at the start. Without WebGPU, transcription is refused unless the client allows the slower `transcribe.allowWasmWorker`; where it is refused, prepare the face only, and with E do not call `prepare()` again later (each call releases the kept face and fetches it again). With data saver on, B for the face and speech only at Start. Two tabs are two pages, each with its own client and its own copy; they share only the browser's cache.

## The five ways

From least to most work. In every block `/engine` is your backend's proxy (the browser never sees the key) and `your_context_id` is the `contextId` of the kit; with a kit, build the client with `createProtocolClient({ tenant: defineTenantConfig(json) })` instead.

### A · No `prepare()`

**When:** one session, with no hurry about the startup. **Gains:** no call at all. **Costs:** the wait, visible, until the first frame. Paint the startup screen (below).

```js
// A · Without preparing: the capture loads the models when it starts, and the person waits until the first frame.
import { createProtocolClient } from '@neurologyca/capture'

// /engine is your backend's proxy: the browser never sees the key. Replace your_context_id with the contextId of your kit.
const client = createProtocolClient({ baseUrl: '/engine', taxonomy: { contextId: 'your_context_id' } })

/** @param {{ userProtocolId: string, protocolMechanicId: string }} pair from your backend */
export async function measure(pair) {
  const session = await client.captureProtocol({ ...pair, source: { type: 'webcam' } })
  // … the session's steps …
  return session.stop() // CaptureOutcome
}
```

### B · `prepare()` on the screen before

**When:** a form or instructions before measuring. **Gains:** the face model is ready when the person presses Start; the capture of the same client adopts it with no option. **Costs:** the model comes from a third-party CDN, which sees the IP before anything is measured, even if the person never measures. If they leave without measuring, `client.release()`. The `prepare()` goes where the screen is shown, never in the handler of the Start button (there it would only add the wait it is meant to hide).

```js
// B · Prepare on the previous screen: the face model loads while the person fills in a form or reads the instructions.
import { createProtocolClient } from '@neurologyca/capture'

const client = createProtocolClient({ baseUrl: '/engine', taxonomy: { contextId: 'your_context_id' } })

// When the form or the instructions show. The face only: no permission and no call to Engine.
// Note: the model comes from a third-party CDN, which sees the IP, even if the person never measures.
export function onInstructionsShown() {
  void client.prepare({ models: { face: true } })
}

/** On Measure, the capture adopts the face model already loaded, with no option. @param {{ userProtocolId: string, protocolMechanicId: string }} pair */
export async function onMeasure(pair) {
  const session = await client.captureProtocol({ ...pair, source: { type: 'webcam' } })
  // … the session's steps …
  return session.stop()
}

// If the person leaves this view without measuring: what was prepared stays in memory until you release it.
export function onLeave() {
  client.release()
}
```

### C · `models: { speech: true }` after consent

**When:** with transcription. **Gains:** speech loads after your consent screen, while the person reads what comes next. **Costs:** about 170 MB the first time; after that, from the browser's cache. `prepare()` does not ask for the microphone, so nothing in the browser warns about that download: your consent is the only one. On Safari and iOS speech is not prepared and loads at the start: `estimatedSpeechMs` (a guide that tends to come out high; `null` when it cannot be estimated) lets you warn about that wait; with `transcription: 'unavailable'` the device will not transcribe, and there is no wait to announce.

```js
// C · Speech after consent: a large download on the person's data plan, only once they have said yes.
import { createProtocolClient } from '@neurologyca/capture'

// Speech needs transcription configured on the client.
const client = createProtocolClient({
  baseUrl: '/engine', taxonomy: { contextId: 'your_context_id' }, transcribe: { language: 'en' },
})

/**
 * Called by the «I agree» of your consent screen, never before. prepare() does not ask for the microphone: the capture
 * does, when it starts.
 * @param {(ms: number) => void} showWaitingNote your screen: a note that speech will still take a while at the start
 */
export async function onConsentAccepted(showWaitingNote) {
  const prepared = await client.prepare({ models: { face: true, speech: true } })
  // Not ready ahead, but the capture will load it at the start (Safari and iOS, a slow network); never with 'unavailable'.
  // The estimate tends to come out high; null when it cannot be estimated.
  const speechLater = prepared.transcription === 'not-prepared' || prepared.transcription === 'failed'
  if (speechLater && prepared.estimatedSpeechMs !== null) showWaitingNote(prepared.estimatedSpeechMs)
  return prepared
}
```

### D · `prepareCapture({ level: 'cache' })` on another page

**When:** a landing page or a waiting room on the same origin. **Gains:** the files reach the browser's cache before the capture page; it pays off above all for speech. **Costs:** nothing stays in memory, so the capture still creates the models when it starts. Both pages must read the same configuration object (one shared module), or the capture downloads again what does not match.

```js
// D · Warm the cache on an earlier page of the same origin: the files reach the browser's cache, nothing stays in memory.
import { captureCacheStatus, prepareCapture } from '@neurologyca/capture'

// capture-config: one module both pages import, so the files warmed are the ones the capture asks for.
// No baseUrl or taxonomy: there is no client on this page (they would throw E_UNKNOWN_OPTION).
/** @type {import('@neurologyca/capture').CaptureCacheStatusOptions} */
export const captureConfig = { transcribe: { language: 'en' } }

// On the landing page or the waiting room.
export async function warmTheCache() {
  const status = await captureCacheStatus(captureConfig)
  if (status.speechWeights !== 'cached') {
    await prepareCapture({ ...captureConfig, level: 'cache', prepare: { face: true, speech: true } })
  }
}

// On the capture page: the same config, plus what only a client has.
// createProtocolClient({ ...captureConfig, baseUrl: '/engine', taxonomy: { contextId: 'your_context_id' } })
```

### E · `keepPrepared: true`

**When:** a baseline and then measurements, or one device for a queue of users. **Gains:** from the second capture on, what the previous one loaded is adopted (on Safari and iOS, the face only). One `prepare()` before the first capture and none later: never in a `finally` after each capture. **Costs:** memory until `client.release()`, and the face model may carry state from the last frame, so release at each change of user and before dropping the client (a view that unmounts). With consent to speech, ask for it in that single call (`prepare({ models: { face: true, speech: true } })`); otherwise the first measurement fetches it.

```js
// E · Several sessions (baseline, measure, measure): what each session loads stays for the next one.
import { createProtocolClient } from '@neurologyca/capture'

const client = createProtocolClient({
  baseUrl: '/engine', taxonomy: { contextId: 'your_context_id' }, transcribe: { language: 'en' },
  keepPrepared: true, // what each session loads stays for the next one
})
/** @type {import('@neurologyca/capture').CaptureSource} */
const source = { type: 'webcam' }

/** The same person: a baseline and two measurements, with the ids from your backend.
 * @param {string} userId @param {string} userProtocolId @param {string} firstPm @param {string} secondPm */
export async function baselineAndTwoSessions(userId, userProtocolId, firstPm, secondPm) {
  // Once, before the baseline.
  await client.prepare()
  await client.captureBaseline({ userId, source })

  // No prepare() between sessions: each one adopts what the previous one left.
  const first = await client.captureProtocol({ userProtocolId, protocolMechanicId: firstPm, source })
  await first.stop()
  const second = await client.captureProtocol({ userProtocolId, protocolMechanicId: secondPm, source })
  await second.stop()
}

// Between one person and the next, and before you drop the client (a view that unmounts): what is kept stays in
// memory until then. When the page goes away, the SDK releases it on its own.
export function releaseModels() {
  client.release()
}
```

## Checking it in the app

There is no reference figure: check it with the integrator's own sessions on their own devices. In `onReport`, `report.startup.prepared` says what each session did: `face` and `speech` read `'adopted'` when it used what was prepared or kept, `prepared.origin` says where it came from (`'prepare'` or `'previous-session'`; absent the first time a preparation is lent; it appears from the second session on), and `faceReloaded` appears, `true`, only when the face had to be loaded again. `startup.totalMs` is how long that startup took: compare the first session with the second. Without anything prepared, `prepared` is `null`.

What the download is and from where, and what stays in the browser: https://devlab.neurologyca.com/docs/guides/load-models.md («What is downloaded») and https://devlab.neurologyca.com/docs/resources/privacy.md. The face is about 13.5 MB and stays in the browser's HTTP cache, revalidated after an hour; speech stays in Cache Storage until the site's data is cleared. No cache period can be taken for granted.

## The startup screen

Between the person's click and the first step the SDK loads the face model (about 13.5 MB the first time) and, with transcription, speech (about 170 MB). It draws nothing; it tells you each stage.

- Pass `onStartupStage` to the client and paint `e.userMessage` (skip events with `kind: 'prepare'`, which belong to a preparation running in the background). The stages are `STARTUP_STAGES`; kodec's sub-stages (`STARTUP_SUB_STAGES`, with `parent`) carry `bytes`, `total` and `bytesPerSec` and no message. Speech bytes, and with them its stall warning, come by default only where kodec prefetches the speech load (not on Safari or iOS, nor with an explicit `model` or WASM without `selfHost.wasmPaths`); elsewhere pass `transcribe: { language, progress: true }`. On that path the total does not come (`total: null`), so `speech.running` goes without its «(X of Y MB)». Its cost: from an origin without `Content-Length` the library copies the whole buffer on every chunk, so serve your own weights with `Content-Length`. Language: `startup.locale` (`'es'` or `'en'`); your own text per key with `startup.messages` (keys in `STARTUP_MESSAGE_KEYS`).
- The texts fit the source: `face-model.*` speak of getting face analysis ready, and a first-frame timeout uses `first-frame.timeout-media` («No face can be seen in the video…») with your own `stream` or `<video>` (and in a replay), `first-frame.timeout` with the webcam. A live camera passed as a `stream` gets the video's wording: replace `first-frame.timeout-media` in `startup.messages` if you want the webcam's. A full `Record<StartupMessageKey, string>` of your own must include that key, and `face-model.integrity` (the face model failed kodec's integrity check; offer a reload or another network).
- Default caps (`startup.timeouts`; `null` removes one): the face model 120 s from the camera being granted, then `CaptureStartError` (`E_CAPTURE`, `stage: 'face-model'`, `reason: 'timeout'`); speech 600 s, then the `stt` warning with `reason: 'timeout'` and the capture goes on without speech; 20 s without a new byte raises `startup.stalled`, which cuts nothing; `gateMs` 5 s.
- Give the person a way out: Cancel with an `AbortController` whose `signal` goes to `captureProtocol` or `captureBaseline` (it rejects with `CaptureAbortedError`, `E_CAPTURE_ABORTED`, after releasing the camera, the microphone and the pair). On `startup.stalled` of `speech`, offer to go on without speech: abort and call `captureProtocol({ …, transcribe: false })` again **on the same client**. After a face-model timeout with `subStage: 'vision-runtime'`, offer a reload, not a retry.

## Preparing before Start

Optional. `client.prepare()` loads the models before the person presses Start (a form, the instructions); the next `captureProtocol` **of the same client** adopts them. It never calls Engine and never opens the camera.

- The pattern: one client per page, kept for the whole visit; `client.prepare()` when the page mounts, `client.release()` when it goes away (in React, the effect's cleanup). A second client loads everything again. Without `keepPrepared` speech is released after every session, so each capture needs its own preparation; with it, see «Keeping the models between captures».
- By default only the face. Speech only with `models: { speech: true }` (it needs the SDK's own transcription), and only after the person agrees: it is about 170 MB of their data and asks for no microphone permission. On Safari and iOS only the face is prepared (`transcription: 'not-prepared'`, `partialReason: 'speech-not-prepared'`; not a failure).
- It resolves a `PrepareResult` (`outcome`: `ready`, `partial`, `failed` or `aborted`); it rejects with `PrepareError` (`E_PREPARE`) only with `throwOnFailure: true`, and always with `reason: 'capture-in-progress'` while a capture or a baseline of this client runs. Do not prepare during a baseline. Without `keepPrepared` a baseline adopts nothing that was prepared; with it, it adopts the face (see below).
- Any difference in the options replaces what was prepared (`prepare.released`); `prepare.stale` says a capture could not use a prepared part. `prepare.face-lost` says the prepared face rejected its first frames or lost its GPU context and was loaded again once; it is not a failure, and the report keeps the face as adopted.
- `level: 'cache'`, `prepareCapture({ level: 'cache' })` and `captureCacheStatus()` only warm and read the browser's cache, for a page without a client; share the same configuration object with the capture page.

## Keeping the models between captures

Since 0.46.1, `keepPrepared: true` on `createProtocolClient` (off by default, live only) keeps what `prepare()`, each capture and each baseline loaded: when a session stops, the face models, and speech whether loaded or still loading, go back to the client and the next capture adopts them. No `prepare()` between captures. With the option, `captureBaseline` adopts the prepared face and leaves speech for the capture. In `mode: 'record'` it is ignored, with the `recording.option-ignored` warning.

- Prepare once: one `client.prepare({ models: { face: true, speech: true } })` before the first capture. A `prepare()` that asks only for what is kept resolves without loading anything (its report carries `kept: true`); one that asks for a part that is not kept releases what is kept and loads it again (`prepare.released`, `'replaced'`).
- Without WebGPU (and without `allowWasmWorker`) speech is never kept: do not prepare between captures, or ask for the face only, otherwise each `prepare()` releases the kept face and loads it again. On Safari and iOS only the face is kept, and a baseline is not lent a preparation whose speech is loading or loaded.
- `client.release()` between one person and the next, and before dropping any client, whether it prepared or not: what is kept holds memory until `release()` or the page goes away, and the face model may carry state from the last frame of one capture into the next. If one device passes from one person to another, release between them or leave the option off.
- A kept part that kodec leaves unusable raises `prepare.released` with `reason: 'unusable'` and its `part`; only that part is released. `client.cacheStatus()` reads the browser's cache, not what is kept in memory.

## The startup report

Every startup leaves a `StartupReport`: live and in `captureBaseline` it arrives in `SessionReport.startup` (with `SessionReport.transcriptionLoad`). Nothing leaves the page unless the client passes `startup.report: { url }`; then the receiver is `createStartupReportReceiver` of `@neurologyca/capture-server` with `localDiskStartupReports` from `@neurologyca/capture-server/node` (https://devlab.neurologyca.com/docs/sdk/backend.md). It stores data of the person's browser (stages, device checks and, unless `startup.includeUserAgent: false`, the user agent): the integrator's consent and privacy notice must cover it. `context` takes up to 8 pairs: never personal data there.
