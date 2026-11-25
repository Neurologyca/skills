# Known pitfalls: HTTP API

## Contents

Each `###` below is one pitfall, open ones first: the ones of the HTTP API together with the ones of every path. The same list, in English and Spanish, is at https://devlab.neurologyca.com/docs/resources/pitfalls.md.

## HTTP API and every path

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

### No interpretation over HTTP: `triggerAnalysis` left out

**Symptom.** Every batch answers `202` and the indicators arrive, but `constellation.complete` never does.

**Cause.** Over HTTP an omitted `triggerAnalysis` means no interpretation is requested; the SDK does the opposite.

**Fix.** On an interpreted protocol, send `triggerAnalysis: true` on the `Final` of the last step, or call `POST /analyze` when the results are ready.

Applies to: API.

More: https://devlab.neurologyca.com/docs/api.md · https://devlab.neurologyca.com/docs/concepts/limits.md

### A `Final` sent right after the batch before it

**Symptom.** The step's aggregate misses the last batches before the `Final`.

**Cause.** Engine aggregates the step when the `Final` arrives, and the batch just before it may still be in process.

**Fix.** Before each `Final`, wait 2.5 s since the previous accepted batch, as the SDK does.

Applies to: API.

More: https://devlab.neurologyca.com/docs/api.md

### Batches that break the step contract

**Symptom.** Batches answer `202` but the position never completes, or the interpretation is not asked for, or the `Final` answers `400`.

**Cause.** Each step is numbered on its own: `kpnfile.order` starts at 1 in every step, and every step needs its own `Final`. `triggerAnalysis` only counts on the `Final` of the last step, and a batch needs at least one frame.

**Fix.** Restart `kpnfile.order` at 1 for every step, close every step with a `Final` that carries frames, send `triggerAnalysis` only on the last step's `Final`, and keep each batch at 300 frames or 3 MB of frames at most, whichever comes first, as the SDK does (in a free-flow mechanic, add `mechanicComplete: true` there too).

Applies to: API.

More: https://devlab.neurologyca.com/docs/api.md · https://devlab.neurologyca.com/docs/concepts/limits.md

### A `Final` with batches missing

**Symptom.** The `Final` of a step answers `400` with `qualityCode: "KPN-EMO-MISSING-PACKETS"` and a `missingOrders` list.

**Cause.** Earlier batches of that step did not arrive. That `Final` stored nothing.

**Fix.** Resend the batches listed in `missingOrders`, then send the `Final` again.

Applies to: API.

More: https://devlab.neurologyca.com/docs/concepts/limits.md · https://devlab.neurologyca.com/docs/reference.md

### Reading a batch `400` without its `qualityCode`

**Symptom.** A batch answers `400` and retrying it changes nothing.

**Cause.** When a batch breaks the contract, the body says why in `qualityCode` (`KPN-EMO-…`). Only some of the reasons can be fixed by sending again.

**Fix.** Branch on `qualityCode` with the table of Limits: fix the `step` on `KPN-EMO-STEP`, the `mediaId` on `KPN-EMO-MEDIA` and the frames on `KPN-EMO-FRAME-MALFORMED`, resend on `KPN-EMO-MISSING-PACKETS`, and do not retry the rest.

Applies to: API.

More: https://devlab.neurologyca.com/docs/concepts/limits.md

### Frames with 468 landmarks or another shape

**Symptom.** A batch or a baseline batch answers `400` with `qualityCode: "KPN-EMO-FRAME-MALFORMED"`; or, where Engine does not check the frame shape yet, every batch answers `202` and the session never closes.

**Cause.** Each frame needs exactly 478 landmarks of 3 coordinates (468 face + 10 iris) and 52 blendshapes, or both empty for a frame with no face. Classic MediaPipe without iris gives 468. Engine is rolling out a check of this shape: where it applies, it rejects the whole batch and stores nothing.

**Fix.** Turn the iris on (FaceLandmarker with iris), send the 52 blendshapes in MediaPipe's order, fix the bad frames (on a capture batch, `firstMalformedFrame` and `malformedFrames` point to them; the baseline's `400` documents only the `qualityCode`) and send the batch again. Or use the SDK, which sends the right shape.

Applies to: API.

More: https://devlab.neurologyca.com/docs/api.md · https://devlab.neurologyca.com/docs/concepts/limits.md

### Waiting for `results.ready` after each step

**Symptom.** Your code waits for a `results.ready` after every step, or for one with a given `stepOrder`, and hangs or reads too early.

**Cause.** `results.ready` arrives once per position, when its capture is complete, and not in every case: in a position that asked for the interpretation it normally does not arrive (`constellation.complete` does), and in rare cases it arrives twice. Its `stepOrder` is not always the last step's.

**Fix.** Treat it as a signal, not as the truth: keep polling `GET /results/{userProtocolId}/{protocolMechanicId}` as the fallback until it has data, and ignore its `stepOrder`.

Applies to: API.

More: https://devlab.neurologyca.com/docs/api.md · https://devlab.neurologyca.com/docs/concepts/results.md

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

### Blaming `taxonomyWarnings` for a failure

**Symptom.** `POST …/context` answers `201` with `taxonomyWarnings` (`UNKNOWN_CONTEXT`, `UNKNOWN_HCI`) on the very ids your kit gives you.

**Cause.** Engine checks the ids against its local copy of the taxonomy. In the test environment's Engine that copy is refreshed at start-up and every 6 hours, so a warning right after a taxonomy change can be that wait. Those warnings do not stop the analysis.

**Fix.** Read the list and log it, but what confirms the context works is that `POST /analyze` answers. Look elsewhere for the cause of a `422`.

Applies to: API.

More: https://devlab.neurologyca.com/docs/api.md

### Block or unblock filters sent in the body

**Symptom.** `POST /users/block` or `/users/unblock` acts on every user within the key's reach instead of the one you meant (before Engine's 2026-11-02 change in the test Engine, which answers `400` to a call with no filter or with a body; the production Engine still does it).

**Cause.** Their filters (`externalId`, `role`, `developer`) are read from the query string. In the production Engine a body is not read, and with no filter the call applies to every user within your reach; the test environment's Engine answers `400` instead, unless the call carries `all=true`.

**Fix.** Put the filters in the query (`?externalId=…`), and refuse in your own code to send the call without one. Use `all=true` only on purpose, to act on everyone within reach.

Applies to: API.

More: https://devlab.neurologyca.com/docs/reference.md

### The interpretation comes back in the wrong language

**Symptom.** The transcript is in the right language (you set `transcribe: { language }`), but the interpretation Engine returns is in English for a capture in Spanish; or you changed the person's language and an earlier session still comes back in the old one.

**Cause.** The interpretation's language is the person's, not the capture's: `narrative.language` with the SDK, `narrativeLanguage` in the HTTP API, `en` when it is not set. `transcribe.language` only sets the transcript, and `/analyze` carries no language. Engine reads the person's language when it interprets: a session not interpreted yet comes out in the language the person has at that moment, and one already interpreted comes back in its own language, even after you change the person. The SDK's backend sends `narrativeLanguage: 'en'` when `narrative.language` is not set.

**Fix.** Choose the language of whoever is going to read the interpretation: if the person reads it, their spoken language; if someone else reads it, that reader's language, even when the person speaks another. Set it per person, not as one value for the whole project, in `createUser`/`updateUser` (`narrative: { language }` with the SDK; `narrativeLanguage` in `POST /users` or `PATCH /users/{externalId}`), before the session. A `PATCH` keeps the fields you leave out and `null` removes one. For a session already interpreted in the wrong language, update the person and ask from your backend with `reAnalyze: true`: it rewrites it in the person's current language and costs a new interpretation. `/analyze` without `reAnalyze` returns the stored one, in its language; `/analyze/stream` generates a new one every time.

Applies to: all published SDK versions.

More: https://devlab.neurologyca.com/docs/sdk/backend.md · https://devlab.neurologyca.com/docs/concepts/results.md

### A hand-written proxy that forwards anything, or lets `reAnalyze` through

**Symptom.** The proxy works, but a crafted request from the browser can reach routes beyond the 13 the SDK needs, or force a new interpretation.

**Cause.** The proxy is a pass-through with your Engine key instead of an allowlist. Anything the browser can send reaches Engine with your key.

**Fix.** Forward only the 13 routes and answer `404` for anything else; strip `reAnalyze` from the bodies of `/analyze` and `/analyze/stream` so a page cannot force a paid re-interpretation. `createEngineProxy` with `ownsAll` does both.

Applies to: all published SDK versions.

More: https://devlab.neurologyca.com/docs/api/proxy.md · https://devlab.neurologyca.com/docs/concepts/results.md

