# Deferred (server-side) · Preview

## Contents

- [How it works](#how-it-works)
- [Neurologyca's processing service](#neurologycas-processing-service)
- [Your receiver and the processing service](#your-receiver-and-the-processing-service)
- [The webhook](#the-webhook)
- [The capture token](#the-capture-token)
- [Timeouts and retention](#timeouts-and-retention)
- [Versions](#versions)

Deferred (server-side) is **Preview**: server-side processing is Neurologyca's processing service, the only option today (running it yourself comes later), and the manifest may change. Start with On-device (real time); read this only for this mode.

## How it works

In Deferred (server-side), the SDK records the video and a step manifest in the browser and uploads them to your receiver; the processing service handles them shortly after, replaying the capture against Engine. It is not hours later: it just does not run on the device. Engine computes the indicators either way.

1. Page: `createRecordingClient` from `@neurologyca/capture/record`, the same step loop as on-device (`describeStep`), then `session.stop()` gives the recording. Consent covers the recording mode: the video and audio leave the device.
2. Page: `uploadRecording(recording, { url })` uploads it in chunks, resumes, and deletes the local copy only after your receiver confirms.
3. Backend: your receiver's `onComplete` signs a URL for the video and submits the job to the processing service.
4. The service downloads the video, asks your token URL for an Engine token, replays the capture, transcribes the recording's audio and passes to Engine only the text of the steps the job asks for, and tells your webhook.

The recording client has no `transcribe` option: in this mode the processing service transcribes the whole audio when `transcribeSteps` is not empty, and only the text of the listed step types reaches Engine (`[]`: nothing is transcribed; absent: none with the hosted service; with a self-hosted processor, the steps its own configuration sets for your client). https://devlab.neurologyca.com/docs/sdk/deferred.md The transcript's language is the job's `language`: declare the language the person speaks, because the service forces it and never detects it (with another one spoken, the text is not reliable and, as on-device, may be a translation, and still carries the declared label). The interpretation's is the person's `narrative.language`: if the user switches language after creating the person, update the person (`updateUser` with `narrative`) before recording.

## Neurologyca's processing service

You deploy no processor. Where each value comes from (never invent one, never hard-code a host or an IP):

- `PROCESSOR_URL` and the service's outbound IP: the user's kit (`KIT.md`, «Deferred processing»).
- `PROCESSOR_API_KEY` and `PROCESSOR_SECRET`: one pair per organization, shared by every team. Any active team gets the current pair in its own recording starter's zip with «Include my key and the processor credentials» (DevLab: Your integration → Kit), next to its own Engine key; only your organization's admin team reveals and rotates them, in the DevLab account (`/account`). Never ask for the admin team's zip: it carries their admin-scoped Engine key. They live only in the backend's environment, and a rotation has to reach the backend of every team before it is activated.
- `PUBLIC_BASE_URL`: the backend's public `https:` origin. The service calls three routes there: the signed video (`/media/<captureId>/video`), the token URL and the webhook. It refuses `http:`, `localhost`, private and loopback addresses, redirects and URLs with credentials (`E_DESTINATION_NOT_ALLOWED`). To test on the user's machine: a public HTTPS tunnel (cloudflared or ngrok) put in `PUBLIC_BASE_URL`, closed when done, or a deployment.

Every `submit` carries THAT capture's parameters (`@neurologyca/capture-server` 0.13.0 or later): `taxonomy` (`contextId` required: the page's `taxonomy.contextId`; Measurement, `measurement`), `language` (the session's) and `transcribeSteps` (`[]`: no transcription; absent: none with the hosted service; with a self-hosted processor, the steps its own configuration sets for your client; transcribing needs the person's consent to it). Without `taxonomy.contextId` or `language` the service answers 400 `E_BAD_REQUEST`. A self-hosted processor whose client fixes them refuses another value with `E_JOB_PARAMS_CONFLICT` (send the client's values, or none). In the recording starter they come from the `processing` key of `neuro.config.json`, an app key the page strips before `defineTenantConfig`.

- **The IP does not authenticate.** Limiting the three routes to the service's outbound IP is defense in depth: the IP is the same for every organization. Verifying the signatures is mandatory: `createWebhookHandler` and `createProcessorTokenHandler` verify the HMAC with `PROCESSOR_SECRET`, and the receiver verifies the video URL's. Never skip them, whether you limit by IP or not.
- **A disabled account** gets 403 `E_CLIENT_DISABLED` on `submit` and `retry`; `getJob` still answers and jobs in flight finish. After a leak, the admin team rotates in two steps in `/account` (the new values stay pending until deployed and activated) and Neurologyca re-enables the access. https://devlab.neurologyca.com/docs/sdk/processing.md

## Your receiver and the processing service

Four pieces of `@neurologyca/capture-server`, all in your backend:

| Piece | What it does |
| --- | --- |
| `createUploadReceiver` | Receives the chunks; `authorize` checks your session, `checkManifest` checks the enrolment is the user's before the first byte; `onComplete` runs once per recording and must be idempotent. Two handlers, both mounted before any body parser: `handler` for the uploads and `mediaHandler` at `/media/<captureId>/video`, the signed video the service downloads (without it the service gets a 404 and the job fails with `E_DOWNLOAD_FAILED`, not retried: that capture cannot be recovered) |
| `createProcessorClient` | `submit` (idempotent per `captureId`: save the `jobId` and the pair) and `getJob` to poll when a webhook does not arrive (the SDK sets no interval: every few seconds while someone waits, honour `retryAfterMs` of a `ProcessorError`); stop polling once the job is `succeeded` or `failed` |
| `createProcessorTokenHandler` | Your token URL: verifies the service's signature over the raw body, so mount it before any body parser; your `authorize` decides whether to hand a token |
| `createWebhookHandler` | Your webhook: verifies the signature over the raw body (mount it before any body parser) and the nonces, and calls your `onEvent` |

Keep different secrets for the signed URLs and the webhook, and one nonce store per purpose. Your scheduler calls `receiver.sweep()` and retries `receiver.pendingNotifications()`: the receiver starts no timers. `sweep()` only deletes abandoned uploads: deleting a confirmed video when its job ends (`receiver.remove`) is yours. Error codes of the service, with whether to retry: https://devlab.neurologyca.com/docs/sdk/processing.md.

## The webhook

The job's states are `queued`, `downloading`, `preparing`, `transcribing`, `replaying`, `waiting`, `interpreting`, `succeeded`, `failed`. The job waits for Engine's interpretation in `interpreting`, which is **in flight**: never `failed` there.

**The interim notice.** While `interimWebhook` is on (with Neurologyca's service, by default; turn it off per job with `interimWebhook: false` in `submit`), the webhook also receives `status: 'interpreting'`, signed like the others, with `report` and `processor` set to `null` and no failure fields. It is not terminal:

- Branch on `interpreting` **first**. Delete the video and the upload, and **do not close the job**: keep serving its token URL.
- An `onEvent` that treats every status but `succeeded` as a failure closes the job: the token renewal is denied, the wait ends in a false `timeout`, and the video is never deleted. Update the handler before deploying against Neurologyca's service, where `interimWebhook` is on by default.
- An `interpreting` that arrives after the terminal event (a retried delivery) reopens nothing.
- The rule: delete the video at `interpreting` or at `succeeded`, whichever comes first; without the notice, that is `succeeded`.

**The end.** The job ends `succeeded` whatever happened to the interpretation: the indicators are in Engine. On a `succeeded`, `interpretation` (in the webhook and in `getJob`) is one of `ready`, `degraded`, `failed`, `timeout`, `unknown`, `not-requested`. If it is absent or `null` on a `succeeded`, the processor or the server predates the interpretation wait: treat it like `unknown`. The text never travels in the webhook: read it with your credential (`client.analyze()` or the HTTP API).

| `interpretation` | What to do |
| --- | --- |
| `ready` | Read it now: `/analyze` serves it from the cache, not paid twice |
| `degraded` | Every `/analyze` regenerates it, costs time and LLM tokens, and returns the new one or, if worse, the stored one. Ask once if you need it, **never in a loop** |
| `failed` | The same as `degraded` |
| `timeout` | Not a failure: the indicators are fine. You may ask for it once; it costs LLM tokens if Engine generates it then |
| `unknown` | Asked for, ending not known. You may ask once (it costs LLM tokens). `outcome` and `processor.interpretation.reconnects` (in `e.processor` / `job.processor`, not in `report`) tell the three causes apart: https://devlab.neurologyca.com/docs/sdk/processing.md |
| `not-requested` | Nothing to ask for (`triggerAnalysis: false`, a protocol that is not interpreted, or the Engine skipped it) |

The webhook is at-least-once: make `onEvent` idempotent by `jobId` and job state, and use `getJob` as the fallback (https://devlab.neurologyca.com/docs/sdk/results-backend.md). After `succeeded`, read the indicators with `admin.getResults(pair)`; with transcription on, its `speech` carries the `transcript` of each step (only in the test environment's Engine).

## The capture token

Your token URL's `authorize` hands a token only if the `jobId` is the one `submit` returned, the job is still in flight (**`interpreting` counts as in flight**: the service renews its token while it waits) and the pair is the one you stored for that job at `submit`. Never compare it with `receiver.manifest()`: after `interpreting` the upload, manifest included, is already deleted, and the denial ends the wait in a false `timeout`.

By default the token is your regular developer token: `authorize` limits **when** it is issued, never **what** it can do. With `captureToken: { baseUrl }` the handler hands a token scoped to that capture instead: it reaches only that capture's ingestion, its plan and its stream, for a limited time (the service asks again), and it cannot call `/analyze` (the replay warns `analysis.out-of-token-scope`; Engine still runs the interpretation the closing `Final` asked for). Its requests are limited per capture and per minute (30 a minute to `POST /process-kpn-emo` (operationId `ProcessKpnEmo`)); since 0.37.0 the replay waits the `Retry-After` and goes on, slower, with `transport.rate-limited` (a processor on an earlier version fails the job). It is off by default, and today only the test environment's Engine has the route. https://devlab.neurologyca.com/docs/sdk/processing.md and https://devlab.neurologyca.com/docs/start/authentication.md

## Timeouts and retention

Every timeout of this mode, including how long the job waits for the interpretation: https://devlab.neurologyca.com/docs/guides/timeouts.md.

| What | Where | Until | Who deletes it |
| --- | --- | --- | --- |
| The local copy of a recording | The browser (IndexedDB `neuro-capture-recordings`) | The `200` of `complete`, or a `410` | The SDK (`uploadRecording`, after the 200 or the 410; `release()` to discard it without uploading) |
| An unconfirmed upload | Your receiver | 72 h without activity | `receiver.sweep()` |
| A confirmed video | Your receiver | Until your backend removes it: it never expires on its own. Remove it at `interpreting` or at `succeeded`, whichever comes first. | `receiver.remove()`, which leaves a 7-day tombstone with no content |
| The service's copy, audio and transcript | The processing service | The end of the replay, when the job enters `interpreting`, or the end of the job (orphans are swept after 2 h) | The processing service |
| The job record (with the signed URL and the manifest) | The processing service | 30 days | The processing service |
| Results and frames | Engine | There is no automatic expiry today. | You, deleting the person (`DELETE /users/{externalId}`, physical) |

## Versions

- Recording from a `<video>` or a stream needs 0.27.2 or later; set the video's `src` before `captureProtocol`. When the source ends, the SDK warns `source.ended`.
- A recording carries at most 30 fps (`recording.maxFps`), whatever the source: the service replays every frame and its time grows with them.
- The SDK waits up to 120 s for `complete`, the last call of the upload: a gateway in front of your receiver must not cut it earlier.
- The service that waits for the interpretation needs `@neurologyca/capture-server` 0.11.0 or later (today 0.21.0), `capture-server` first: an older `createProcessorClient` rejects every answer that says `interpreting` with `E_PROCESSOR_PROTOCOL`.
