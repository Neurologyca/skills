# Recommendations

Advice to apply before real people use the integration. Each section links the page that holds the detail.

## Production

Integrating the services into an application, to use it with people, needs a commercial agreement with Neurologyca first (https://devlab.neurologyca.com/docs/access/pricing.md).

Go through https://devlab.neurologyca.com/docs/guides/production-checklist.md before capturing with real people in production. The items that most often fail:

- The API key lives only in your backend's environment, never in a page, a bundle or git.
- Your proxy's `authorize` checks your own session and calls `ownsAll`.
- You keep the pair (`userProtocolId`, `protocolMechanicId`) in your backend, outside the tab, so results can be read again.
- You cache the token (`createTokenSource`) and share it with `createEngineAdmin`; you never mint one per request.
- Your page shows the warnings and handles every error by its code (https://devlab.neurologyca.com/docs/sdk/errors.md).
- Your CSP allows what the SDK loads (https://devlab.neurologyca.com/docs/guides/csp-transcription.md), and your gateways let the event stream and the long calls through (https://devlab.neurologyca.com/docs/guides/timeouts.md).

## Where to host the proxy

The proxy carries the frame batches, so its body cap matters. The current SDK (0.46.1) sends at most 3 MB of frames per live batch, and a proxy in front of it needs a body cap of at least 4.5 MB. `createEngineProxy` in 0.21.0 reads up to 16 MiB by default (`maxBodyBytes`); bound concurrency in your server, since each request may hold that much. Avoid hosts with a lower cap: a Next.js Pages Router API route (`pages/api`) parses at most 1 MB by default (`bodyParser.sizeLimit`); an App Router route handler has no body parser, so mount the proxy there ([quickstart.md](quickstart.md), «Next.js (App Router)»), within your host's own cap (4.5 MB on Vercel). A body cap that fits is not enough: the proxy keeps Engine's event stream open for the whole capture, and a serverless function's maximum duration cuts it, so prefer a long-running runtime (a container, a VPS, Cloud Run; https://devlab.neurologyca.com/docs/api/proxy.md, «Serverless functions»). An SDK before 0.34.0 sends larger batches, so update it. https://devlab.neurologyca.com/docs/api/proxy.md

## Privacy and consent

Neither the SDK nor Engine checks consent: collecting and recording it is your job. Collect it **before** `captureProtocol`, which opens the camera (and the microphone with transcription), and start the capture only from a gesture of the person (a click). Your consent must say what each mode sends and keeps and, with an interpretation, that the indicators and any transcript go to a language model. Know what deleting a person deletes and be able to do it on request. https://devlab.neurologyca.com/docs/resources/privacy.md

## Retries

What the SDK retries on its own (data sent to Engine, uploads, one new token after a `401`) and nothing else: https://devlab.neurologyca.com/docs/sdk/errors.md. The rest is yours:

- Do not recapture when Engine already has the capture: `E_RESULTS_TIMEOUT` is read later with `retrieveResults`; `E_INTERPRETATION_TIMEOUT` is never followed by `abort()`.
- Ask for the interpretation again (`/analyze`), without recapturing, only where the code says so: `E_AXES_MISSING` once your frames carry `featuresMeta`, `E_TENANT_UNKNOWN` and a not visible taxonomy in `E_TAXONOMY_REJECTED` once Neurologyca fixes it, `E_NARRATIVE_REJECTED` once the person's narrative is fixed. With SDK 0.46.1 all of them arrive as `E_TAXONOMY_REJECTED`, so check `featuresMeta`, the narrative and the id before asking again. Never in a loop.
- A 409 (`E_CONFLICT`): branch on `reason`, with a default case.

## Event stream and polling

Engine sends no webhooks for live captures. The SDK opens the event stream itself; if it does not connect (`stream.unavailable`) the capture goes on. From your backend, use the stream's events as the signal and `GET /results/{userProtocolId}/{protocolMechanicId}` as the fallback, never only one of them; a position that asked for the interpretation normally ends with `constellation.complete`, not `results.ready`. https://devlab.neurologyca.com/docs/api.md and https://devlab.neurologyca.com/docs/concepts/results.md

## Browsers

Chrome, Edge and Safari (iOS included) are targets; the minimum versions are in https://devlab.neurologyca.com/docs/start/install.md. Test on the browsers and phones your people use, over HTTPS, and read the frame rate at run time with `onCodecEvent('capture-quality')` (a callback option; skip the first two windows and the ones with the tab hidden; https://devlab.neurologyca.com/docs/start/devices-and-modes.md, «During and after»). `capture.throttled` is relative to the session's own rate, so it is not that signal; `quality.warning` is Engine's.

Firefox is not a target in either mode: it is documented and that is all, with no compatibility work. kodec does not cover Firefox (it is not among its tested browsers), so on-device capture there carries no guarantee, and it cannot record MP4/H.264, so the deferred recording fails there with `E_RECORDER_UNSUPPORTED`.
