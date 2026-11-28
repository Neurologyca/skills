---
name: neurologyca-engine-api
description: "Integrates Neurologyca's Engine 2 HTTP API directly from a backend in any language: integrar Engine por la API HTTP, con token, personas, inscripciones, lotes de frames, SSE, resultados, interpretación, audiencia e idioma. Use it when calling Engine's routes yourself (token, users, user-protocols, process-kpn-emo, stream, results, analyze), sending Engine the frames you already computed, or debugging qualityCode, KPN-EMO-MISSING-PACKETS, 409 conflict reasons, 422 interpretations or an interpretation regenerated on every read. For a web app with the capture in the browser and a Node.js backend, use neurologyca-capture instead. Not for computing landmarks yourself (MediaPipe) or storing them: only for talking to Engine."
license: "Neurologyca Agent Skills License 1.0 (LICENSE.txt; published at /legal/skills-license): read freely; install and use with a Neurologyca account."
compatibility: "Any language that speaks HTTPS from a backend; the key never leaves it. The scripts need Node.js 20 or later."
metadata:
  version: "1.1.39"
  sdk: "0.46.1"
  captureServer: "0.21.0"
  engineApi: "v2"
  environment: "devlab"
  docs: "https://devlab.neurologyca.com/docs"
  verifiedAt: "2026-11-27"
---

# Integrating Neurologyca through Engine's HTTP API

## When to use it

- Use this skill when you call Engine's routes yourself: from a backend in another language or on another platform, or when you already have the frames (landmarks, blendshapes and head pose) computed by your own pipeline.
- A web app with the capture in the browser and a Node.js backend should use the `neurologyca-capture` skill instead: the SDK is the recommended path and runs this whole cycle for you.
- Next to the SDK, the HTTP API is complementary: call it from your backend in any language to check processing status, retrieve results, browse available protocols, manage the people of your organization and run your backend's own tasks. Most integrations combine both.
- The docs of this DevLab: https://devlab.neurologyca.com/docs. Every route, field and code below is checked against Engine's published spec and the docs; when the docs and your memory disagree, the docs win.

## Step 0: ask for the kit

Do not invent `contextId`, `PROTOCOL_ID`, `ENGINE_BASE` or `ENGINE_API_KEY`.

- They come from your team's kit. The exact route, signed in as the integrator at https://devlab.neurologyca.com/integration: **Your integration → Protocols → a protocol → Kit** (each protocol has its own kit, generated there; it is not a package Neurologyca sends). It holds `.env.example` (your backend's `ENGINE_BASE`, already filled in with your environment's Engine URL, an empty `ENGINE_API_KEY` and `PROTOCOL_ID`), `neuro.config.json` (the protocol's `taxonomy`, which you send to the context route) `KIT.md` (what is still to settle, the typical calls, and the `DevLab:` line that says which DevLab the kit comes from) and `AGENTS.md` (the rules and the page index for the project's agent).
- The Engine key is **not** in the kit: reveal it in **Your account and API key › Engine keys › Reveal** (it asks for your password), or download a starter from the Kit page with «Include my key», which writes it into the `.env` of the zip. It lives only in your backend, never in git.

- Respect what `KIT.md` says is still to settle: ask Neurologyca before recording anyone.
- Without the kit, stop and ask the user for it. A plausible `contextId` does not fail early: the context route answers `201` with warnings and the interpretation is refused at the end (https://devlab.neurologyca.com/docs/concepts/protocols.md).
- `userProtocolId` and `protocolMechanicId` are not configuration: your backend gets them at run time, from the enrolment and from the next position.

The kit is generated for the JavaScript SDK and its starters. From another language, take `ENGINE_BASE`, `PROTOCOL_ID` and the protocol's `taxonomy` (and, in a context's kit, `NARRATIVE_LANGUAGE`); the rows about loading `neuro.config.json` in the browser, the starter zip and `PORT` belong to the Node starters and do not apply to you.

| File | Where it appears | What it is |
| --- | --- | --- |
| `neuro.config.json` | Always. | The client configuration of your protocol: pass it to defineTenantConfig(json). |
| `.env.example` | The kit in your console. | The environment of your backend, without your key: copy it to .env and fill it in. Never commit .env. |
| `.env` | The starter zip (live or recording). | The environment of your backend. The key is empty unless you downloaded the starter with «Include my key». Never commit it. |
| `.npmrc` | Always. | Keeps @neurologyca on the public npm registry (registry.npmjs.org), even if an older ~/.npmrc still sends the scope elsewhere. No token and no secret: the SDK is public. |
| `KIT.md` | Always. | The kit in prose: the SDK versions it is made for (with the command to check yours and the changelog), a link to the indicators your context gives you (Your integration › Protocols), start order, the notice to give the people you measure (with the model text of the Biometric Addendum and, in the recording starter, the prior written consent a deferred recording needs where the law requires it), what is pending, audiences, question options and links to the docs. |
| `AGENTS.md` | Always. | The rules and the docs index for your coding agent; paste it into your own AGENTS.md or CLAUDE.md. It is in English on purpose. |

| Variable | Where it appears | What it is |
| --- | --- | --- |
| `ENGINE_BASE` | Always. | The URL of your environment's Engine, already filled in from your kit. Your backend calls it; the browser never does. |
| `ENGINE_API_KEY` | Always. | Secret. Your team key, used only by your backend. It ships empty in the kit: download the starter with «Include my key», or reveal it in Your account. Never in browser code or git. |
| `PROTOCOL_ID` | Always. | The id of the protocol this kit is for. |
| `ROLE` | Context protocols (not Measurement). | Optional role set on each person your backend creates. The kit fills it only when Neurologyca fixed one for you, so it is often empty, and that is fine; if you set it, it must be one Engine knows. It has no effect today. |
| `NARRATIVE_LANGUAGE` | Context protocols (not Measurement). | The default for new people of the language of the interpretation (en or es). The language belongs to each person: your backend sets it when it creates them, as the language of whoever will read the interpretation. Without it, Engine writes in English. |
| `PORT` | Always. | The port your backend listens on (3000 by default). |
| `PROCESSOR_URL` | The recording starter (deferred); in the console kit, only when your organization has the processing service. | The URL of Neurologyca's processing service for deferred captures. Empty if your organization does not have it set up. |
| `PROCESSOR_API_KEY` | The recording starter (deferred); in the console kit, only when your organization has the processing service. | Secret. The key of the processing service, one pair for your whole organization. Filled only when you download the recording starter with «Include my key and the processor credentials». It stays empty if the processing service is off or not set up for your organization yet. |
| `PROCESSOR_SECRET` | The recording starter (deferred); in the console kit, only when your organization has the processing service. | Secret. The secret that signs the processing service webhooks; verifying the signature is mandatory. Filled together with PROCESSOR_API_KEY, and empty in the same cases (service off or not set up yet). |
| `PUBLIC_BASE_URL` | The recording starter (deferred); in the console kit, only when your organization has the processing service. | The public HTTPS origin of your backend. The processing service calls three routes there (video, token and webhook); it never calls localhost, so to test locally use a public HTTPS tunnel. |
| `UPLOAD_URL_SECRET` | The recording starter (deferred); in the console kit, only when your organization has the processing service. | Secret. Yours alone: it signs the URLs of your videos, and differs from PROCESSOR_SECRET. Every download of the recording starter carries a new random value (a new download changes it and invalidates URLs already signed). In the console kit (.env.example) it is empty: generate a random 32-byte hex string yourself. |

## Golden rules

- The Engine API key (`ENGINE_API_KEY`) lives only in your backend: never in a client app, a mobile binary, a log or git. Exchange it for a token with `POST /token`.
- Never invent `contextId`, `PROTOCOL_ID`, `ENGINE_BASE` or the key: they come from your team's kit (https://devlab.neurologyca.com/integration → Your integration → Protocols → a protocol → Kit): `ENGINE_BASE` is already filled in `.env.example` (in a starter zip, `.env`). The key is not in the kit: reveal it in Your account and API key (Engine keys › Reveal) or download a starter with «Include my key», and never commit it. Without the kit, stop and ask for it.
- Start with Measurement: send `triggerAnalysis: false` on the last `Final`, and never call `/analyze` for it.
- Every step has its own batches, in order from `kpnfile.order` 1, and its own `Final`; a field you misspell is ignored with a `202`, so check every field against the spec.
- Use the same person for the baseline and the measurement.
- Call `/analyze` once when you need the interpretation: with `metadata.status` `degraded` or `failed` every call regenerates it and costs, so never in a loop.
- These docs win over what you remember: if a route, field or code is not in them, it does not exist.

## The capture cycle

One capture is one position of a protocol a person is enrolled in. All calls go from your backend with `Authorization: Bearer <token>`; a browser only ever talks to your backend or your proxy (https://devlab.neurologyca.com/docs/api/proxy.md). The detail of every request and response is in [references/capture-cycle.md](references/capture-cycle.md).

1. **Token.** Exchange your key for a token: `POST /token` (operationId `GetToken`).
   - The answer carries `token` and `expiresIn` (seconds: read it, do not assume it).
   - Cache the token and mint a new one shortly before it expires: the route is rate limited per IP.
   - On a `401` from any other route, mint a new token and retry that call once. See https://devlab.neurologyca.com/docs/start/authentication.md.
2. **The person.** Create them once with `POST /users` (operationId `CreateUser`).
   - `externalId` and `name` are required; `externalId` is unique in your organization. Use your own stable id, one per real person.
   - A `409` means that `externalId` already exists: reuse the person.
3. **The enrolment, the position and the plan.**
   - Enrol the person (`user` = the `externalId`, `protocol` = `PROTOCOL_ID`) with `POST /user-protocols` (operationId `CreateUserProtocol`), and save the `userProtocolId`.
   - Only if the protocol belongs to more than one of your contexts, add `contextPid` (its `pid` in `GET /catalog/contexts` (operationId `ListCatalogContexts`)): without it Engine answers `400` with `reason: CONTEXT_REQUIRED`, and with one that is not of yours for that protocol, `CONTEXT_NOT_VALID`. The SDK does not send it today: this is HTTP API only.
   - Ask for the next position with `GET /user-protocols/{userProtocolId}` (operationId `GetUserProtocol`): `nextProtocolMechanic.protocolMechanicId` is the second id of the pair, and `baselineWarning` tells you when the person has no valid baseline (https://devlab.neurologyca.com/docs/concepts/baseline.md).
   - Read the plan with `GET /user-protocols/{userProtocolId}/mechanics/{protocolMechanicId}` (operationId `GetMechanicScript`): `mechanic.steps[]`, each with its `order` and its media, and `mechanic.flowMode`.
4. **The stream and the context.**
   - Open the event stream `GET /stream/{userProtocolId}` (operationId `StreamUserProtocol`) before the first batch and keep it open.
   - On an interpreted protocol, send the taxonomy of your kit (`constellationContextId`, optional `constellationHciId` and `subcontextId`) before the first frame, with `POST /user-protocols/{userProtocolId}/{protocolMechanicId}/context` (operationId `SetContext`).
   - It answers `201`. Read `taxonomyWarnings` and log them: they only warn.
5. **The batches.** Send the frames of each step, in `order`, with `POST /process-kpn-emo` (operationId `ProcessKpnEmo`). Every accepted batch answers `202`.
   - Each step has its own batches: `Partial` ones while it runs (at most 300 frames or 3 MB of frames each, whichever comes first, as the SDK does: with a camera, the bytes come first) and one `Final` that is never empty.
   - In every batch of a step that shows media, `mediaId`: the `pid` of the media shown. In a mechanic with `flowMode: "free"`, `mechanicComplete: true` on the last `Final` too.
   - `step` is the step's `order`, and `kpnfile.order` starts at 1 in every step.
   - Wait 2.5 s after the previous accepted batch of the step before each `Final`.
   - Send `triggerAnalysis: true` only on the last step's `Final`, and only on an interpreted protocol. With Measurement, `false`. Left out, it means `false` over HTTP.
   - All the rules, and which ones Engine enforces: [references/batches.md](references/batches.md).
   - What each frame carries (478 landmarks, the blendshapes in MediaPipe's order with `_neutral` at 0, the head pose in radians, `featuresMeta`) and how to send the transcript: [references/frames.md](references/frames.md).
6. **The results.**
   - The stream says when the capture is complete: `constellation.complete` when an interpretation runs, `results.ready` when none follows (normally one of the two, rarely both). Treat either as a signal.
   - Then read `GET /results/{userProtocolId}/{protocolMechanicId}` (operationId `getResultsByPosition`): `rawResults` per step and `aggResults`.
   - If no event arrives in time, poll that route a few times, a few seconds apart, until `rawResults` has indicators.
   - Which indicators arrive depends on the context and on your organization's agreement, not on your key: see Your integration › Protocols, «Indicators you receive in this context» (`KIT.md` links to Your integration › Protocols). Treat every one as optional; to receive more, the user asks Neurologyca.
7. **The interpretation.** On an interpreted protocol, send `userProtocolId`, `protocolMechanicId` and an optional `audience` to `POST /analyze` (operationId `Analyze`).
   - It is generated once and then served from storage (`from_cache: true`), except calls with `step`, which are never cached; it can take a minute or two after the position completes (https://devlab.neurologyca.com/docs/guides/timeouts.md).
   - Never show one whose `metadata.status` is `failed`; show a `degraded` one with a notice.
   - Measurement is not interpreted: do not call `/analyze` for it.
   - The **audience** (who the reading is for) goes on the person (`audience` in `POST /users` (operationId `CreateUser`)) or in the `/analyze` body; the interpretation's **language** is the person's `narrativeLanguage`, never taken from the spoken one: choose the language of whoever is going to read it (the person's spoken language if they read it, the reader's if someone else does) and set it per person before the session; Engine reads it when it interprets, so a stored interpretation keeps its language until a paid `reAnalyze`. To read it again without paying for a new one, send the `audience_applied` it was written for and never `reAnalyze`: `from_cache: true` only for a `complete` one.
   - What to show (status, summary, sections, Preview fields), results per question (`pairs`, `speech`) and the audience in depth: [references/reading-the-response.md](references/reading-the-response.md).
   - To compare the readings of the audiences your kit lists before writing code, choose one in **Audience** in the playground (https://devlab.neurologyca.com/playground#measure): it sets `audience` on the test person with `PATCH /users/{external_id}` (operationId `UpdateUser`) before enrolling, as your backend can do.
8. **Responsible use.** Before going live: tell the person before measuring and collect their consent (that emotions are inferred and that an AI writes the reading), show each reading only to its declared reader, never use a reading on its own to decide about the person, and in a wellbeing use keep a route to help visible. What the readings are never for and what your app must do: https://devlab.neurologyca.com/docs/guides/responsible-use.md.

The flow that really runs is the HTTP path of the playground (https://devlab.neurologyca.com/playground, «How you integrate: HTTP API»), and the guide is https://devlab.neurologyca.com/docs/api.md.

## Where to look

| Question | Where |
| --- | --- |
| Every Engine route, one line each | https://devlab.neurologyca.com/docs/reference.md |
| The fields and answers of a route | https://devlab.neurologyca.com/openapi/engine-v2.json (search the route's operationId, which every route in this skill carries) |
| The full capture by HTTP, step by step | https://devlab.neurologyca.com/docs/api.md |
| A proxy of your own (Express, nginx) | https://devlab.neurologyca.com/docs/api/proxy.md |
| Keys, tokens, rotation and the capture token | https://devlab.neurologyca.com/docs/start/authentication.md |
| Sessions, abandonment, clocks and interruptions | https://devlab.neurologyca.com/docs/concepts/sessions.md |
| What the results hold, scales and live events | https://devlab.neurologyca.com/docs/concepts/results.md |
| The baseline: when and how | https://devlab.neurologyca.com/docs/concepts/baseline.md |
| Contexts, protocols, positions, mechanics and steps | https://devlab.neurologyca.com/docs/concepts/protocols.md |
| Limits, `qualityCode`, `reason` and the 2xx mistakes | https://devlab.neurologyca.com/docs/concepts/limits.md |
| Test or production environment | https://devlab.neurologyca.com/docs/start/environments.md |
| What changed between versions | https://devlab.neurologyca.com/docs/resources/changelog.md |
| Known pitfalls, all paths | https://devlab.neurologyca.com/docs/resources/pitfalls.md |
| What `/results` returns | `GET /results/{userProtocolId}/{protocolMechanicId}` (operationId `getResultsByPosition`) |
| Languages, audience, questions per step, what to show and reading again for free | https://devlab.neurologyca.com/docs/concepts/results.md, https://devlab.neurologyca.com/docs/guides/show-results.md and [references/reading-the-response.md](references/reading-the-response.md) |
| Responsible use: what the readings are never for, notice and consent, human review | https://devlab.neurologyca.com/docs/guides/responsible-use.md |
| Deleting a test person | `DELETE /users/{external_id}` (operationId `DeleteUser`) |
| Measurement only | https://devlab.neurologyca.com/docs/guides/measurement.md |
| How long the interpretation takes | https://devlab.neurologyca.com/docs/guides/timeouts.md |
| Coming from Engine 1.5 | https://devlab.neurologyca.com/docs/resources/migration.md |

## Verify your work

1. `node <this skill>/scripts/doctor.mjs <project>`: among its checks, that the key does not appear in what your app serves. It never prints the key. Fix what it reports and run it again.
2. Run one capture and compare your calls with the ones of the playground's HTTP path in https://devlab.neurologyca.com/playground, in the same order: token, person, enrolment, position, plan, stream, context, batches, results, interpretation.
3. Go through https://devlab.neurologyca.com/docs/guides/production-checklist.md before you go to production. Integrating into an application, to use it with people, needs a commercial agreement with Neurologyca first (https://devlab.neurologyca.com/docs/access/pricing.md).

Never print or log what the person said (`transcript`, the `speech` of `/results`) nor the interpretation (`interpretation`, `structured_data`), not even a few characters of it. To check them, count words or characters, or print `metadata.status`.

`doctor` reads your project and, outside it, only the npm settings that decide where `@neurologyca` installs from (the `npm_config_*` variables, and the `@neurologyca` scope line and the `registry=` line of your user and global npmrc), never printing a value; it runs no npm command, and it may also read this DevLab's public changelog, and a failure to reach it never fails the check.

## If something fails

| Symptom | Where it shows | Cause and fix |
| --- | --- | --- |
| Every call answers `401` | Any route, empty body with `WWW-Authenticate: Bearer` | The token expired, or its key was rotated or revoked: mint another and retry once (https://devlab.neurologyca.com/docs/start/authentication.md) |
| `401` on `POST /token` | The token route | The key is malformed, unknown, revoked or expired: reveal it again in Your account and API key (Engine keys › Reveal) (it is not in the kit) |
| A batch answers `400` and resending changes nothing | `qualityCode` in the body | Branch on `qualityCode`: fix the `step` on `KPN-EMO-STEP`, send `steps[].media[].pid` as `mediaId` on `KPN-EMO-MEDIA`, fix the frames on `KPN-EMO-FRAME-MALFORMED` (send 478 landmarks of 3 coordinates and 52 blendshapes, or both empty), do not retry the rest (https://devlab.neurologyca.com/docs/concepts/limits.md) |
| The `Final` answers `400` with `KPN-EMO-MISSING-PACKETS` | `qualityCode` and `missingOrders` | Earlier batches of that step did not arrive and that `Final` stored nothing: resend the batches in `missingOrders`, then the `Final` again |
| A `409` from a batch, the context or `/analyze` | `reason` in the body | Branch on `reason` (`SESSION_ABANDONED`, `POSITION_ALREADY_COMPLETED`, `MECHANIC_EXPIRED`, `MECHANIC_NOT_YET_AVAILABLE`, `MUST_START_AT_FIRST_POSITION`, `PROTOCOL_DEPRECATED`, `POSITION_RESERVED`, `CAPTURE_DISCARDED`, `CAPTURE_OUT_OF_ORDER`, `PROTOCOL_NOT_ANALYSED`, `CAPTURE_CANCELLED`), never on `message`; the table is in https://devlab.neurologyca.com/docs/concepts/limits.md |
| Every interpretation answers `422` | `/analyze` | A context id that is not from your kit, or your organization is not active in the interpretation service (the body does not say which): compare the id with the kit, do not recapture, tell Neurologyca |
| `/analyze` answers `202` with `ANALYSIS_IN_PROGRESS` | `/analyze` | Engine is still analysing that session: wait for `constellation.complete` or call again after `retryAfterSeconds`; it is not "no interpretation" |
| `results.ready` never arrives | The stream | It comes once per position, and not when an interpretation runs (`constellation.complete` does): poll `/results` as the fallback |
| Batches answer `202` but `constellation.complete` never comes | The stream | `triggerAnalysis` left out on the last `Final`: over HTTP that asks for no interpretation |
| `201` with `UNKNOWN_CONTEXT` or `UNKNOWN_HCI` | `taxonomyWarnings` of the context route | They only warn (Engine's copy of the taxonomy can lag; the test environment's refreshes it every few hours); what confirms the context is that `/analyze` answers. Look elsewhere for a `422` |
| The stream closes with `stream.end` and `reason: credential_…` | The stream | The key behind the token changed. After `credential_rotated` or `credential_scope_changed`, mint a new token (with the new key after a rotation) and reconnect; after `credential_revoked`, `credential_deleted` or `credential_expired`, a new token does not help: get a valid key first (Your account and API key › Engine keys; the kit does not hold it) |
| `/users/block` acted on every user | The block and unblock routes | Their filters are read from the query, not the body; refuse to send the call without one (`all=true` only on purpose). The test environment's Engine answers `400` with no filter or with a body |
| `429` | `POST /token`, or a proxy in front of Engine | Too many mints from your IP: cache the token. If a `429` carries `Retry-After`, wait that long and send once more |
| Every read of a stored interpretation comes back `from_cache: false` | `/analyze` | It was not `complete`, the call carried `reAnalyze` or `step`, or no `audience` while the person now has another: send its `audience_applied` ([references/reading-the-response.md](references/reading-the-response.md)) |
| `409` with `PROTOCOL_NOT_ANALYSED` | `/analyze` | Measurement is not interpreted: read its indicators with `/results` |

More: [references/symptoms.md](references/symptoms.md), [references/errors.md](references/errors.md), [references/pitfalls.md](references/pitfalls.md).

## References

- [references/capture-cycle.md](references/capture-cycle.md): each step of the cycle with the fields of its request and response, from the spec and the code that runs.
- [references/reading-the-response.md](references/reading-the-response.md): the spoken language versus the interpretation's, the question of each step, the audience, which indicators to show, what to show when the interpretation arrives, results per question, and reading it again without paying.
- [references/batches.md](references/batches.md): the rules of the frame batches, which ones Engine enforces and which ones are good practice.
- [references/frames.md](references/frames.md): what each frame carries and how to send the transcript (`speech`, `sttByStep`), for frames you compute yourself.
- [references/errors.md](references/errors.md): `reason` of the `409` answers, `qualityCode` of the `400` answers, and what to do with `401`, `403`, `404`, `422` and `429`.
- [references/idempotency.md](references/idempotency.md): what is safe to send again, and how to clean up test people.
- [references/symptoms.md](references/symptoms.md): the long table of symptoms, with status, field, cause and fix.
- [references/pitfalls.md](references/pitfalls.md): the known pitfalls of the HTTP API and of every path, from the single source the docs publish.
- [references/migration-1.5.md](references/migration-1.5.md): read it only if the code in front of you was written for Engine 1.5.
