# The capture cycle, call by call

## Contents

- [Who calls what](#who-calls-what)
- [1. Token](#1-token)
- [2. The person](#2-the-person)
- [3. The enrolment, the position and the plan](#3-the-enrolment-the-position-and-the-plan)
- [4. The stream](#4-the-stream)
- [5. The context](#5-the-context)
- [6. The batches](#6-the-batches)
- [7. The results](#7-the-results)
- [8. The interpretation](#8-the-interpretation)

The fields below come from Engine's published spec and from the HTTP path the playground runs. When a field is not listed here, look it up in the JSON spec (https://devlab.neurologyca.com/openapi/engine-v2.json, search the operationId) instead of guessing it: in a batch, a misspelled field is ignored with a `202`, not rejected.

## Who calls what

- Your backend holds the key (`ENGINE_API_KEY`) and the Engine URL (`ENGINE_BASE`). `ENGINE_BASE` comes filled in `.env.example` of the kit (Your integration → Protocols → a protocol → Kit); the key does not: reveal it in Your account and API key (Engine keys › Reveal) or download a starter with «Include my key». It mints the token, creates the person and enrols them.
- The capture calls (position, plan, stream, context, batches, results, interpretation) can go from your backend, or from a page through a proxy of yours that adds `Authorization: Bearer <token>` (https://devlab.neurologyca.com/docs/api/proxy.md). The page never sees the key, the token or the Engine host.
- A browser cannot set headers on an event stream: that is one more reason to open it through your proxy.

## 1. Token

- Request: `apiKey`.
- Answer `200`: `token` and `expiresIn` (seconds).
- Cache it and mint again shortly before `expiresIn` runs out. There is no refresh route: you call the same route again.
- The route is rate limited per client IP: never mint one token per request.
- On a `401` from any other route (the token expired, or its key was rotated or revoked), drop the cached token, mint a new one and retry that call once, as the playground's backend does.
- A `401` from this route means the key is malformed, unknown, revoked or expired.

See https://devlab.neurologyca.com/docs/start/authentication.md. Route: `POST /token` (operationId `GetToken`).

## 2. The person

- Request: `externalId` and `name` (required); optional `role`, `audience`, `narrativeVoice`, `narrativeDepth`, `narrativeLanguage`, `timezone`.
- Answer `201`: the person as created.
- `409`: there is already a person with that `externalId` in your organization. Reuse them: that is what the playground's backend does.
- Use your own stable id for `externalId`, one per real person. The baseline and the results hang from it.
- To change the audience of an existing person, send `audience` to `PATCH /users/{external_id}` (operationId `UpdateUser`) (`null` removes it, and Engine then applies the default reading).

Route: `POST /users` (operationId `CreateUser`).

## 3. The enrolment, the position and the plan

The enrolment:

- Request: `user` (the `externalId`) and `protocol` (the `PROTOCOL_ID` of your kit); optional `contextPid`, the context this enrolment is for, as its `pid` in `GET /catalog/contexts` (operationId `ListCatalogContexts`). Send it only when the protocol belongs to more than one of your contexts; otherwise leave it out and the only one is used. The context decides which indicators you receive.
- Answer `201`: `userProtocolId`, `status`, `baselineWarning` and `protocolNotice`. Save `userProtocolId`: every later call uses it.
- `400` with `reason: CONTEXT_REQUIRED`: the protocol belongs to more than one of your contexts and no `contextPid` was sent; retry with the one this enrolment is for. `400` with `reason: CONTEXT_NOT_VALID`: that `contextPid` is not one of your contexts that includes this protocol; take it from `GET /catalog/contexts` (operationId `ListCatalogContexts`), or leave it out. Only over the HTTP API: the SDK does not send `contextPid` today.
- The same protocol can be assigned to the same person more than once. One position takes one completed capture: to measure again, enrol again.

Route: `POST /user-protocols` (operationId `CreateUserProtocol`).

The next position:

- Answer `200`: `nextProtocolMechanic.protocolMechanicId` (the second id of the pair; without it, the protocol is complete), `mechanics` (a checklist), `baselineWarning` and `protocol`.
- `protocol.interpreted` says whether the protocol is interpreted; not every Engine returns it yet (https://devlab.neurologyca.com/docs/concepts/sessions.md).

Route: `GET /user-protocols/{userProtocolId}` (operationId `GetUserProtocol`).

The plan of the position:

- Answer `200`: `mechanic.steps[]`, each with its `order`, its `type` and its media (`media[].pid`), and `mechanic.flowMode` (`fixed` or `free`).
- Send the steps in `order`. The `pid` of the media a step shows goes as `mediaId` in every batch of that step.

Route: `GET /user-protocols/{userProtocolId}/mechanics/{protocolMechanicId}` (operationId `GetMechanicScript`).

## 4. The stream

- Open it before the first batch and keep it open for the whole position. The first event is `connected`.
- `results.ready`: the indicators are computed and no interpretation follows. Once per position, not per step; ignore its `stepOrder`.
- `constellation.complete`: the interpretation is stored, which also means the indicators are there. It comes without `structured_data.temporal_profile.trajectory`; read that with `/analyze`.
- `processing.error`: something failed, `{ errorCategory, stage, final, message }`. `final: false` means Engine retries on its own (results or `constellation.complete` may still come); `final: true`, nothing more is tried. If `stage` is `interpretation`, the indicators are already in `/results`.
- `hci.warning`: a warning about an indicator, once per batch, and only for an indicator your context includes. Engine also sends the level that triggers it (`threshold`); do not use it as an alert, do not build on it, and do not wait for the event.
- `stream.end` with a `reason`: the server closed it. After `idle_timeout`, reconnect; after `credential_rotated` or `credential_scope_changed`, mint a new token first; after `credential_revoked`, `credential_deleted` or `credential_expired`, get a valid key before minting (Your account and API key › Engine keys; the kit does not hold it).
- Treat `results.ready` or `constellation.complete` as the end of the capture, and keep a time limit of your own.

Route: `GET /stream/{userProtocolId}` (operationId `StreamUserProtocol`).

## 5. The context

- Only for an interpreted protocol, before the first frame of the position.
- Request, from your kit's `taxonomy`: `constellationContextId` = `taxonomy.contextId`; `constellationHciId` = `taxonomy.hciId`, if there is one; `subcontextId` = `taxonomy.subcontextByMechanic[<the mechanic's name>]`, or else `taxonomy.subcontextId`. The mechanic's own subcontext wins over the general one, as the SDK and the playground do. Without `subcontextId`, Engine uses the mechanic's `constellationSubcontextId` (from the catalogue and the script) or, if it has none, the context's default.
- With Measurement there is no taxonomy: the SDK still calls this route with an empty body, and Engine answers `200` with `contextStored: false`. You can do the same or leave the call out.
- Answer `201`: the context is stored, with `taxonomyWarnings` (`null` when every id checks out). The warnings do not stop the analysis.
- Fields you leave out in a later call keep their previous value.
- `409` with `POSITION_ALREADY_COMPLETED`: the position already has a completed capture.

Route: `POST /user-protocols/{userProtocolId}/{protocolMechanicId}/context` (operationId `SetContext`).

## 6. The batches

- Request: `userProtocolId`, `protocolMechanicId`, `step` (the step's `order`), `kpnfile` (`order` and `status`, `Partial` or `Final`), `frames` (at least one), and on the right batch `triggerAnalysis`, `mechanicComplete` and `mediaId`.
- Each frame carries facial landmarks (the MediaPipe face mesh), blendshapes and head pose, plus `featuresMeta`. Frames without `featuresMeta` give no valence or arousal axes, and the `202` counts them in `framesWithoutFeaturesMeta`. The exact format of a frame, and the transcript on the last `Final`: [frames.md](frames.md).
- Answer `202`: accepted and queued. The indicators come later, through the stream and `/results`.

The rules of the batches, step by step: [batches.md](batches.md). Route: `POST /process-kpn-emo` (operationId `ProcessKpnEmo`).

## 7. The results

- Answer `200`: `rawResults` (one entry per step, with its `stepType` and the frames' indicators) and `aggResults`.
- Read too early, it answers `200` with empty `rawResults` and `aggResults`, or `404`. Poll a few times, a few seconds apart, until a step has more than its `stepType`.
- `speech` (only in the test environment's Engine): per step, with the same keys as `aggResults`, `questionText` (the question shown, in the language of the person's narrative) and `transcript` (what you sent for that step in `sttByStep`). A step appears only with one of the two; with nothing, `{}`. Joining the `transcript` values is not the full text: speech outside a step is not there.
- The same route exists per step (`…/{stepOrder}`) and per enrolment (there, `speech` goes inside each item of `mechanics[]`).
- Later, from your backend: mint a token and read the same route with the pair you saved at enrolment.

Scales and meaning: https://devlab.neurologyca.com/docs/concepts/results.md. Route: `GET /results/{userProtocolId}/{protocolMechanicId}` (operationId `getResultsByPosition`).

## 8. The interpretation

- Request: `userProtocolId` and `protocolMechanicId`; optional `audience` (only the audiences your kit lists for the context, in `KIT.md` under Audiences: an unknown one is accepted without an error, echoed in `audience_applied` and generated as one more interpretation with the default reading; a context with no audiences needs none; without `audience`, Engine applies the person's, or the one `KIT.md` marks as the default) and `step`.
- Answer `200`: `interpretation` (the text), `structured_data` (`headline`, `insight`, `sections[]` with their `key`), `metadata.status`, `audience_applied` and `from_cache`.
- It is generated once per audience and then served from storage (`from_cache: true`) when its analysis came out complete; with `metadata.status` `degraded` or `failed` (or none stored yet), every call regenerates it, costing time and LLM tokens: ask once, never in a loop. A call with `step` is never cached: each one computes again. It can take a minute or two after the position completes: wait for `constellation.complete`, or give a blocking call a long timeout (https://devlab.neurologyca.com/docs/guides/timeouts.md).
- `metadata.status: "failed"`: never show it; the indicators are still valid. `"degraded"`: show it with a notice.
- When `structured_data.insight` is `null`, show `structured_data.headline`, and if that is `null` too, the first entry of `sections[]` (some interpretations have no headline by design); match sections by `key`, never by `title`.
- Some domains also publish a 0 to 100 index in `structured_data`, under its own key (for example `wellness_index`): `{ value, band, status, indicators_used, degraded_signals, label }`. Show `value` as it comes (an integer, never recomputed), no number with `status: "not_shown"` (`value` and `band` are `null`), mark `"degraded"` as a less reliable reading, and show `label` as it comes next to the number: the complete sentence in the narrative's language (with `"degraded"` it already says so), never composed, translated or compared in tests; it is `null` with `"not_shown"` and in interpretations stored before it (`band` is a key: `low`, `medium`, `high` for `wellness_index`). It is missing from interpretations stored before the index existed (a `reAnalyze` brings it) and from the lightweight analysis, which does not compute it. Another index will arrive under another key with the same shape.
- Some interpretations also bring three **Preview** fields in `structured_data` (seen so far only in the test environment's Engine; they can change or disappear until Neurologyca confirms them, so read them only when present): `primary_emotion.term` (a catalogue term in English), `selected_ehcis[]` (the indicators the context declares relevant, in the order it declares them, each with `id` and `measured_value`, the whole-session value; the `id` is not the `/results` key, and only public indicators are meaningful, never Motivation nor the four that need previous sessions) and `pairs[]` (each with `index`, `status`, and `windows.opening.order` and `windows.closing.order`, the step orders where a question opens and closes; an answer in the step after its question comes `incomplete` with the note `question_from_preceding_step` and only the closing order; ignore a pair whose orders are not in your results or whose `status` you do not know). Rely on nothing else of `structured_data` or of each pair.
- To read it again later without paying, send the `audience` it was written for (`audience_applied`) and never `reAnalyze`; languages, audience, what to show and results per question: [reading-the-response.md](reading-the-response.md).
- `POST /analyze/stream` generates a new interpretation on every call and Engine does not store it: use it only to show progress, and read the stored one with `POST /analyze`.
- `202` with `reason: ANALYSIS_IN_PROGRESS`: Engine is still analysing that session (not for calls with `step`). Wait for `constellation.complete`, or call again after `retryAfterSeconds`.
- `404`: the position has no completed capture yet, or the ids are not yours. `409` with `PROTOCOL_NOT_ANALYSED`: the protocol is not interpreted, such as Measurement.

Route: `POST /analyze` (operationId `Analyze`).
