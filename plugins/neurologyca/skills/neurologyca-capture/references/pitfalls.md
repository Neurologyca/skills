# Known pitfalls: SDK and deferred

## Contents

Each `###` below is one pitfall, open ones first: on-device and SDK (with the ones of every path), then deferred. The same list, in English and Spanish, is at https://devlab.neurologyca.com/docs/resources/pitfalls.md.

## SDK and every path

### The API key reached the browser

**Symptom.** Your `kop_…` key shows up in a bundle, in `neuro.config.json`, in a public environment variable or in a request the page makes.

**Cause.** Anyone who holds the key can mint tokens for your whole organization. The key belongs to your backend only.

**Fix.** Keep the key in your backend's environment (`ENGINE_API_KEY`, never in git). With the SDK, your backend's proxy adds the token and the page creates the client without `getToken`; over HTTP, your backend mints the token. If the key leaked, ask for a rotation.

Applies to: all published SDK versions · API.

More: https://devlab.neurologyca.com/docs/sdk/backend.md · https://devlab.neurologyca.com/docs/api/proxy.md

### A context id that is not from your kit

**Symptom.** `POST …/context` answers `201` (with `taxonomyWarnings`), the capture completes, and the interpretation is then refused with a `422` (`E_TAXONOMY_REJECTED` in the SDK).

**Cause.** Engine does not reject an id it does not recognise when you set the context; the taxonomy is frozen at capture time and only the interpretation checks it.

**Fix.** Take the context, subcontext and audiences from your kit (`neuro.config.json` and `KIT.md`), never guess them. If something in `KIT.md` is still to settle, ask Neurologyca before recording anyone.

Applies to: all published SDK versions · API.

More: https://devlab.neurologyca.com/docs/start/install.md · https://devlab.neurologyca.com/docs/concepts/protocols.md

### The reading is written for someone other than who reads it

**Symptom.** `POST /analyze` answers `200` and the interpretation is complete, but it speaks to the wrong reader: a reading written for the person shown to someone else, or the other way round. Without `audience`, `audience_applied` comes back `null`.

**Cause.** Without `audience` (in the request or on the person), Engine applies the default reading. A context with several audiences can have one default, and it is not always the reader you have in mind.

**Fix.** Check in `KIT.md`, under Audiences, which one is marked as the default, if any. If your reader is another one, set it on the person (`POST /users`, or later `PATCH /users/{externalId}`) or send it in `POST /analyze` from your backend (since capture-server 0.21.0, `createEngineProxy` drops it).

Applies to: all published SDK versions · API.

More: https://devlab.neurologyca.com/docs/concepts/results.md · https://devlab.neurologyca.com/docs/access/kit.md

### Asking Measurement for an interpretation

**Symptom.** With Measurement, `POST /analyze` answers `409` with `PROTOCOL_NOT_ANALYSED`, or `client.analyze()` throws it, or your page waits for an interpretation that never comes.

**Cause.** Measurement is never interpreted. An omitted `triggerAnalysis` means `true` in the SDK and `false` over HTTP. Since SDK 0.29.0 the SDK skips the analysis on its own when Engine returns `interpreted: false` (and warns `protocol.not-interpreted`), but not every Engine returns that field yet.

**Fix.** Pass `triggerAnalysis: false` to `captureProtocol` with Measurement (the kit's `neuro.config.json` carries it for your code to pass), do not call `/analyze` for it, and read the indicators with `GET /results/{userProtocolId}/{protocolMechanicId}`.

Applies to: all published SDK versions · API.

More: https://devlab.neurologyca.com/docs/guides/measurement.md · https://devlab.neurologyca.com/docs/sdk/errors.md

### A baseline from another person or another source

**Symptom.** The indicators of a person look shifted, even though the capture went well.

**Cause.** The baseline is the resting expression of one person, and Engine applies it whenever one exists, even an invalid one. A baseline captured with another person, or with another source (a test video, a synthetic sample), discounts the wrong expression.

**Fix.** Capture the baseline from the same person, with the same kind of source you will measure with, under that person's own `externalId`. Do not reuse one test identity for everyone.

Applies to: all published SDK versions · API.

More: https://devlab.neurologyca.com/docs/concepts/baseline.md

### The baseline is not there right after its Final

**Symptom.** Right after the baseline's last batch is accepted, `GET /users/{externalId}/baseline` answers `404` (or `getBaselineInfo` returns `null`).

**Cause.** Engine computes the baseline in the background after the `Final`; it takes a few seconds. For a person with no earlier capture, a `404` before that is the expected answer: there is no baseline yet. The browser console paints it as a red error; it is not one.

**Fix.** Read it again a few times, a few seconds apart, before deciding it failed. Check `missingOrders` in the last `202`: with missing batches no baseline is computed.

Applies to: all published SDK versions · API.

More: https://devlab.neurologyca.com/docs/concepts/baseline.md

### Expecting the interpretation as soon as the capture ends

**Symptom.** The indicators are there but the interpretation is not; a short HTTP timeout cuts a blocking `/analyze` (`504`), or the SDK ends with `E_INTERPRETATION_TIMEOUT`.

**Cause.** The interpretation is generated after the position completes and takes from tens of seconds up to about two minutes (`constellation.complete` was measured about 82 s after the first batch).

**Fix.** Show the indicators first and the interpretation when it arrives. Wait for `constellation.complete` and then call `POST /analyze`; if you call it blocking, give it a long timeout. Do not abort the capture over `E_INTERPRETATION_TIMEOUT`: ask for the interpretation again later.

Applies to: all published SDK versions · API.

More: https://devlab.neurologyca.com/docs/guides/timeouts.md · https://devlab.neurologyca.com/docs/guides/timeouts.md · https://devlab.neurologyca.com/docs/concepts/limits.md

### Reading a `202` from `/analyze` as "no interpretation"

**Symptom.** `POST /analyze` answers `202` with `ANALYSIS_IN_PROGRESS` and no interpretation, and your app shows «no interpretation»: by HTTP, or with `client.analyze()` in the page or `admin.analyze` in your backend returning `interpretation: null`; with an SDK before 0.44.0, the capture also ended with `E_INTERPRETATION_TIMEOUT`.

**Cause.** Engine is still analysing that session (the analysis it starts after the capture, or a `reAnalyze`) and does not start a second one. Since `@neurologyca/capture` 0.44.0 and `capture-server` 0.20.0 the SDK says so: `client.analyze()` and `admin.analyze` return `inProgress: true` and `retryAfterMs` next to `interpretation: null`, and at the close of a capture the SDK waits and asks again (`analysis.in-progress`), ending with `E_ANALYSIS_IN_PROGRESS` (recoverable) if the wait runs out. Code that only reads `interpretation`, an older SDK, or a client of the HTTP API still mistakes it for «no interpretation».

**Fix.** A `202` counts as «interpreting», never as «no interpretation». With the SDK, check `inProgress` before treating `interpretation: null` as final, wait `retryAfterMs` (about 30 s when it is `null`) and ask again a few times at most; after `E_ANALYSIS_IN_PROGRESS`, show the results and read the interpretation later. Over HTTP, check `reason === 'ANALYSIS_IN_PROGRESS'` and wait `retryAfterSeconds` (also the `Retry-After` header). If it is still in progress, show it as interpreting and ask later, or wait for `constellation.complete` on the stream. The pattern, for the page and for your backend, is `askInterpretation` in Errors (The 202 of the interpretation).

Applies to: all published SDK versions (before 0.44.0 the SDK cannot tell it apart; since 0.44.0, code that ignores inProgress) · API.

More: https://devlab.neurologyca.com/docs/concepts/results.md · https://devlab.neurologyca.com/docs/sdk/errors.md · https://devlab.neurologyca.com/docs/concepts/limits.md

### Showing a failed interpretation as a result

**Symptom.** The person sees a generic or empty interpretation, although `/analyze` answered `200`.

**Cause.** An interpretation with `metadata.status: "failed"` is a placeholder (the SDK reports `E_ANALYSIS_FAILED`); with `"degraded"` it was built on partial inputs (the SDK warns `analysis.degraded`). The reason is in the root `warnings` of the payload.

**Fix.** Never show a `failed` interpretation; show the indicators, which are still valid. Show a `degraded` one with a notice.

Applies to: all published SDK versions · API.

More: https://devlab.neurologyca.com/docs/concepts/results.md · https://devlab.neurologyca.com/docs/sdk/errors.md

### Treating Effective Active Attention as missing in the first read after the Final

**Symptom.** `session.effective_active_attention` comes back `null` in the `/results` read right after the Final, although the session was measured and your context includes it.

**Cause.** Engine can still be computing the session value when the per-frame and per-step results are already there (seen in the test environment's Engine, by the SDK path). It is **Preview**.

**Fix.** Do not show it as missing on the first read: read `/results` again a little later and show it when `v` arrives; `null` for good means not measured or not in your context.

Applies to: all published SDK versions · API.

More: https://devlab.neurologyca.com/docs/concepts/results.md · https://devlab.neurologyca.com/docs/guides/show-results.md

### Reading the interpretation by title or by `insight`

**Symptom.** Your page shows an empty summary, or mixes up two sections of the interpretation.

**Cause.** `structured_data.insight` can arrive as `null`, and section titles are written for the audience and can repeat. `structured_data.headline` can also be missing (by design in hiring interpretations).

**Fix.** When `insight` is `null`, show `structured_data.headline`. If `headline` is missing too, show the first entry of `sections[]`, and look at `metadata.status`. Match sections by `sections[].key`, never by `title`.

Applies to: all published SDK versions · API.

More: https://devlab.neurologyca.com/docs/concepts/results.md

### A misspelled subcontext falls back without an error

**Symptom.** The interpretation does not follow the subcontext you set, and nothing reported an error.

**Cause.** The subcontext is optional: without it Engine applies the mechanic's own (`constellationSubcontextId`) or, if the mechanic declares none, the context's default; a `subcontextId` it does not know falls back to that default silently.

**Fix.** Leave it out rather than guess it. If you set it, take it from your kit and check it against `taxonomy.subcontexts` of `GET /catalog/contexts`.

Applies to: all published SDK versions · API.

More: https://devlab.neurologyca.com/docs/concepts/protocols.md · https://devlab.neurologyca.com/docs/api.md

### An audience label Engine does not know

**Symptom.** The interpretation does not fit the audience you asked for, and there was no error.

**Cause.** Engine does not validate the audience label: an unknown one is accepted without an error.

**Fix.** Use only the audiences your kit lists for the protocol's context (`KIT.md`, Audiences); never build the label from free text.

Applies to: all published SDK versions · API.

More: https://devlab.neurologyca.com/docs/concepts/results.md · https://devlab.neurologyca.com/docs/api.md

### One audience for every person and every context

**Symptom.** Your app sets the same audience on every person (for example from one environment setting), and the readings of some contexts come out for a reader they were not written for, or `audience_applied` is not the one you set.

**Cause.** An audience belongs to a context: each context has its own list (some have none, and one may be the default), and a label only means something in its context. It lives on the person (`POST /users`, `PATCH /users/{externalId}`) or in each `POST /analyze`, and the person's applies to every context they are measured in. Engine does not validate it: one the context does not have falls back to the default reading without an error.

**Fix.** Choose the audience per protocol, only from the ones `KIT.md` lists for it (Audiences); leave it empty for the context's default reading. If a person is measured in contexts with different audiences, set theirs before each capture (`PATCH /users/{externalId}`, `admin.updateUser`), as the playground does, or read again from your backend with `admin.analyze(pair, { audience })`; and compare `audience_applied` with the one you meant.

Applies to: all published SDK versions · API.

More: https://devlab.neurologyca.com/docs/concepts/results.md · https://devlab.neurologyca.com/docs/access/kit.md

### Comparing interpretations that came from the cache, or forcing them in a loop

**Symptom.** Asking `POST /analyze` again returns exactly the same interpretation, even after something changed; or the bill grows with every read.

**Cause.** Engine stores one interpretation per session and audience and returns it with `from_cache: true`. `reAnalyze: true` skips that and generates a new one, which is paid for every time.

**Fix.** Look at `from_cache` before comparing two readings. For a new one, send `reAnalyze: true` (that exact name) from your backend on a deliberate decision, never in a loop or on every read; the next plain request returns the new one.

Applies to: all published SDK versions · API.

More: https://devlab.neurologyca.com/docs/concepts/results.md · https://devlab.neurologyca.com/docs/api/proxy.md

### Reconnecting the stream with the same token after a credential change

**Symptom.** The event stream closes with `stream.end` and a `reason` that starts with `credential_`, and reconnecting with the same token fails.

**Cause.** The credential that minted the token was rotated, revoked, deleted, expired or had its scope changed: that token is no longer accepted.

**Fix.** Mint a new token with a valid key (the new key after a rotation; the same key after a scope change) and reconnect. With a revoked, deleted or expired key, get a valid one first.

Applies to: all published SDK versions · API.

More: https://devlab.neurologyca.com/docs/start/authentication.md

### Every interpretation is refused for your organization

**Symptom.** Captures and indicators are fine, but every interpretation answers `422`. Today the body carries only `code` and a generic `message`, and the SDK reports it as `E_TAXONOMY_REJECTED` (`E_TENANT_UNKNOWN` is not emitted with SDK 0.40.0).

**Cause.** Your organization is not active yet in the interpretation service. It is neither your capture nor your taxonomy, but the answer no longer tells the two apart.

**Fix.** Do not recapture: the indicators are stored. Compare the taxonomy ids with the protocol's; if they match and every interpretation fails, tell Neurologyca, and once it is fixed ask for the interpretation again on the same pair.

Applies to: all published SDK versions · API.

More: https://devlab.neurologyca.com/docs/sdk/errors.md · https://devlab.neurologyca.com/docs/concepts/results.md

### `npm install` answers 404 for `@neurologyca/*`

**Symptom.** `npm install` fails with `404 Not Found` (or `401`) for `@neurologyca/capture` or `@neurologyca/capture-server`.

**Cause.** Since 0.46.0 / 0.21.0 the packages are public on npm, but an older `.npmrc` (the project's, `~/.npmrc` or a global one) still sends `@neurologyca` to the registry of the private previews, where these versions do not exist. That line wins over `--registry`.

**Fix.** Remove the old `@neurologyca` lines and keep `@neurologyca:registry=https://registry.npmjs.org/` in the project's `.npmrc` (the kit and the starters bring it). `npm config get @neurologyca:registry` should print `https://registry.npmjs.org/`. No token is needed.

Applies to: @neurologyca/capture 0.46.0 and later, @neurologyca/capture-server 0.21.0 and later.

More: https://devlab.neurologyca.com/docs/start/install.md

### Measurement without `taxonomy.contextId`

**Symptom.** Building the client from a Measurement configuration throws `taxonomy.contextId is required`, or `buildTenantKit` (`admin.buildTenantKit`) in your backend refuses Measurement with `E_KIT_NO_CONTEXT` and the enrolment you made just before is left without a capture.

**Cause.** The SDK's configuration requires a context id, and Measurement is not interpreted, so its group has no interpretation context. `buildTenantKit` of `capture-server` 0.19.0 and earlier only looks at that id and throws; since 0.20.0 it reads `interpreted` from Engine's catalogue and gives Measurement a kit of its own (`kind: 'measurement'`), but against an Engine whose catalogue does not publish `interpreted` it still throws.

**Fix.** Use `taxonomy: { contextId: 'measurement' }` (a filler value, `MEASUREMENT_CONTEXT_ID` in `capture-server`: since 0.29.0 the SDK does not send it when Engine says the protocol is not interpreted) and pass `triggerAnalysis: false` to the capture. The console's Measurement kit carries both in its `neuro.config.json` (Your integration › Protocols › a protocol › Kit). In your backend, use `capture-server` 0.20.0 or later and branch on `kit.kind`: `'measurement'` brings that configuration and a notice to capture with `triggerAnalysis: false`. Resolve the kit before `admin.enrol`, so a kit that fails leaves no enrolment behind. `ProtocolSummary.interpreted` (`listProtocolLibrary`) says whether a protocol is interpreted. If `buildTenantKit` still throws `E_KIT_NO_CONTEXT` for Measurement (an older `capture-server`, or an Engine without `interpreted`), use the fixed configuration above.

Applies to: all published SDK versions (contextId) · capture-server 0.19.0 and earlier, or an Engine without interpreted (buildTenantKit).

More: https://devlab.neurologyca.com/docs/guides/measurement.md · https://devlab.neurologyca.com/docs/sdk/backend.md

### A `<video>` source that gives no frames, or ends the plan early

**Symptom.** With `{ type: 'video', el }` the capture gets no frames, loses the start of the file, or `source.ended` arrives with steps still pending and a later step fails. Since 0.43.0 a second capture on the same file can fail at once with `CaptureStartError` (`stage: 'source'`, «the capture source has already ended…»).

**Cause.** The SDK waits for the video's metadata, so the `src` must be set before `captureProtocol`; frames only come while the video plays; and when the file ends no later step can be captured. Since 0.43.0 (kodec 5.0.0-rc.14) a `<video>` that has already ended when the capture starts fails before any model loads.

**Fix.** Set `src` before `captureProtocol`, keep the element `muted` and `playsInline`, and call `play()` in `onStarted`. With several steps on one file, set `loop` while the plan runs; on `source.ended` with steps pending, call `session.abort()`. If the element already played to the end, rewind it (`currentTime = 0`) before `captureProtocol`.

Applies to: SDK >=0.27.0.

More: https://devlab.neurologyca.com/docs/sdk/on-device.md

### The tab was hidden while capturing

**Symptom.** The series has real gaps and `onWarning` gets `capture.throttled`. That warning is relative to the session's own rate: it is not the signal for how fast the device is.

**Cause.** A hidden tab or a covered window stops the browser from processing frames; the SDK only warns.

**Fix.** Ask the person to keep the tab visible while capturing, and show the warning.

Applies to: all published SDK versions.

More: https://devlab.neurologyca.com/docs/sdk/errors.md · https://devlab.neurologyca.com/docs/concepts/capture.md

### The camera does not open outside a secure context

**Symptom.** On a phone or another machine of your network the camera never opens; `classifyMediaError` says `insecure-context`.

**Cause.** Browsers only give the camera to secure contexts: HTTPS, or `localhost` on the same machine. A plain `http://` address of your network is not one.

**Fix.** Serve the page over HTTPS (a tunnel to your development machine or a certificate for your local network), and map media errors with `classifyMediaError` to tell the person what to do.

Applies to: all published SDK versions.

More: https://devlab.neurologyca.com/docs/sdk/on-device.md

### Works locally, fails in production: the CSP

**Symptom.** In production the camera never gets ready, or the whole transcription is lost: `codec.error` with `audio-start-failed`, the `stt` warning and `transcription: null` in the report (`workerBlockedByCsp` says nothing here: it lives inside `transcription`, which is `null`, and only covers the speech worker).

**Cause.** By default Capture loads its vision runtime and models from public CDNs, and its audio processing from a `blob:`. A Content Security Policy that does not allow them blocks them.

**Fix.** Use the tested policy of the CSP guide: `'wasm-unsafe-eval'` and `blob:` in `script-src`, `blob:` in `worker-src`, and the CDN origins in `connect-src`; or host the files yourself (`kodec.*` and `transcribe.selfHost`).

Applies to: all published SDK versions.

More: https://devlab.neurologyca.com/docs/guides/csp-transcription.md

### The transcript comes back in English

**Symptom.** The text is fluent and well punctuated, but translated into English; `onWarning` gets `stt.autodetect`.

**Cause.** With `language: null` the language is detected from the audio, which is not reliable on short answers: the model can return a translation without any error.

**Fix.** Set the language as a code without a region: `transcribe: { language: 'es' }`. Without `language`, the SDK uses the page's language (`<html lang>`, then the browser's): a template with `<html lang="en">` transcribes in English with no warning, so set it explicitly.

Applies to: all published SDK versions.

More: https://devlab.neurologyca.com/docs/guides/csp-transcription.md

### Transcription in a language the person does not speak

**Symptom.** On-device, the voice steps reach Engine with no text or very little (only the `stt.silent` warning, when no utterance is left), or with fluent text translated into the declared language and no warning at all. Deferred, the transcript arrives labelled with the language you asked for (`speech.language`) whatever was spoken, and its text is not reliable.

**Cause.** The language is declared, never detected: on-device kodec, and the processing service when deferred, force the model to it. With another language spoken, the model either translates into the declared one, fluently and with good confidence, so nothing filters it, or repeats itself or scores low, and on-device kodec discards those utterances on purpose (`low-confidence`, `repetition-loop`). Which one depends on the pair of languages: in one test, English declared over Spanish speech came back translated; Spanish declared over English speech was mostly discarded. Pinning the wrong language is worse than not pinning it. The default (`<html lang>`, then the browser's) is the page's language, which is not always the person's. The playground makes this explicit: its «Spoken language» control is the language spoken in the session, and the sample video is fixed to English because that is what it says.

**Fix.** Declare, for each capture, the language the person will speak: `transcribe: { language }` on-device, the job's `language` deferred. Ways to get it right: keep it with the person or the interview in your backend (the language the candidate answers in, for instance) and pass it to every capture; if you do not know it, ask before the capture, on the consent screen; one language per capture (whoever switches language mid-capture is transcribed in the declared one: split it into captures). To catch it afterwards, read `SessionReport.transcription` (`onReport`): `vad.utterances` above 0 with few or no `emitted` and high `discardedLowConfidence` or `discardedRepetitionLoop` points to the wrong language (with none emitted, the SDK warns `stt.silent`); offer to repeat the capture in the right one. A translation passes every counter: only declaring the right language prevents it. Do not switch to `language: null` to dodge it: in one test, autodetection also translated the longer Spanish answers into English. The interpretation's language is separate: `narrative.language` on the person. In the playground, pick «Language» to match what is spoken (with the camera it starts as the page's language).

Applies to: all published SDK versions.

More: https://devlab.neurologyca.com/docs/guides/csp-transcription.md · https://devlab.neurologyca.com/docs/sdk/deferred.md

### A step with several questions and none declared

**Symptom.** The interpretation does not mention the question the person answered: `metadata.missing_inputs` includes `question_text` and `status` is not `degraded`, so nothing looks wrong. With the SDK, `onWarning` gets `step.media-undeclared`. In `/results`, the same `questionText` in several steps of `speech` (only in the test environment's Engine) is the same symptom: the question was not chosen per step.

**Cause.** The step offers several media (alternative questions) and the capture did not say which one the person saw: no `mediaPid` in `start()` or `run()` (SDK), no `mediaId` in the batches of the step (HTTP API). `describeStep(step).text` is only the first text that matches the language, so taking it is a guess. Over HTTP, Engine does not check that a `mediaId` belongs to the step, so a media of another step passes without an error. The SDK warning does not fire in steps with phases, because there the text media are cues of each phase, not alternative questions (no choice to make). A `mediaPid` that is not the step's throws `E_MEDIA_UNKNOWN`.

**Fix.** In every step with more than one question, show one and declare it: choose it from `describeStep(step).texts` (each entry has its `mediaPid` and `body`) or from `plan.steps[].media`, and pass it as `mediaPid` (SDK) or as `mediaId` in every batch of the step (HTTP). Do not repeat the same question across steps of a protocol. The kit and the starters keep this choice in `neuro.config.json` (`media`, by step), with a default; the playground's «Questions» control lets you choose before measuring.

Applies to: all published SDK versions · API.

More: https://devlab.neurologyca.com/docs/sdk/steps.md · https://devlab.neurologyca.com/docs/sdk/errors.md

### A question step shown as an answer step

**Symptom.** Your page labels the step that asks the question as «answer now» (or opens the answer's timer there), so the person answers before reading or hearing the question; or the answer step shows its own line and the question disappears from the screen.

**Cause.** The role of the step was guessed from the name of its type, from `responseClock` or from a missing clock. The catalogue says it: an answer step is `category: 'answer'` or `expectsSpeech: 'yes'`. With the SDK, `describeStep` (`StepFacts`) gives `expectsSpeech` but not `category` nor `delivery.media_from` today: they are in the plan step (`PlanStep`).

**Fix.** Read `category`, `expectsSpeech` and `delivery.media_from` from the plan's steps (`session.plan.steps` with the SDK). Each step shows its own media; without one, the previous step's question (`media_from: 'previous_step'`) or the next step's text (`'next_step'`, a silent reading step: it declares no `mediaPid`). An answer step keeps the previous question on screen, with its own media as the line under it. Never show `delivery.instructions` or `delivery.prompt`.

Applies to: all published SDK versions · API.

More: https://devlab.neurologyca.com/docs/sdk/steps.md

### The question in `speech` comes back in another language, or not at all

**Symptom.** In `/results`, `speech` gives the `questionText` of a step in a language other than the one shown on screen or spoken, or no `questionText` at all, while `transcript` is there.

**Cause.** Engine writes `questionText` in the language of the person's narrative (`narrative.language`), not in the one shown or spoken. A person created without that language gets no `questionText`.

**Fix.** Set `narrative: { language }` when you create the person (`createUser`/`updateUser`), the language you want to read. To show the question as it was on screen, keep the `mediaPid` you chose and read its `body`. Related: «The interpretation comes back in the wrong language», «The transcript comes back in English» and «Transcription in a language the person does not speak».

Applies to: API · all published SDK versions.

More: https://devlab.neurologyca.com/docs/concepts/results.md · https://devlab.neurologyca.com/docs/sdk/backend.md

### Joining the `transcript` of every step to get the whole text

**Symptom.** Joining the `transcript` values of `speech` gives less than what the person said: words at the start or the end are missing, or a step has none.

**Cause.** `transcript` is the speech your app placed in that step (`sttByStep`). The SDK splits the speech by the step boundaries; what was said outside a step (before the first, between two, after the last) has no step and does not appear.

**Fix.** Read `speech` per step, for what was said in each one. For the whole text, keep it on the device as it arrives, with `onTranscript` in the capture, or keep the `speech.text` your backend sent in the `Final`.

Applies to: API · all published SDK versions.

More: https://devlab.neurologyca.com/docs/concepts/results.md · https://devlab.neurologyca.com/docs/api.md

### Lifting the transcription veto automatically

**Symptom.** Transcription does not start (an `stt` warning with `blocker: 'video-cost-veto'`), or, after lifting it in code, the video keeps freezing on that device.

**Cause.** The veto is a real measurement: transcribing made the camera analysis too slow on that device, or its latency too high (`reason: 'latency'`, with the video intact). `forgetTranscriptionVeto` deletes it; called at start-up or in a retry it turns the veto into a loop that loses video.

**Fix.** Call `forgetTranscriptionVeto(kodec)` only behind a button the person presses. The indicators are captured either way.

Applies to: all published SDK versions.

More: https://devlab.neurologyca.com/docs/guides/csp-transcription.md · https://devlab.neurologyca.com/docs/sdk/errors.md

### An option the SDK does not have

**Symptom.** `createProtocolClient`, `captureProtocol`, a step or `createRecordingClient` throws `E_UNKNOWN_OPTION` before touching the camera; after upgrading to 0.42.0, a client that used to build now throws when it is created.

**Cause.** The SDK refuses any option it does not know. Since 0.42.0 that includes `createProtocolClient` (and every key inside `startup`), which before ignored an unknown key silently; an option of each capture (such as `signal` or `captureId`) passed to the client is refused too, and the message says it goes in `captureProtocol`.

**Fix.** Take option names from the reference only, never from memory or from older examples, and remove any extra key from the config. `triggerAnalysis`, `signal` and `captureId` go per capture, in `captureProtocol`.

Applies to: all published SDK versions.

More: https://devlab.neurologyca.com/docs/sdk/errors.md · https://devlab.neurologyca.com/docs/sdk/reference.md

### You prepared, and the capture downloads everything again

**Symptom.** `prepare()` resolved `ready`, but when the person presses Start the face (and speech) load again: the startup stages say `source: 'network'`, the wait is the same and the page holds the models twice.

**Cause.** Only the next capture of the **same client** adopts what `prepare()` loaded. A second client (one created per render or per component, or one for the preparation and another for the capture) has nothing to adopt; `prepareCapture()` and `level: 'cache'` only warm the browser's cache, and only if the capture asks for the same files. Two tabs of your app are two pages: each loads its own models, and they share only the browser's cache.

**Fix.** Create one client per page and keep it for the whole visit: prepare with it when the page mounts, capture with it, and call `client.release()` when the page or view goes away. With `prepareCapture()` on an earlier page, share the same configuration object with the capture page. With `keepPrepared: true` (0.43.0) keep that same client for every capture: each one adopts what the previous one left, with no `prepare()` in between, and call `client.release()` between one person and the next on a shared device. Without the option, speech is released after every session, so prepare again before the next capture.

Applies to: SDK 0.42.0 and later.

More: https://devlab.neurologyca.com/docs/sdk/on-device.md

### With `keepPrepared`, the next person inherits the face model

**Symptom.** On a device that passes from one person to another (a kiosk, a shared tablet), the captures keep using the same loaded models from one person to the next, with no `prepare()` and no new download.

**Cause.** With `keepPrepared: true` the client keeps the models from one capture to the next until `client.release()` or the page goes away. They are models, not what was captured, but the face model may carry state from the last frame of one capture into the next.

**Fix.** Call `client.release()` between one person and the next, or do not turn the option on where one device serves several people.

Applies to: SDK 0.43.0 and later.

More: https://devlab.neurologyca.com/docs/sdk/on-device.md · https://devlab.neurologyca.com/docs/guides/load-models.md

### Without WebGPU, preparing speech between captures reloads the face every time

**Symptom.** With `keepPrepared`, every capture starts as slowly as the first one, and each `prepare()` between captures raises the `prepare.released` warning with `'replaced'`.

**Cause.** Where transcription is refused (no WebGPU and no `allowWasmWorker`) the speech model is never kept, so a `prepare({ models: { face: true, speech: true } })` between captures asks for something that is not kept: it releases the kept face and loads it again.

**Fix.** Prepare once before the first capture and do not prepare between captures, or ask for the face only.

Applies to: SDK 0.43.0 and later.

More: https://devlab.neurologyca.com/docs/guides/load-models.md · https://devlab.neurologyca.com/docs/sdk/on-device.md

### Transcription stops after 0.42.0 with ONNX Runtime self-hosted

**Symptom.** With `transcribe.selfHost.wasmPaths` as a string, the capture goes on without speech: the `stt` warning with `subStage: 'stt-runtime'`, `reason: 'network'` and, in `cut`, `code: 'stt-runtime-missing'` with the missing `url`; in `prepare()`, `partial` with `speech-error`.

**Cause.** Since 0.42.0 a `wasmPaths` string is a prefix that must end in `/`: kodec puts it in front of the file name and checks, with a `HEAD`, the ONNX Runtime pair of the executor it runs on (`ort-wasm-simd-threaded.jspi.{mjs,wasm}` on WebGPU with JSPI, `ort-wasm-simd-threaded.{mjs,wasm}` on WASM and on Safari and iOS). A 404 or 410 for either file stops speech at once. A host that serves only the Asyncify pair used to work and now fails this way.

**Fix.** End the prefix in `/` and serve both pairs from `onnxruntime-web/dist/` under it, or pass `wasmPaths` as an object, `{ wasm, mjs }`, pointing at the exact files (on Safari and iOS, the plain build).

Applies to: SDK 0.42.0 and later.

More: https://devlab.neurologyca.com/docs/guides/csp-transcription.md

### A webcam passed as a `stream` tells the person to check the video

**Symptom.** You open the camera yourself and pass it as `stream`; when no face is seen in time, the start fails and `userMessage` says «No face can be seen in the video…» instead of asking the person to face the camera.

**Cause.** Since 0.42.1 the SDK picks the first-frame message by source: `first-frame.timeout` only with the webcam it opens itself, `first-frame.timeout-media` with any `stream` or `<video>` of yours. It cannot tell a live camera from a recorded stream.

**Fix.** Replace `first-frame.timeout-media` in `startup.messages` with the webcam wording (or with your own text), or let the SDK open the camera.

Applies to: SDK 0.42.1 and later.

More: https://devlab.neurologyca.com/docs/sdk/on-device.md · https://devlab.neurologyca.com/docs/sdk/errors.md

### Retrying `/analyze` as a general rule

**Symptom.** A retry handler calls `/analyze` again after any interpretation failure, and the failures pile up instead of clearing.

**Cause.** `E_AXES_MISSING` is the only case where retrying is correct: the analysis was never generated for lack of an axis (almost always frames without `featuresMeta` from your own frame source). Other failures, such as a generation that ran out of time, get worse with more load. With SDK 0.40.0 that case arrives as `E_TAXONOMY_REJECTED`: Engine no longer sends the detail the SDK sorted it by.

**Fix.** Branch by `code`, never with a common rule. On `E_AXES_MISSING` (today, `E_TAXONOMY_REJECTED` with your own frame source), fix `featuresMeta` and ask for the interpretation again without recapturing; do not retry the others in a loop.

Applies to: all published SDK versions.

More: https://devlab.neurologyca.com/docs/sdk/errors.md

### Duration warnings you did not ask for

**Symptom.** `step.duration-below-min` or `step.duration-above-max` arrive on `onWarning` although you changed nothing.

**Cause.** `stepDurations` is `'warn'` by default: a step lasted outside the minimum or maximum the catalogue declares. Engine does not enforce durations.

**Fix.** Show them or filter them by `code` in `onWarning`; use `stepDurations: 'enforce'` to refuse such a step (`E_STEP_DURATION`), or `'off'` to silence the check.

Applies to: all published SDK versions.

More: https://devlab.neurologyca.com/docs/sdk/steps.md

### Aborting after `stop()` destroys a good capture

**Symptom.** After `stop()`, `onError` brings `E_RESULTS_TIMEOUT` or `E_INTERPRETATION_TIMEOUT` with `recoverable: false`, your code calls `abort()`, and the capture is lost.

**Cause.** A `recoverable` other than `true` means the capture is lost only during the steps. After `stop()` Engine already has the capture and is still processing it.

**Fix.** Call `abort()` on a non-recoverable error only while the steps run. After `stop()`, keep `userProtocolId` and `protocolMechanicId` outside the tab and read the results later (`client.retrieveResults` or your backend).

Applies to: all published SDK versions.

More: https://devlab.neurologyca.com/docs/sdk/errors.md

### The client points at Engine directly

**Symptom.** Every request answers `401` and `onWarning` gets `token.missing`.

**Cause.** `baseUrl` is an absolute address of another origin and there is no `getToken`: no request carries a token.

**Fix.** Point `baseUrl` at your backend's proxy (for example `/engine`), which adds the token; pass `getToken` only if you run a proxy without `capture-server`.

Applies to: all published SDK versions.

More: https://devlab.neurologyca.com/docs/sdk/backend.md · https://devlab.neurologyca.com/docs/api/proxy.md

### A hand-made proxy that misses a route

**Symptom.** A `404` in the middle of a capture, or at the baseline or the interpretation, while the rest works.

**Cause.** The SDK calls 13 routes, and some only in some cases (baseline, cancel, interpretation). A proxy of your own that does not forward one of them answers `404`.

**Fix.** Forward exactly the 13 routes of the proxy page, or use `createEngineProxy` from `capture-server`, which carries the list.

Applies to: all published SDK versions.

More: https://devlab.neurologyca.com/docs/api/proxy.md · https://devlab.neurologyca.com/docs/sdk/backend.md

### Looking for the indicators that need previous sessions in `/results`

**Symptom.** Mental Fatigue Load, Facial Muscle Tension, Disengagement or Emotional Mental Control never appear in `/results`, not even after several sessions of the same person.

**Cause.** These four need the person's history: 5 previous completed sessions in the same context (the baseline does not count), so a value from the 6th; Facial Muscle Tension from the 1st if the context has Neurologyca calibration data. Even then, Engine uses them only inside the interpretation (`/analyze`): no route returns their value.

**Fix.** Do not wait for them in `/results` or build on their values. Keep the same person (`externalId`) and context across sessions so the interpretation can use them, and read the per-frame indicators that do arrive.

Applies to: all published SDK versions · API.

More: https://devlab.neurologyca.com/docs/concepts/results.md

### Attention drawn on a 0 to 100 axis

**Symptom.** Attention's bar or line sits flat at the bottom of a chart shared with the other indicators, or a mean such as `0.83` is shown as «0.83» or «1%».

**Cause.** Attention is not on the 0 to 100 scale: it is 0 or 1 per frame, and its mean in `/results` is the fraction of frames with attention, from 0 to 1. The other indicators run from 0 to 100, except Valence and Motivation, from −100 to 100.

**Fix.** Draw Attention per frame as an on/off band, not on the 0 to 100 axis, and show its mean as a percentage of frames (× 100: «83% of the frames with attention»). Effective Active Attention (`session.effective_active_attention.v`, Preview) is already a 0 to 100 percentage: do not multiply it.

Applies to: all published SDK versions · API.

More: https://devlab.neurologyca.com/docs/concepts/results.md · https://devlab.neurologyca.com/docs/guides/show-results.md

### An indicator that arrives in the example and not in your capture

**Symptom.** An indicator you see in the playground's recorded example, in this documentation or in another protocol is missing from your `rawResults` and `aggResults`, `session` comes as `null`, or a Relevant one of the interpretation is not in your `/results`; the capture completes normally.

**Cause.** Which indicators you receive depends on the context and on your organization's agreement. Every interpreted context includes the ones its interpretation needs; the rest of the public catalogue arrives by agreement, and the list can change with it. The recorded examples carry the whole public catalogue. It is not the case of the four that need previous sessions, which do not arrive in `/results` for anyone.

**Fix.** See the indicators of each protocol in Your integration › Protocols ("Indicators you receive in this context"); when your context does not include them all, the playground's Results say how many (after a session). Treat every indicator as optional: a missing key is not received, never a zero. To receive more, ask Neurologyca.

Applies to: all published SDK versions · API.

More: https://devlab.neurologyca.com/docs/concepts/results.md · https://devlab.neurologyca.com/docs/access/account.md

### The interpretation comes back in the wrong language

**Symptom.** The transcript is in the right language (you set `transcribe: { language }`), but the interpretation Engine returns is in English for a capture in Spanish; or you changed the person's language and an earlier session still comes back in the old one.

**Cause.** The interpretation's language is the person's, not the capture's: `narrative.language` with the SDK, `narrativeLanguage` in the HTTP API, `en` when it is not set. `transcribe.language` only sets the transcript, and `/analyze` carries no language. Engine reads the person's language when it interprets: a session not interpreted yet comes out in the language the person has at that moment, and one already interpreted comes back in its own language, even after you change the person. The SDK's backend sends `narrativeLanguage: 'en'` when `narrative.language` is not set.

**Fix.** Choose the language of whoever is going to read the interpretation: if the person reads it, their spoken language; if someone else reads it, that reader's language, even when the person speaks another. Set it per person, not as one value for the whole project, in `createUser`/`updateUser` (`narrative: { language }` with the SDK; `narrativeLanguage` in `POST /users` or `PATCH /users/{externalId}`), before the session. A `PATCH` keeps the fields you leave out and `null` removes one. For a session already interpreted in the wrong language, update the person and ask from your backend with `reAnalyze: true`: it rewrites it in the person's current language and costs a new interpretation. `/analyze` without `reAnalyze` returns the stored one, in its language; `/analyze/stream` generates a new one every time.

Applies to: all published SDK versions.

More: https://devlab.neurologyca.com/docs/sdk/backend.md · https://devlab.neurologyca.com/docs/concepts/results.md

### `E_UPLOAD_FAILED` on a live capture, read as "out of retries"

**Symptom.** A live capture ends with `E_UPLOAD_FAILED` right away, not after the usual retries; often with a `413` from your proxy.

**Cause.** `E_UPLOAD_FAILED` is a live-flow error (a partial batch), not a deferred one. A 4xx (for example a `413` because the batch is over the proxy's body limit) is terminal at the first try; only a 5xx or a network error is retried (3 tries, 30 s).

**Fix.** Do not read it as "out of retries" and resend blindly. If it is a `413`, raise your proxy's body limit (at least 4.5 MB with SDK 0.34.0 or later, at least 10 MB before); a serverless function works only if its body limit reaches that (a Vercel function, 4.5 MB, does; a Next.js Pages Router API route (`pages/api`), 1 MB by default, does not until you raise it); otherwise fix the credential or receiver, then recapture when the pair is free.

Applies to: all published SDK versions.

More: https://devlab.neurologyca.com/docs/sdk/on-device.md · https://devlab.neurologyca.com/docs/sdk/errors.md

### The proxy behind a Firebase Hosting rewrite (Cloud Run or Cloud Functions)

**Symptom.** With the proxy served through Firebase Hosting, the event stream (`/stream`) or a long `/analyze` is cut after 60 s with a `504`; or the proxy refuses every request with `403` because your `authorize` finds no session cookie.

**Cause.** Firebase Hosting has a 60-second request timeout, also when it rewrites to Cloud Run or Cloud Functions with a longer one, and the proxy keeps the event stream open for the whole capture. Hosting also strips cookies from the requests it forwards: only the one named `__session` reaches your app.

**Fix.** Keep `/engine` out of the Hosting rewrite, so nothing caps the stream at 60 s, and serve the page and the proxy on the same origin from the long-running runtime (Cloud Run on its own domain, or behind a load balancer). Requests that do not go through Hosting keep their cookies, so there your session cookie can keep its own name: `__session` only matters for what still goes through Hosting. Best, keep the proxy on the page's origin. If it must live on another origin, since `@neurologyca/capture` 0.45.0 it takes two halves: `credentials: 'include'` in the client (`createProtocolClient`, `createRecordingClient`, and `urlTokenProvider` if your token endpoint is there) and `cors: { origins: ['https://app.example.com'], credentials: true }` in `createEngineProxy` (`capture-server` 0.20.1 or later, which also exposes `Retry-After`); without the client's, your session cookie does not reach `authorize` and the proxy answers `403`. The browser only sends cookies valid for the proxy's host: on a subdomain of the same site (page on `app.example.com`, proxy on `api.example.com`) give the cookie `Domain=example.com` (`SameSite=Lax` is enough); on another site (for example a `*.run.app` address) it is a third-party cookie (`SameSite=None; Secure`) that Safari blocks by default, so serve the proxy under your own domain there. No `getToken` behind the proxy. Never get around the guard: `cors.origins` takes exact origins, never `"*"`.

Applies to: all published SDK versions, with Firebase Hosting.

More: https://devlab.neurologyca.com/docs/api/proxy.md · https://devlab.neurologyca.com/docs/sdk/backend.md

### The console fills with vision-library messages

**Symptom.** While the capture starts, the browser console prints lines such as `INFO: Created TensorFlow Lite XNNPACK delegate for CPU`, some of them as errors or warnings.

**Cause.** They come from MediaPipe (TensorFlow Lite), the vision library the SDK loads. It writes its logs to the console through the error stream, and the browser paints them red. They are not failures of your integration or of the SDK.

**Fix.** Ignore them. Decide that a capture failed from what the SDK reports (`onError`, `onWarning` and the `CaptureOutcome`), not from the console. Do not hide the console messages with a filter in production code.

Applies to: all published SDK versions.

More: https://devlab.neurologyca.com/docs/sdk/errors.md

### No speech on a device without WebGPU

**Symptom.** On some phones and computers the capture measures the face but transcribes nothing: the `stt` warning arrives with `blocker: 'no-webgpu'`, and the `webgpu-adapter` check of the device diagnosis (it only comes out when speech is asked for) does not pass.

**Cause.** Transcribing on the device needs a usable WebGPU adapter (a browser can have WebGPU and still offer none). Without one, the SDK refuses transcription unless you set `transcribe.allowWasmWorker: true`, which lets the device try the speech model in WebAssembly, more slowly and only in its own Worker. The capture of the indicators goes on either way.

**Fix.** Whether speech will come is only known when preparing speech or when transcription starts: a check with no model cannot tell. To know it before measuring, ask for speech: without a WebGPU adapter, `prepare({ models: { speech: true } })` gives `webgpu-adapter` `fail` and downloads no speech (with one, it downloads the models). Show every `stt` warning and go on without speech; or set `transcribe.allowWasmWorker: true` and accept that the text arrives later and that the first load of the weights can close the tab on a device with little memory (if a Content-Security-Policy blocks workers, there is no speech on that path either). If you need the speech on every device, deferred (Preview, if your organization has it enabled) transcribes it on the server.

Applies to: all published SDK versions.

More: https://devlab.neurologyca.com/docs/start/devices-and-modes.md · https://devlab.neurologyca.com/docs/guides/csp-transcription.md · https://devlab.neurologyca.com/docs/sdk/on-device.md

### Sessions on the CPU delegate may not compare with GPU ones

**Symptom.** `SessionReport.captureQuality.delegate` says `'CPU'` on some devices and `'GPU'` on others, and you compare their sessions as if they were the same measurement.

**Cause.** The face detection runs on the GPU (WebGL 2) and falls back to the CPU when the GPU delegate cannot be created. The two delegates run the models with different precision and image preprocessing, so the face landmarks are not identical between them, and results from sessions on different delegates may not be comparable. What limits the device is that GPU detection, not the CPU: with the face only, the CPU delegate is not necessarily slower.

**Fix.** Keep the `delegate` of every session and compare sessions with the same delegate. Check that WebGL 2 works on the devices you target. Do not pin `kodec: { delegate: 'CPU' }` except to diagnose a graphics driver: pinning a delegate disables the fallback, so the capture fails instead of degrading.

Applies to: all published SDK versions.

More: https://devlab.neurologyca.com/docs/start/devices-and-modes.md · https://devlab.neurologyca.com/docs/sdk/on-device.md

### On iOS the microphone keeps its automatic gain

**Symptom.** On iPhone and iPad the voice features that depend on absolute intensity (energy, shimmer and the arousal derived from them) do not line up with those of other devices, and kodec's audio quality says `agc: 'unknown'` and `trust: false`.

**Cause.** The SDK asks the microphone for `autoGainControl: false`, with noise suppression and echo cancellation off, so the voice keeps its real dynamics. WebKit, which every browser on iOS uses, does not implement that constraint: the automatic gain cannot be turned off there, and the browser cannot say whether it is on (`'unknown'` is not «off»). Video and face landmarks are not affected.

**Fix.** Do not compare intensity-based voice features between iOS and other devices, nor across sessions where `trust` is `false`; keep the platform with each session. The browser cannot see other gain either: Bluetooth headsets, Windows microphone enhancements or the voice isolation of macOS and iOS.

Applies to: all published SDK versions.

More: https://devlab.neurologyca.com/docs/start/devices-and-modes.md · https://devlab.neurologyca.com/docs/sdk/on-device.md

### Private windows and blocked storage

**Symptom.** In a private window, or with the site's storage blocked: transcription where speech would run in WebAssembly (no WebGPU, or Safari and iOS) is refused with `blocker: 'no-memory-to-learn'`; or, when recording (deferred, Preview), the `recording.storage-memory` warning arrives.

**Cause.** When the SDK finds no persistent storage (it cannot tell every private window apart: some keep storage until they close). Live, kodec cannot remember what it learns on the device, such as a configuration that closed the tab, so a load that kills the tab would repeat every session; it does not risk speech in WebAssembly there (where speech runs on WebGPU it still transcribes; not in Safari and iOS, where it runs in WebAssembly). When recording, there is no IndexedDB, so the recording lives only in the tab's memory: if the tab closes before the upload ends, it is lost and cannot be resumed.

**Fix.** Ask for a normal window when you can. Live, go on without speech when it is refused. When recording with `recording.storage-memory` (and `upload.not-persistent` when the upload starts), tell the person not to close the tab until the upload ends.

Applies to: all published SDK versions.

More: https://devlab.neurologyca.com/docs/start/devices-and-modes.md · https://devlab.neurologyca.com/docs/guides/csp-transcription.md · https://devlab.neurologyca.com/docs/sdk/deferred.md

### Long sessions on a phone slow down as it heats up

**Symptom.** The rate of a phone session falls as it goes on, and the same configuration gives a lower rate the longer the phone has been capturing.

**Cause.** The rate is set by the face detection on the GPU (WebGL 2), and a phone slows down as it heats up. The first seconds after the start are not representative either: the models are still warming up.

**Fix.** Treat a long session on a lower-powered phone as degraded, not stable, and plan shorter sessions there. Read the rate the codec delivers on that device at that moment (the `capture-quality` event and `captureQuality` in the `SessionReport`) instead of guessing from the model, and leave the first seconds out when you describe it.

Applies to: all published SDK versions.

More: https://devlab.neurologyca.com/docs/start/devices-and-modes.md

### `minFps` is not the rate of the session

**Symptom.** You read `captureQuality.minFps` from the `SessionReport` as the rate of the session, conclude that the device cannot measure, or compare devices by it.

**Cause.** `minFps` is the lowest of the windows of about a second that kodec measures over the whole session, startup included (the models are still warming up) and any moment the tab was hidden or the window covered. The spread within one session is larger than most differences you would want to read from a single number. 8 fps is the only floor the SDK publishes. Below it, it does not estimate the pulse (an optional channel, off by default) and it treats a transcription veto as provisional. There is no published threshold for how the rate affects the indicators: compare your own sessions.

**Fix.** Describe the rate from the `capture-quality` event instead: the median of the windows after the startup, how many fall below that floor and the lowest one, leaving out the hidden tab (the page linked below has the code). `delegate` is a fact for comparing and `droppedTotal` above zero a separate notice. Not the rate either: `capture.throttled`, relative to the session's own rate, and `quality.warning`, from Engine.

Applies to: all published SDK versions.

More: https://devlab.neurologyca.com/docs/start/devices-and-modes.md · https://devlab.neurologyca.com/docs/sdk/on-device.md

### Do not decide by the user agent

**Symptom.** You turn speech on or off, or choose live or deferred, by reading `navigator.userAgent`, and recent iOS versions are taken for older ones.

**Cause.** The user agent does not tell the iOS version: Safari on a recent iOS announces an older one, and only the `Version/` token tells the real version. That is why the startup report carries `uaVersionToken` next to `userAgent`. The SDK decides nothing by the user agent: its device diagnosis checks capabilities (the secure context, camera access, the capture route, WebGPU, WASM SIMD, persistent storage).

**Fix.** Decide by capability: call `prepare()` before measuring and read `PrepareResult.capture` and its `device` checks (the page linked below has the code). Use `uaVersionToken`, not the user agent, only to group reports when you analyse them; with `startup: { includeUserAgent: false }` both come out `null`.

Applies to: @neurologyca/capture 0.42.0 and later.

More: https://devlab.neurologyca.com/docs/start/devices-and-modes.md · https://devlab.neurologyca.com/docs/guides/load-models.md

### `audience` sent to `/analyze` through the proxy is ignored

**Symptom.** The page calls `/engine/analyze` (or `/analyze/stream`) through your `createEngineProxy` with an `audience`, and the reading comes back for the person's own audience, with no error.

**Cause.** Since capture-server 0.21.0 the proxy forwards only `userProtocolId` and `protocolMechanicId` on `/analyze` and `/analyze/stream`: every other key (`audience`, `step`, `reAnalyze`…) is dropped, because a visitor could make Engine generate a new, billed analysis.

**Fix.** Set the audience on the person before the session (`createEngineAdmin().updateUser`), or ask for the reading of another audience from your backend with `createEngineAdmin` (`analyze` or `analyzeForAudiences`), behind your own authorization.

Applies to: @neurologyca/capture-server 0.21.0 and later.

More: https://devlab.neurologyca.com/docs/sdk/backend.md

### capture-server throws a `TypeError` on an `http:` or `?` Engine URL

**Symptom.** After upgrading to capture-server 0.21.0, `createTokenSource`, `createEngineProxy`, `createEngineAdmin` or `createProcessorClient` throws a `TypeError` when called (the message names the function and the option, never the URL), or `createEnrolmentHandler` answers `415`, `403` or `413`.

**Cause.** 0.21.0 refuses an Engine base URL that is not `https:` (loopback aside) or that carries a `?` or `#`, also the `engineBaseUrl` of a processor job; sends to the processor only over `https:` unless `allowInsecureHttp: true`; answers enrolment only to a same-site JSON request up to 16 KiB; and its token mints do not follow redirects.

**Fix.** Use the `https:` Engine URL of your kit (`ENGINE_BASE`) with nothing after the path; `allowInsecureHttp: true` only on a private network the traffic never leaves; send the enrolment with `fetch` and `content-type: application/json`; point at the final Engine address, not one that redirects.

Applies to: @neurologyca/capture-server 0.21.0 and later.

More: https://devlab.neurologyca.com/docs/sdk/backend.md · https://devlab.neurologyca.com/docs/sdk/processing.md

### Every model fails with `integrity` on a page served over `http://`

**Symptom.** The capture never starts (`E_CAPTURE` with `stage: 'face-model'`, `reason: 'integrity'`) and speech fails with `reason: 'integrity'`, but only when the page is opened over plain `http://`, for example from another machine on your network.

**Cause.** kodec 5.0.0 checks the models it downloads from its default host with `crypto.subtle`, which browsers only expose in a secure context (HTTPS or `localhost`). Without it, the check cannot run and the model is refused.

**Fix.** Serve the page over HTTPS (or `localhost` while you develop), which the camera needs anyway. Do not work around it by hosting the models yourself.

Applies to: @neurologyca/capture 0.46.0 and later (kodec 5.0.0).

More: https://devlab.neurologyca.com/docs/guides/load-models.md · https://devlab.neurologyca.com/docs/start/install.md

### Transcription never starts again in one browser

**Symptom.** Transcription is on and the video runs normally, but `/results` brings `speech` with no `transcript` on any capture in that browser; `onWarning` gets `stt` with `blocker: 'video-cost-veto'`, easy to miss if your UI keeps only the last warning.

**Cause.** An earlier capture measured the video below 8 fps (typically a hidden tab) and stored a provisional veto in the browser. It should lapse once a capture measures more than 8 fps, but up to 0.40.0 transcription starts right after the first frame, before the rate is measured, so the veto is honoured every time.

**Fix.** Update `@neurologyca/capture` to 0.41.0 or later (it pins kodec 5.0.0-rc.3): the first capture that shows video above 8 fps deletes the provisional veto and transcribes; only that capture waits, up to about 3 s. 0.40.1 already transcribed, but kept the veto and waited in every capture. The deleted veto is reported once, in `SessionReport.transcriptionSetup.provisionalVetoLifted`. A capture that stays at 8 fps or less (a hidden tab, or a capture `fps` of 8 or less) keeps it: keep the tab visible and show every warning.

Resolved in 0.40.1: update to it.

More: https://devlab.neurologyca.com/docs/guides/csp-transcription.md · https://devlab.neurologyca.com/docs/sdk/errors.md

### `createEngineAdmin` fails when loaded with `require()`

**Symptom.** In a CommonJS backend (`require('@neurologyca/capture-server')`, or TypeScript compiled to CommonJS), every admin call that needs an Engine token rejects with `ReferenceError: return_nullishCoalesce is not defined`.

**Cause.** From 0.12.0 to 0.17.0 the package's CommonJS entry was built wrong: the token request of `createEngineAdmin` (and of a `createHttp` used directly) called a function that does not exist. The ES module entry (`import`) was not affected.

**Fix.** Upgrade your backend to `capture-server` 0.17.1 or later. No code changes.

Resolved in capture-server 0.17.1: update to it.

More: https://devlab.neurologyca.com/docs/start/install.md

### A `413` from a proxy on a Vercel function (or another host capped at 4.5 MB)

**Symptom.** A live capture ends with `E_UPLOAD_FAILED` at its first batch, and the proxy, hosted on a Vercel function or a similar host, answers `413`.

**Cause.** Before 0.34.0 the SDK cut batches only by count: up to 300 frames, about 9.3 MB with a camera. That is over a Vercel function's body limit (4.5 MB) and a Next.js Pages Router API route (`pages/api`)'s default (1 MB), and a 4xx ends the session at the first try.

**Fix.** Update to SDK 0.34.0 or later: each live batch carries at most 3 MB of frames, so a proxy with a body cap of at least 4.5 MB holds it. This does not cover a Next.js Pages Router API route (`pages/api`): its 1 MB default is below a batch with any SDK version, so it answers `413` until you raise its limit. That case, and how to read the `E_UPLOAD_FAILED`, is in the pitfall `upload-failed-4xx-terminal` (`E_UPLOAD_FAILED` read as "out of retries").

Resolved in 0.34.0: update to it.

More: https://devlab.neurologyca.com/docs/api/proxy.md · https://devlab.neurologyca.com/docs/sdk/backend.md

### `createEngineProxy` answering `413 E_BODY_TOO_LARGE` with its default limit

**Symptom.** A live capture ends with `E_UPLOAD_FAILED`, and your backend's proxy answered `413` `E_BODY_TOO_LARGE` to a `POST /process-kpn-emo`.

**Cause.** Up to `capture-server` 0.11.0, `createEngineProxy` read bodies up to 8 MiB by default (`maxBodyBytes`), and an SDK before 0.34.0 sends batches of up to about 9.3 MB with a camera.

**Fix.** Update your backend to `capture-server` 0.12.0 or later (default 16 MiB) and the SDK to 0.34.0 or later, or pass a larger `maxBodyBytes`. A request can now hold that much body in memory, so bound concurrency in your server.

Resolved in capture-server 0.12.0: update to it.

More: https://devlab.neurologyca.com/docs/sdk/backend.md · https://devlab.neurologyca.com/docs/sdk/errors.md

### With webpack (Next.js), `init()` fails before the camera opens

**Symptom.** The build passes with the warning «Critical dependency: the request of a dependency is an expression», and at run time the capture fails before the camera opens with «Cannot find module» for the MediaPipe bundle.

**Cause.** kodec 4.2.1, which the SDK brought before 0.34.0, loads MediaPipe with a dynamic `import()` that webpack replaced with an empty module. Vite and Rollup leave it as it is, so they were not affected.

**Fix.** Update `@neurologyca/capture` to 0.34.0 or later: it pins kodec 4.2.2 or later (0.36.5 pins kodec 5.0.0-rc.2), whose `import()` carries `webpackIgnore`. kodec is not a dependency you install yourself. Turbopack is not tested.

Resolved in kodec 4.2.2: update to it.

More: https://devlab.neurologyca.com/docs/start/install.md

### Two interpretations, and you pay for both

**Symptom.** With the SDK in real time and `triggerAnalysis` on, the person sees one interpretation on the page, and `POST /analyze` from your backend returns another, with `from_cache: true`.

**Cause.** The `Final` with `triggerAnalysis` makes Engine generate and store an interpretation (the one `constellation.complete` announces). Up to SDK 0.37, when `stop()` had the results and that notice had not arrived, the SDK also opened `/analyze/stream`, which always generates a new one, reads no cache and stores nothing. Two language-model generations, two texts, both billed. The valid one is the stored one.

**Fix.** Since 0.38.0 `stop()` waits for Engine's notice up to `analyzeTimeoutMs` and, if it does not arrive, calls `POST /analyze` once, which serves the stored one: one interpretation per session, the same text your backend reads. Since 0.44.0, if that `/analyze` answers `202 ANALYSIS_IN_PROGRESS`, the SDK waits and asks again within `analyzeTimeoutMs` counted from the first `202`, and ends with `E_ANALYSIS_IN_PROGRESS` if it runs out. `stop()` can take longer (about 13 minutes at worst with the defaults). `SessionReport.interpretationSource` says where it came from; the warning `analysis.regenerated` (`from_cache: false`) means `/analyze` had to generate it. Do not ask for `interpretation: 'stream'` unless you need progress by phase: it generates one that Engine does not store. Never call `/analyze/stream` yourself in addition: every call generates again.

Resolved in 0.38.0: update to it.

More: https://devlab.neurologyca.com/docs/concepts/results.md · https://devlab.neurologyca.com/docs/sdk/results-backend.md


## Deferred (server-side) · Preview

### Calling `/analyze` again and again after a deferred job

**Symptom.** Each read of the interpretation of a deferred job takes tens of seconds (up to about two minutes) and costs, or comes back different.

**Cause.** With `interpretation: 'ready'` the stored analysis is served from the cache. With `'degraded'` or `'failed'` no call reads the stored one: every `/analyze` regenerates it (LLM tokens included). Asking before the job's `succeeded` can also generate another one.

**Fix.** Wait for `succeeded` and read its `interpretation`. On `ready`, read it; on `degraded` or `failed`, ask once if you need it, never in a loop. `timeout` is not a failure: the indicators are fine.

Applies to: capture-server >=0.11.0.

More: https://devlab.neurologyca.com/docs/sdk/processing.md

### Treating the `interpreting` notice as a failure

**Symptom.** With `interimWebhook: true`, deferred jobs end in a false `timeout` and their videos are never deleted.

**Cause.** `interpreting` is a notice, not an end: the job is still waiting for the interpretation. An `onEvent` that treats every status but `succeeded` as a failure closes the job, so the token renewal is denied.

**Fix.** Branch on `interpreting` first. Delete the video at `interpreting` or at `succeeded`, whichever comes first; keep the job open until `succeeded`, and let a late `interpreting` reopen nothing. Update the handler before turning `interimWebhook` on.

Applies to: capture-server >=0.11.0.

More: https://devlab.neurologyca.com/docs/sdk/processing.md

### The upload is complete, but the processing service never gets it

**Symptom.** Every byte is uploaded, yet `uploadRecording` keeps retrying `complete` (503 `E_NOTIFY_FAILED`, `Retry-After: 30`) for minutes and then rejects with `E_UPLOAD_NOT_NOTIFIED`. Your backend logs `E_UNAUTHORIZED` (or a network error) from `submit`.

**Cause.** The recording is stored on your backend; what failed is your `onComplete`, which hands it to the processing service: the service is down, or it does not accept your service key or the client registered for it.

**Fix.** Do not show it as a failed upload: say it is uploaded and waiting to be handed over. Retry from your backend (`receiver.pendingNotifications()` and `receiver.notify()` every minute), log the `ProcessorError` code without the body, and check the service key (`E_UNAUTHORIZED` is a configuration error: retrying alone will not fix it).

Applies to: capture 0.29.2 or later and capture-server 0.11.0 or later.

More: https://devlab.neurologyca.com/docs/sdk/deferred.md · https://devlab.neurologyca.com/docs/sdk/processing.md

### Cancelling from the page once the upload is complete

**Symptom.** After the upload completes, `abandonUpload` (a `DELETE` on your receiver) answers 409 `E_ALREADY_COMPLETE`; your page says the recording was discarded, but your backend keeps the job, keeps retrying it and may still process it.

**Cause.** A complete upload belongs to your backend: its owner can only abandon an unfinished one.

**Fix.** Give your page its own cancel route on your backend (the user's session, only their own capture): close the job as cancelled, stop handing tokens for it, delete the video with `receiver.remove()` (it throws `UploadBusyError` while that capture's `onComplete` runs: retry later), and have `onComplete` skip a capture you already closed. Say «discarded» only when your backend confirms it.

Applies to: capture-server 0.11.0 or later.

More: https://devlab.neurologyca.com/docs/sdk/deferred.md · https://devlab.neurologyca.com/docs/sdk/processing.md

### Pointing the processing service at localhost

**Symptom.** Testing on your machine, jobs fail with `E_DESTINATION_NOT_ALLOWED`, or the service never downloads the video nor calls your webhook.

**Cause.** Neurologyca's processing service only calls a public `https:` origin: it refuses `http:`, `localhost`, private and loopback addresses, redirects and URLs with credentials.

**Fix.** Set `PUBLIC_BASE_URL` to your backend's public HTTPS origin and build the video URL, `tokenUrl` and `webhookUrl` from it. On your machine, open a public HTTPS tunnel (cloudflared or ngrok), put its origin in `PUBLIC_BASE_URL` and close it when you finish; or deploy. Then `retry` the failed jobs: it is not a blind retry.

Applies to: Neurologyca's processing service.

More: https://devlab.neurologyca.com/docs/sdk/processing.md

### Trusting the service's IP instead of the signature

**Symptom.** Your token URL or your webhook skips the signature check because the three routes are limited to the service's outbound IP.

**Cause.** That IP is the same for every organization: another one can make the service call your routes from it. Limiting by IP is defense in depth, not authentication.

**Fix.** Keep `createWebhookHandler` and `createProcessorTokenHandler` verifying the HMAC with your `PROCESSOR_SECRET`, and the receiver verifying the video URL's signature, whether you limit by IP or not.

Applies to: Neurologyca's processing service.

More: https://devlab.neurologyca.com/docs/sdk/processing.md

### Submitting a job without its parameters

**Symptom.** `submit` is refused with `400 E_BAD_REQUEST`, or with `400 E_JOB_PARAMS_CONFLICT`.

**Cause.** Neurologyca's service has one credential per organization for every protocol, so each job says its context and language: without `taxonomy.contextId` or `language` it answers `E_BAD_REQUEST`. A self-hosted processor whose client fixes them refuses another value with `E_JOB_PARAMS_CONFLICT`.

**Fix.** Send `taxonomy` (the page's `taxonomy.contextId`), `language` (the session's) and `transcribeSteps` on every `submit`, with `capture-server` 0.13.0 or later. With `E_JOB_PARAMS_CONFLICT`, send the client's values, or none. Do not retry the same call.

Applies to: capture-server >=0.13.0.

More: https://devlab.neurologyca.com/docs/sdk/processing.md

### The browser cannot record MP4/H.264

**Symptom.** The recording is refused with `E_RECORDER_UNSUPPORTED` (`classifyMediaError` says `recorder-unsupported`).

**Cause.** The deferred mode records MP4 with H.264 video; some browsers, such as desktop Firefox, cannot. Firefox is not a target: kodec has not been tested there.

**Fix.** There is no retry: offer another browser or the on-device mode.

Applies to: all published SDK versions.

More: https://devlab.neurologyca.com/docs/sdk/deferred.md · https://devlab.neurologyca.com/docs/sdk/errors.md

### A `capture-server` older than the service that waits

**Symptom.** While a job waits for its interpretation, every `submit` and `getJob` rejects with `E_PROCESSOR_PROTOCOL`, and the phone keeps retrying `complete` against a `503`.

**Cause.** A `capture-server` before 0.11.0 does not know the `interpreting` status the processing service now reports, even with `interimWebhook` off.

**Fix.** Upgrade your backend to `capture-server` 0.11.0 or later.

Resolved in capture-server 0.11.0: update to it.

More: https://devlab.neurologyca.com/docs/sdk/processing.md · https://devlab.neurologyca.com/docs/start/install.md

### Recording a `<video>` with an SDK older than 0.27.2

**Symptom.** A recording from a `<video>` or a stream is refused by the processing service (`E_MANIFEST_INVALID`), or Engine takes several times longer to process it.

**Cause.** 0.27.0 closed the last step past the end of the recorded file, and 0.27.0 and 0.27.1 recorded a `<video>` at the screen's refresh rate instead of 30 fps.

**Fix.** Use 0.27.2 or later, and record again what was recorded from a `<video>` with 0.27.0 or 0.27.1.

Resolved in 0.27.2: update to it.

More: https://devlab.neurologyca.com/docs/sdk/deferred.md

