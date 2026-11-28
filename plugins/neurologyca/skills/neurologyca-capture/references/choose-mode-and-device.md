# Device capability

Verified with `@neurologyca/capture` 0.46.1. The detail, with the same tested code: https://devlab.neurologyca.com/docs/start/devices-and-modes.md. How to load the models once the mode is chosen: [startup-and-prepare.md](startup-and-prepare.md). Read this before writing the capture: which mode suits the people's devices decides what you build.

## Contents

- [Decide first](#decide-first): the decision table and the three levels
- [The capability check](#the-capability-check): what a `prepare()` without models says, and when to offer deferred
- [After measuring](#after-measuring): the session rate, described, and what to tell the person

## Decide first

| If… | Choose |
| --- | --- |
| your people use a desktop or recent phones and you want the results as soon as the session ends (seconds for short captures; long ones take minutes to close) | **On-device (real time)** |
| the video must not leave the device | **On-device (real time)** |
| you use lower-powered phones, sessions that last several minutes, or the rate of your sessions stays low | **Deferred (server-side)**: today you can record, upload and process with Neurologyca's processing service, with nothing to deploy. |
| you do not know which devices your people will use, or their phones vary a lot, and you want the most stable quality | **Deferred (server-side)** (Preview): the video leaves the device and is uploaded and processed on the server, so you wait for the result after the upload. Your organization has to have it turned on. |
| you want real time by default and a way out when the device cannot keep up | **On-device (real time)** by default, and **Deferred (server-side)** (Preview), with the person's permission, when the device check says it cannot measure or cannot transcribe. Your organization has to have it turned on. |
| the video must be processed off the device but inside your infrastructure | **Self-hosted (coming soon)**; until then, deferred with our service. |
| you capture in the browser and then call the API from your backend (results, processing status, protocols) | **SDK + API** (the usual) |
| you capture from another language or platform, or you already have the frames | **HTTP API** |
| you only want to measure, without interpretation | **Measurement**, on-device (real time) (deferred also works since 0.27.0) |
| you are not sure | The default path: **SDK on-device (real time), starting with Measurement** |

Deferred (server-side) is Preview and works only if the user's organization has it turned on: ask the user before building on it. In that mode the video leaves the device, is uploaded and processed on the server, and the result comes after the upload; the person's consent has to cover that. On-device (real time) keeps the video on the device. Never decide by the browser's name, the user agent or the device model: decide by capability (the device check below) and by the rate of the sessions you actually measured.

Then decide by capability, in three levels. The verdict is `PrepareResult.capture` of the device check:

| Level | Verdict | What to do |
| --- | --- | --- |
| Can measure | `'ok'` | Measure |
| Can measure with limits | `'degraded'` (live: `wasm-simd`) | Measure; the session rate tells you after |
| Cannot measure | `'unsupported'` | Show the remedy of the failing check; if it is `capture-route`, offer deferred |

- The rate depends on MediaPipe's face detection on the GPU (WebGL 2) and, on handheld devices, on heat in long sessions; not on the CPU or the device's age. On the CPU delegate it is not always slower, but its landmarks differ: compare sessions with the same `delegate`.
- Without WebGPU, on-device transcription is refused (the `stt` warning with `blocker: 'no-webgpu'`) **unless** the client allows the slower `transcribe.allowWasmWorker`. On Safari and iOS speech runs on WASM. The deferred mode transcribes on the server instead. Transcribing on the device costs rate.
- Hands and body come off by default: turning them on costs rate and Engine discards them.
- Handheld devices slow down as they heat up in long sessions; the first seconds of a session do not count.
- iOS cannot turn off the microphone's automatic gain. Safari and iOS keep only the face between sessions.
- Private mode: no persistent cache (the models download again), and a recording lives in memory (`recording.storage-memory`).
- Deferred: the quality depends on the bitrate and the light, not on the device's power; handheld devices record in portrait (`recording.rotate-to-portrait`).
- kodec's minimum guidance (GPU, memory, camera), without brands or models: https://devlab.neurologyca.com/docs/start/devices-and-modes.md.

## The capability check

It is capability, not quality: the rate is only known when measuring. A `prepare()` with no model only diagnoses: it opens no camera, asks for no permission and never calls Engine. It settles with `capture` (`'ok'`, `'degraded'`, `'unsupported'` or `null`, when a deciding check did not answer and the capture checks again when it starts) and one `DeviceCheck` per check in `device`. The checks that block: `secure-context`, `get-user-media`, `capture-route` (and, when recording, `media-recorder-mp4` and `indexeddb`); the one that limits: `wasm-simd` (and, when recording, the storage checks). The speech checks (`webgpu-adapter` and the rest) never degrade the capture. The check with no model cannot tell whether speech will come (`speech` stays `'unknown'`): that is only known when speech is prepared (`prepare({ models: { speech: true } })` adds the `webgpu-adapter` check; with no adapter it downloads no speech) or when transcription starts (the `stt` warning with `blocker: 'no-webgpu'`). `captureCacheStatus()` says whether speech's weights are already cached; `recorder.prepare()` adds `indexeddb` and `storage-quota`. Without `keepPrepared`, run the check before preparing: a `prepare()` with other options releases the one in progress or ready.

```js
// Before measuring: no permission, no call to Engine. Without `keepPrepared`, call it before
// preparing: a prepare() with other options releases the current one.

/** @typedef {import('@neurologyca/capture').DeviceCheck} DeviceCheck */
/** @typedef {'live' | 'record'} Mode */

// A `fail` blocks the capture. Recording also needs MP4 and IndexedDB.
const BLOCKS = {
  live: new Set(['secure-context', 'get-user-media', 'capture-route']),
  record: new Set(['secure-context', 'get-user-media', 'capture-route', 'media-recorder-mp4', 'indexeddb']),
}
// `warn` or `fail` limits it; storage only when recording. Speech checks never limit it.
const LIMITS = {
  live: new Set(['wasm-simd']),
  record: new Set(['wasm-simd', 'storage-persisted', 'storage-quota']),
}

/**
 * Reads a device diagnosis: the SDK's verdict, what blocks, what limits and whether speech can come.
 * @param {{ capture: 'ok' | 'degraded' | 'unsupported' | null, device: readonly DeviceCheck[] }} r what prepare() settled with
 * @param {Mode} mode `'live'` or `'record'` (deferred mode, Preview)
 * @returns {{ verdict: 'ok' | 'degraded' | 'unsupported' | null, blocking: DeviceCheck[], limiting: DeviceCheck[], speech: 'possible' | 'impossible' | 'unknown' }}
 */
export function readDiagnosis(r, mode) {
  const blocking = r.device.filter((c) => BLOCKS[mode].has(c.id) && c.status === 'fail')
  const limiting = r.device.filter((c) => LIMITS[mode].has(c.id) && (c.status === 'warn' || c.status === 'fail'))
  // The WebGPU adapter: only checked when speech is asked for (with no model, 'unknown').
  const gpu = r.device.find((c) => c.id === 'webgpu-adapter')?.status
  const speech = gpu === 'fail' ? 'impossible' : gpu === 'pass' ? 'possible' : 'unknown'
  // null: a deciding check did not answer; the capture checks again.
  return { verdict: r.capture, blocking, limiting, speech }
}

/** @typedef {import('@neurologyca/capture').ProtocolClientHandle} ProtocolClientHandle */
/** @typedef {import('@neurologyca/capture/record').RecordingClientHandle} RecordingClientHandle */
/** @typedef {ReturnType<typeof readDiagnosis>} Diagnosis */

/**
 * Diagnoses the device with no model. `'live'` (default) with a live client, `'record'` with a recording client.
 * @overload
 * @param {ProtocolClientHandle} client
 * @param {'live'} [mode]
 * @returns {Promise<Diagnosis>}
 */
/**
 * @overload
 * @param {RecordingClientHandle} client
 * @param {'record'} mode
 * @returns {Promise<Diagnosis>}
 */
/**
 * @param {ProtocolClientHandle | RecordingClientHandle} client
 * @param {Mode} [mode]
 * @returns {Promise<Diagnosis>}
 */
export async function checkDevice(client, mode = 'live') {
  const result = mode === 'record' ? await client.prepare() : await client.prepare({ models: { face: false, speech: false } })
  return readDiagnosis(result, mode)
}
```

**When to offer deferred.** If speech cannot come (`transcription: 'unavailable'`, with any blocker and also with a WebGPU adapter; known only once speech is asked for, never from the check with no model), offer to record instead, with the person's permission: the deferred mode (Preview) transcribes on the server, with no WebGPU. Offer it only when the recorder can record, only if the organization has deferred turned on, and only after explaining that the video is uploaded and processed on the server. The same applies when the device check says the capture cannot run (`capture-route` fails). If the person says no, measure live without speech, or tell what blocks. Asking for speech is not free: with an adapter it downloads the face (about 13.5 MB) and speech (about 170 MB) the first time and waits for them; the next capture adopts them (with `keepPrepared`, the later ones too). A different `prepare()` releases them while unused; with `keepPrepared`, only one that asks for a part not kept.

```js
// Speech is only known by asking for it; deferred is Preview, only if your organization has it turned on.
import { checkDevice, readDiagnosis } from './check-device.mjs'

/**
 * @param {object} o
 * @param {import('@neurologyca/capture').ProtocolClientHandle} o.client your live client, with `transcribe`
 * @param {import('@neurologyca/capture/record').RecordingClientHandle} o.recorder your recording client
 * @param {() => Promise<boolean>} o.askToRecord your UI: asks consent to upload the video and process it on the server
 * @returns {Promise<{ mode: 'live', speech: boolean } | { mode: 'record' } | { mode: 'none', blocking: import('@neurologyca/capture').DeviceCheck[] }>}
 */
export async function chooseMode({ client, recorder, askToRecord }) {
  const live = await checkDevice(client, 'live')
  const canLive = live.verdict !== 'unsupported'
  if (canLive) {
    // Downloads the face and speech models and waits. The next capture adopts them; with keepPrepared,
    // later ones too, and asking for another part releases them.
    const prepared = await client.prepare({ models: { face: true, speech: true } })
    if (prepared.transcription !== 'unavailable' && readDiagnosis(prepared, 'live').speech !== 'impossible') return { mode: 'live', speech: true }
  }

  // Only diagnoses: no load, no camera.
  const rec = await checkDevice(recorder, 'record')
  const canRecord = rec.verdict === 'ok' || rec.verdict === 'degraded'
  if (canRecord && (await askToRecord())) {
    client.release() // the recording takes over
    return { mode: 'record' }
  }
  // Not recording: live without speech, or what blocks.
  return canLive ? { mode: 'live', speech: false } : { mode: 'none', blocking: live.blocking }
}
```

## After measuring

The rate is read with `onCodecEvent('capture-quality')`, shorthand for a callback option of the capture, not a call: pass `onCodecEvent: (name, detail) => …` and keep the events named `'capture-quality'`. kodec gives about one window per second, a `kodec.CaptureQuality` (capture re-exports `kodec`). Describe the rate, never grade it: leave out the first two windows (the startup), the hidden ones and those without `fps`; give the median of the rest (with an even count, the mean of the two in the middle), the windows below 8 fps and the lowest; round only to paint.

> 8 fps is the only floor the SDK publishes. Below it, it does not estimate the pulse (an optional channel, off by default) and it treats a transcription veto as provisional. There is no published threshold for how the rate affects the indicators: compare your own sessions.

```js
// After measuring: the session rate, described, never graded. Feed it the 'capture-quality' windows.

/** @typedef {{ fps: number | null, hidden: boolean }} RateWindow */
/** @typedef {'counted' | 'low' | 'skipped' | 'hidden'} WindowState */
/**
 * @typedef {object} SessionRate
 * @property {number} counted the windows that count (low ones included)
 * @property {number | null} median the median fps of those windows; null without any
 * @property {number} lowWindows how many of them fall below the floor
 * @property {number | null} lowest the lowest fps of them; null without any
 * @property {'steady' | 'low' | 'none'} verdict `'none'` without a counted window, `'low'` with a low one, `'steady'` otherwise
 * @property {readonly { fps: number | null, state: WindowState }[]} windows every window in order, at most 600
 */

const STARTUP = 2 // the first two windows are the startup
const MAX_WINDOWS = 600 // the strip keeps 600 (ten minutes); the counts cover all

/**
 * @param {readonly RateWindow[]} windows
 * @param {number} floor the floor, kodec.PULSE_MIN_FPS
 * @returns {SessionRate}
 */
export function sessionRate(windows, floor) {
  /** @type {{ fps: number | null, state: WindowState }[]} */
  const strip = []
  /** @type {number[]} */
  const fps = []
  windows.forEach((w, i) => {
    /** @type {WindowState} */
    let state
    if (i < STARTUP || w.fps === null || !Number.isFinite(w.fps)) state = 'skipped'
    else if (w.hidden) state = 'hidden' // a hidden tab is throttled: it says nothing of the device
    else { state = w.fps < floor ? 'low' : 'counted'; fps.push(w.fps) }
    if (strip.length < MAX_WINDOWS) strip.push({ fps: w.fps, state })
  })
  const lowWindows = fps.filter((x) => x < floor).length
  return {
    counted: fps.length,
    median: median(fps),
    lowWindows,
    lowest: fps.length ? Math.min(...fps) : null,
    verdict: fps.length === 0 ? 'none' : lowWindows > 0 ? 'low' : 'steady',
    windows: strip,
  }
}

/** @param {number[]} xs @returns {number | null} */
function median(xs) {
  if (!xs.length) return null
  const a = [...xs].sort((x, y) => x - y)
  const mid = a.length >> 1
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2
}
```

- `droppedTotal` above zero is a separate notice; `delegate` is a fact to compare sessions with.
- `minFps` and `maxFps` of `SessionReport.captureQuality` include the startup and the hidden tab: they are not the rate.
- Not the rate either: `capture.throttled` is relative to the session's own rate (a device that is slow from the start never raises it), and `quality.warning` comes from Engine.
- Do not invent a threshold for the indicators, and do not promise a quality per device: compare the integrator's own sessions on their own devices.

**For the person being measured.** Before measuring, tell the person: light on the face from the front (not a window behind), at about arm's length with the whole face in view, looking at the screen and moving little, this tab in front and visible until the end, and the other apps that use the camera or the graphics card closed. The ready-made text, and the sentence for the person for each notice the SDK gives (`quality.warning`, `source.ended`, `capture.throttled`, `recording.rotate-to-portrait`): https://devlab.neurologyca.com/docs/start/devices-and-modes.md. The rest of the person's conditions and what Engine checks: https://devlab.neurologyca.com/docs/concepts/capture.md.
