---
name: neurologyca-capture
description: "Integrates Neurologyca's emotion and human-context capture (Engine 2) into a web app with the @neurologyca/capture SDK and its @neurologyca/capture-server backend: integrar la captura de Neurologyca con el SDK, medir emociones e indicadores (HCIs) en el navegador, Measurement, baseline, preguntas por step, transcripción, audiencia e idioma de la interpretación y el proxy de tu backend. Use it when adding, configuring or debugging createProtocolClient, captureProtocol, captureBaseline, createRecordingClient (deferred, Preview), createTokenSource, createEngineProxy, createEngineAdmin, upload receivers or processor webhooks, or when a capture returns no results, a step has no transcript, or the interpretation comes for the wrong audience or is billed again on every read. For Engine's HTTP API from another language or platform, use neurologyca-engine-api. Not for generic MediaPipe overlays or text sentiment."
license: "Neurologyca Agent Skills License 1.0 (LICENSE.txt; published at /legal/skills-license): read freely; install and use with a Neurologyca account."
compatibility: "The SDK runs in a browser page served from a secure context (HTTPS or localhost) with a Node.js 22.12 or later backend; the scripts need Node.js 20 or later and no network except doctor's optional checks."
metadata:
  version: "1.2.43"
  sdk: "0.46.0"
  captureServer: "0.21.0"
  engineApi: "v2"
  environment: "devlab"
  docs: "https://devlab.neurologyca.com/docs"
  verifiedAt: "2026-11-19"
---

# Integrating Neurologyca with the capture SDK

## When to use it

Use this skill when the capture runs in a browser page and your backend runs Node.js: the SDK (`@neurologyca/capture`) captures in the page and `@neurologyca/capture-server` is your backend half (token, proxy, people, uploads). It is the recommended path, and Measurement is the first step.

For another backend language, another platform, or frames you already compute yourself, use the `neurologyca-engine-api` skill instead (Engine's HTTP API).

The docs of this DevLab, in Markdown for agents: https://devlab.neurologyca.com/docs. Read the pages linked below before writing code; they win over what you remember.

## Step 0: ask for the kit

Do not invent `contextId`, `PROTOCOL_ID`, `ENGINE_BASE` or `ENGINE_API_KEY`. They come from the team's kit. The exact route, signed in as the integrator at https://devlab.neurologyca.com/integration: **Your integration → Protocols → a protocol → Kit** (each protocol has its own kit). The kit is not a welcome package Neurologyca sends: it is generated there, per protocol. `ENGINE_BASE` (your environment's Engine URL) is already filled in `.env.example` (in a starter zip, `.env`). The Engine key is **not** in the kit: `ENGINE_API_KEY` ships empty. Reveal it in **Your account and API key › Engine keys › Reveal** (it asks for your password), or download a starter from the Kit page with «Include my key», which writes it into the `.env` of the zip. The key goes only in the backend's `.env`, never in git. The kit's files:

- `neuro.config.json`: the page's configuration. Load it with `createProtocolClient({ tenant: defineTenantConfig(json) })`. It points at your proxy (`engineBaseUrl: '/engine'`) and never holds a credential: `defineTenantConfig` throws if it finds one. In a context's kit it also turns transcription on (`transcribe: { language }`, a language without a region, which must be the language the person speaks: it is forced, never detected, and a wrong one comes back translated or empty, so when your people speak different languages pass it per capture from your backend): the capture then opens the **microphone** as well as the camera, so the person's consent has to cover it; `KIT.md` says how to turn it off. Measurement's kit leaves it off.
- `.env.example`: the backend's environment (`ENGINE_BASE` already filled in, `ENGINE_API_KEY` left empty, `PROTOCOL_ID`, and, in a context's kit, `NARRATIVE_LANGUAGE`, the interpretation's language, which your backend sets on each person it creates as `narrative.language`; without it Engine writes `en`). The key goes only in your backend's `.env`, never in git; get it as described above.
- `.npmrc`: one line, `@neurologyca:registry=https://registry.npmjs.org/`, that keeps `@neurologyca` on the public npm registry even if an older `~/.npmrc` still sends it elsewhere; no token and no secret. Copy it to the project root before `npm install`. Downloaded one by one from the Kit page, the browser saves it as `npmrc` (or `npmrc.txt`) and `.env.example` as `env.example`: rename them to `.npmrc` and `.env`. If you cannot write `.npmrc`, ask the user to rename it (`ren npmrc .npmrc` / `mv npmrc .npmrc`); do not replace it with `--userconfig`, which replaces their npm configuration.
- `KIT.md`: what is still to settle for this protocol, and the `DevLab:` line that says which DevLab the kit comes from. Respect its pending items: ask Neurologyca before recording anyone.
- `AGENTS.md`: the rules and the page index for the project's agent.

Files of the kit:

| File | Where it appears | What it is |
| --- | --- | --- |
| `neuro.config.json` | Always. | The client configuration of your protocol: pass it to defineTenantConfig(json). |
| `.env.example` | The kit in your console. | The environment of your backend, without your key: copy it to .env and fill it in. Never commit .env. |
| `.env` | The starter zip (live or recording). | The environment of your backend. The key is empty unless you downloaded the starter with «Include my key». Never commit it. |
| `.npmrc` | Always. | Keeps @neurologyca on the public npm registry (registry.npmjs.org), even if an older ~/.npmrc still sends the scope elsewhere. No token and no secret: the SDK is public. |
| `KIT.md` | Always. | The kit in prose: the SDK versions it is made for (with the command to check yours and the changelog), a link to the indicators your context gives you (Your integration › Protocols), start order, the notice to give the people you measure (with the model text of the Biometric Addendum and, in the recording starter, the prior written consent a deferred recording needs where the law requires it), what is pending, audiences, question options and links to the docs. |
| `AGENTS.md` | Always. | The rules and the docs index for your coding agent; paste it into your own AGENTS.md or CLAUDE.md. It is in English on purpose. |

Variables of the backend's `.env` (`.env.example` in the kit, `.env` in a starter zip):

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

Keys of `neuro.config.json`:

| Key | Where it appears | What it is |
| --- | --- | --- |
| `engineBaseUrl` | Always. | The route of your own proxy to Engine ('/engine'), not Engine's host. The browser calls your proxy and your backend adds the key. |
| `taxonomy.contextId` | Always. | The context the capture is measured in. With Measurement it is always "measurement". |
| `taxonomy.hciId` | Context protocols that fix a target HCI. | The target HCI of the context, when the protocol fixes one. |
| `taxonomy.subcontextByMechanic` | Context protocols whose subcontext per mechanic is set. | The subcontext chosen for each mechanic, by mechanic name. Without it, Engine applies the mechanic's own or the context's default. |
| `triggerAnalysis` | Measurement only. | A key of your app, not of the SDK: your code passes it to the capture (client.capture() or captureProtocol). false because Measurement does not interpret. |
| `transcribe` | Measurement (always, as false); context protocols when transcription is on, which is the default. | Transcription: false, or { "language": "en" \| "es" } without a region. It opens the microphone too. The language is the one the person speaks: it is forced, never detected. |
| `media` | Context protocols where some step offers several questions. | The question of each step: { "<mechanic>": { "<step order>": "<mediaPid>" } }. The default is the first question not used by an earlier step. |
| `processing.language` | The recording starter only. | The language your backend sends with each deferred job (en or es); the processing service requires it. |
| `processing.transcribeSteps` | The recording starter only. | The step types the processing service transcribes. Set it to [] to turn transcription off in this starter (it ignores "transcribe"). |

Without the kit, stop and ask the user for it. A plausible `contextId` does not fail early: the capture completes and the interpretation is refused at the end (see https://devlab.neurologyca.com/docs/resources/pitfalls.md).

`userProtocolId` and `protocolMechanicId` are not configuration: your backend gets them at run time when it enrols the person (https://devlab.neurologyca.com/docs/sdk/backend.md).

## Installing from npm

The SDK is public on npm: `npm install` needs no account and no token, and Node.js 22.12 or later (https://devlab.neurologyca.com/docs/start/install.md). The kit and the starters carry an `.npmrc` that pins `@neurologyca` to `https://registry.npmjs.org/`. A 404 when installing `@neurologyca/*` means a scope line left over from the private previews (in the project's `.npmrc` or in `~/.npmrc`) still sends it to the old registry: remove that line and its `_authToken`, or keep the kit's line in the project's `.npmrc`; `npm config get @neurologyca:registry` must print `https://registry.npmjs.org/` (or `undefined`). Never ask for a registry token, and never use the Engine key for npm. If you cannot write `.npmrc`, ask the user to rename it (`ren npmrc .npmrc` / `mv npmrc .npmrc`); do not replace it with `--userconfig`, which replaces their npm configuration.

Verified with `@neurologyca/capture` 0.46.0 and `@neurologyca/capture-server` 0.21.0. Install exactly those (or check https://devlab.neurologyca.com/docs/resources/changelog.md before moving).

## Golden rules

- The Engine API key (`ENGINE_API_KEY`) lives only in your backend, behind your proxy (`/engine`): never in browser code, in `neuro.config.json` or in git.
- Never invent `contextId`, `PROTOCOL_ID`, `ENGINE_BASE` or the key: they come from your team's kit (https://devlab.neurologyca.com/integration → Your integration → Protocols → a protocol → Kit): `ENGINE_BASE` is already filled in `.env.example` (in a starter zip, `.env`). The key is not in the kit: reveal it in Your account and API key (Engine keys › Reveal) or download a starter with «Include my key», and never commit it. Without the kit, stop and ask for it.
- Start with Measurement: it only measures (`triggerAnalysis: false`).
- Use the same person and the same source (camera or file) for the baseline and the measurement.
- Keep the tab visible while capturing, and serve the page from a secure context (HTTPS or localhost).
- Deferred (Preview): call `/analyze` only as the job's `interpretation` says. With `ready` it is served from the cache; with `degraded` or `failed` every call regenerates it and costs, so ask once if you need it, never in a loop.
- These docs win over what you remember: if a route, option or code is not in them, it does not exist.

## Choose the path

| Mode | What it is |
| --- | --- |
| On-device (real time) | The browser processes the data as it's captured. |
| Deferred (server-side) | The SDK records and uploads; our service processes it shortly after. |
| Self-hosted (coming soon) | Deferred processing on your own servers. |

Start with the first mode, On-device (real time), and Measurement (https://devlab.neurologyca.com/docs/guides/measurement.md): it only measures, so there is no taxonomy to settle. Deferred (server-side) is Preview: the SDK records and uploads, and Neurologyca's processing service (the only option today) replays it; its webhook may first send an `interpreting` notice (on by default with Neurologyca's service, `interimWebhook`), which is not the end: wait for `succeeded` (https://devlab.neurologyca.com/docs/sdk/deferred.md, https://devlab.neurologyca.com/docs/sdk/processing.md and [references/deferred.md](references/deferred.md)). The HTTP API is complementary, for your backend's one-off reads (https://devlab.neurologyca.com/docs/api.md).

## The minimal path that works

Each step links the page that holds the tested code; do not rewrite it from memory.

1. Install both packages, exact versions (https://devlab.neurologyca.com/docs/start/install.md).
2. Backend: `createTokenSource` and `createEngineProxy` mounted at `/engine`, before any body parser (the proxy reads the body itself). Its `authorize` checks your own session and calls `ownsAll`, which checks every id the route carries (https://devlab.neurologyca.com/docs/sdk/backend.md). Serve it on the page's origin. On another origin it takes `credentials: 'include'` in the client and `cors: { origins, credentials: true }` in the proxy, and the session cookie must reach the proxy's host (https://devlab.neurologyca.com/docs/api/proxy.md). A proxy written by hand, with Express or nginx: https://devlab.neurologyca.com/docs/api/proxy.md.
3. Backend: create the person and enrol them with `createEngineAdmin`; `getNextPosition` gives the pair (`userProtocolId`, `protocolMechanicId`) the page captures with (https://devlab.neurologyca.com/docs/sdk/backend.md). A protocol in more than one of your contexts needs `contextPid` on the enrolment, which today only the HTTP API sends (see neurologyca-engine-api).
4. Before writing the capture, choose the mode for your people's devices and check the device ([references/choose-mode-and-device.md](references/choose-mode-and-device.md): the device check, the three levels, when to offer deferred and the session rate), and pick one of the five ways to load the models ([references/startup-and-prepare.md](references/startup-and-prepare.md)). Page: `createProtocolClient({ tenant: defineTenantConfig(json) })`, then `captureProtocol` from a gesture of the person (a click), after consent (https://devlab.neurologyca.com/docs/start/quickstart.md and https://devlab.neurologyca.com/docs/sdk/on-device.md). For Measurement pass `triggerAnalysis: false`.
5. Steps: read each one with `describeStep`, never with rules per `step.type` (https://devlab.neurologyca.com/docs/sdk/steps.md). A step with several questions needs the one you showed declared: pick it from `describeStep(step).texts` and pass `start({ mediaPid })`, one question per step and never the same one twice (without it the SDK warns `step.media-undeclared`; a `mediaPid` not of the step throws `E_MEDIA_UNKNOWN`). Steps without media of their own borrow the neighbour's (`media_from`). The spoken language (`transcribe.language`, declared, never detected) is not the interpretation's (`narrative.language` on the person). Questions, both languages and transcription: [references/questions-and-transcription.md](references/questions-and-transcription.md).
6. Results (https://devlab.neurologyca.com/docs/sdk/results-backend.md and https://devlab.neurologyca.com/docs/concepts/results.md; the detail in [references/results-and-interpretation.md](references/results-and-interpretation.md)):
   - In the page by `onResult` (indicators per step) and `onInterpretation`; later, from your backend, with `getResults` of `createEngineAdmin` (also `speech`, per step: `questionText` and `transcript`; only in the test environment's Engine). Engine sends no webhooks: keep the pair outside the tab.
   - `stop()` waits for the interpretation, which can take minutes: show the indicators first. One interpretation per session, the stored one; leave `interpretation` at its default.
   - Show only the public indicators, by their `/results` key: `Attention`, `effective_active_attention` (Effective Active Attention, Preview), `workload_model` (Workload), `Coherence`, `Comprehension`, `Confusion`, `Joy`, `Sadness`, `Surprise`, `Anger`, `Disgust`, `Fear`, `Neutral`, `Anticipation`, `Anxiety`, `Awe`, `Contempt`, `Curiosity`, `Cynicism`, `Delight`, `Despair`, `Disapproval`, `Envy`, `Guilt`, `Hope`, `Love`, `Morbidness`, `Outrage`, `Pessimism`, `Pride`, `Remorse`, `Shame`, `Submission`, `Trust`, `Unbelief`, `valence` (Valence), `arousal` (Arousal), `Interest`, `Frustration`, `Rejection`, `Stress_intens` (Stress intensity). The payload carries more keys (technical ones): never draw them, and never draw a list taken from the payload (the ones that need previous sessions and Motivation are not public keys). Which ones you receive depends on the context and on your organization's agreement, not on your key: the list of each protocol is in Your integration › Protocols, «Indicators you receive in this context» (`KIT.md` links to Your integration › Protocols). Treat every indicator as optional; to receive more, the user asks Neurologyca. When the interpretation arrives: `metadata.status` (only in `onInterpretation`'s event: `CaptureOutcome` has no `metadata`, and its `status` is the capture's, not the interpretation's; keep it from the event), then `insight` → `headline` → `sections[]` by `key`, the 0 to 100 index with `readScoreIndex`, and the Preview fields `primary_emotion`, `selected_ehcis` and `pairs` (results per question). **With an interpreted protocol, the page must paint all of this when it arrives**: read [references/results-and-interpretation.md](references/results-and-interpretation.md) before painting, and copy whole the four tested modules of [references/quickstart.md](references/quickstart.md), «Show the results» (they paint the relevant indicators first, the status, the summary, the emotion, the index, the audience, the sections and the results per question, and return the status and the audience your backend keeps with the pair). Never paint the interpretation's text as plain text.
   - The **audience** goes on the person before the capture (or per request from your backend); keep it and `audience_applied`. To read an interpretation again without paying: `from_cache` only for a `complete` one with the same audience and without `reAnalyze`.
7. Only if needed: the CSP for MediaPipe and transcription (https://devlab.neurologyca.com/docs/guides/csp-transcription.md).
8. The startup screen: paint `onStartupStage` messages and give a Cancel (`signal`); optionally `client.prepare()` when the page mounts and `client.release()` when it goes away (and between one person and the next), with **one client per page**: only that client's capture adopts what it prepared; `keepPrepared` keeps the models between captures, so prepare once ([references/startup-and-prepare.md](references/startup-and-prepare.md)).
9. Responsible use, before handing over: tell the person before measuring and collect their consent (that emotions are inferred and that an AI writes the reading), show each reading only to its declared reader, never use a reading on its own to decide about the person, and in a wellbeing use keep a route to help visible. The full list of what the readings are never for and what your app must do: https://devlab.neurologyca.com/docs/guides/responsible-use.md.

The kit also offers a starter per mode to download (https://devlab.neurologyca.com/integration): the same code, ready to run with `npm install` and `npm start`. The quickstart page publishes the tested `server.mjs`, `page.js` and `index.html`; the same code, offline, is in [references/quickstart.md](references/quickstart.md).

The baseline is per person and separate from any protocol: check it with `getBaselineInfo` and capture it with `captureBaseline`, with the same person and source as the measurement (https://devlab.neurologyca.com/docs/concepts/baseline.md).

## Where to look

| Question | Where |
| --- | --- |
| What a context, protocol, position, mechanic and step are | https://devlab.neurologyca.com/docs/concepts/protocols.md |
| Signature of `captureProtocol` or any export | https://devlab.neurologyca.com/docs/sdk/reference.md |
| What `/results` returns | `GET /results/{userProtocolId}/{protocolMechanicId}` (operationId `getResultsByPosition`) |
| How long the interpretation takes (deferred) | https://devlab.neurologyca.com/docs/guides/timeouts.md |
| Limits of the proxy, the uploads and the steps | https://devlab.neurologyca.com/docs/concepts/limits.md |
| Every error code and warning | https://devlab.neurologyca.com/docs/sdk/errors.md |
| What changed between versions | https://devlab.neurologyca.com/docs/resources/changelog.md |
| Your backend: token, proxy, people, enrolment | https://devlab.neurologyca.com/docs/sdk/backend.md |
| Reading results later from your backend | https://devlab.neurologyca.com/docs/sdk/results-backend.md |
| Live events, results and interpretation fields | https://devlab.neurologyca.com/docs/concepts/results.md |
| What to keep, what to show, per question, audience, reading again for free | https://devlab.neurologyca.com/docs/concepts/results.md, https://devlab.neurologyca.com/docs/guides/show-results.md and [references/results-and-interpretation.md](references/results-and-interpretation.md) |
| Questions per step, spoken vs interpretation language, where the transcript is | https://devlab.neurologyca.com/docs/sdk/steps.md and [references/questions-and-transcription.md](references/questions-and-transcription.md) |
| Trying audiences, questions and languages in the playground | https://devlab.neurologyca.com/docs/start/testing.md |
| Steps, marking and durations | https://devlab.neurologyca.com/docs/sdk/steps.md |
| Measurement only | https://devlab.neurologyca.com/docs/guides/measurement.md |
| Baseline | https://devlab.neurologyca.com/docs/concepts/baseline.md |
| CSP, MediaPipe and transcription | https://devlab.neurologyca.com/docs/guides/csp-transcription.md |
| Slow startup, its messages and caps, preparing before Start, the startup report | https://devlab.neurologyca.com/docs/sdk/on-device.md, https://devlab.neurologyca.com/docs/guides/timeouts.md and [references/startup-and-prepare.md](references/startup-and-prepare.md) |
| Which mode for which devices, the device check before measuring, the session rate after | https://devlab.neurologyca.com/docs/start/devices-and-modes.md and [references/choose-mode-and-device.md](references/choose-mode-and-device.md) |
| The five ways to load the models (a screen before Start, consent, a baseline and measurements) | https://devlab.neurologyca.com/docs/guides/load-models.md and [references/startup-and-prepare.md](references/startup-and-prepare.md) |
| Deferred recording and the processing service | https://devlab.neurologyca.com/docs/sdk/deferred.md and https://devlab.neurologyca.com/docs/sdk/processing.md |
| Test or production environment | https://devlab.neurologyca.com/docs/start/environments.md |
| Privacy and consent | https://devlab.neurologyca.com/docs/resources/privacy.md |
| Responsible use: what the readings are never for, notice and consent, human review | https://devlab.neurologyca.com/docs/guides/responsible-use.md |
| Before going to production | https://devlab.neurologyca.com/docs/guides/production-checklist.md |
| Known pitfalls | https://devlab.neurologyca.com/docs/resources/pitfalls.md |
| Any Engine route | https://devlab.neurologyca.com/docs/reference.md |
| Coming from Engine 1.5 | https://devlab.neurologyca.com/docs/resources/migration.md |

## Verify your work

1. Run `node <this skill>/scripts/validate-config.mjs <project>`. Fix what it reports and run it again until no `ERROR` is left.
2. With your backend running, run `node <this skill>/scripts/doctor.mjs <project> --url http://localhost:3000`. It looks for the key in what you serve (`public/`, `dist/`…, `index.html` and `src/` in a Vite or Next project, plus `app/`, `pages/` and the compiled `.next/static` in Next). If it says it found nothing to review, nothing at all was read: build first or pass `--static <dir>` (repeatable) with each folder you serve; a run with nothing reviewed has not checked the key. What it reads: it reads your project and, outside it, only the npm settings that decide where `@neurologyca` installs from (the `npm_config_*` variables, and the `@neurologyca` scope line and the `registry=` line of your user and global npmrc), never printing a value; it runs no npm command, and it may also read this DevLab's public changelog, and a failure to reach it never fails the check. In a Vite or Next project before its build it also notes that the bundle was not reviewed (a key in a `VITE_` or `NEXT_PUBLIC_` variable only shows there, and doctor reports one in your `.env*` files): build and run it again.
3. Run one capture end to end before handing over: with your backend running, open the page in a headless browser with a video file as the source (Chrome or Chromium with `--autoplay-policy=no-user-gesture-required`, or the browser you can drive), start the capture and let it finish. Check only `outcome.status` (`complete`), the number of frames (`frameCount`), the number of indicators (the keys of `hcis`), `metadata.status` from `onInterpretation` and, with an interpreted protocol, that the page painted the summary, the reading (how many sections) and the relevant indicators; never print the text of the interpretation or the transcript. The video as the source and a headless harness: [references/quickstart.md](references/quickstart.md), «Your page» and «Run it end to end, headless».
4. Compare your calls with the playground's in https://devlab.neurologyca.com/playground (way: SDK): the same calls, in the same order.
5. Go through https://devlab.neurologyca.com/docs/guides/production-checklist.md. If you cannot open steps 4 and 5 (no network), say so in your report instead of skipping them silently.
6. Delete the test people you created (`deleteUser` of `createEngineAdmin`, or `DELETE /users/{externalId}`): each test enrols a new one, and they stay in Engine until deleted.

Never print or log `transcript` (the `speech` of `/results`, `onTranscript`) nor the interpretation (its text, `structured`, `insight`, `headline`, `sections`), not even a few characters of it: they are what the person said and what was read in them. To check them, count words or characters, or print `metadata.status` and the `sections` keys.

The scripts are plain Node.js (run them with `node`, not as executables), read only, and never print a secret. They send nothing except one cheap read through your proxy with `--url` (the SDK proxy answers it without calling Engine; a proxy you wrote by hand may forward it) and the public changelog check.

## If something fails

| Symptom | Code | Cause and fix |
| --- | --- | --- |
| `npm install` answers 404 for `@neurologyca/*` | none | A scope line left over from the private previews sends `@neurologyca` to the old registry. Remove it (and its `_authToken`) from `.npmrc` and `~/.npmrc`, or pin `@neurologyca:registry=https://registry.npmjs.org/` in the project; no token is needed |
| Building the client throws `taxonomy.contextId is required` | none | The configuration lacks the context: copy `neuro.config.json` from the kit. Measurement uses `taxonomy: { contextId: 'measurement' }` |
| `defineTenantConfig` throws that a field "must never live in this file" | none | A credential in `neuro.config.json`: move it to the backend's `.env` |
| `captureProtocol` throws before opening the camera | `E_TAXONOMY_INVALID` | A `situationId` needs its `hciId`: take both from the kit, or neither |
| Every call answers 401 | `token.missing` | The client points at Engine instead of your proxy: `engineBaseUrl: '/engine'` |
| The capture ends without results | `E_RESULTS_TIMEOUT` | Nothing within `outcomeDeadlineMs` (240 s by default), but not a loss: Engine is still processing. Do not recapture; read them later with `retrieveResults` and the pair |
| `onError` with `recoverable: false` after `stop()` | `E_INTERPRETATION_TIMEOUT` | Engine has the capture: never `abort()` here. Show the indicators and ask for the interpretation later from your backend |
| `onError` with `recoverable: true` and status `timeout` after `stop()` | `E_ANALYSIS_IN_PROGRESS` | Engine is still writing the interpretation (a `202` from `/analyze`): show the results, say «interpreting» and read it later with `client.analyze()` (check `inProgress`, wait `retryAfterMs`) |
| The capture completed but the interpretation is refused | `E_TAXONOMY_REJECTED` | Today every `422` lands here. Two causes: an id that is not the protocol's (recapture with the right one) or one your organization cannot see (ask Neurologyca; then ask again, no recapture). Compare the ids with the kit before recording anyone else |
| The interpretation is refused for the organization | `E_TENANT_UNKNOWN` (not emitted with SDK 0.46.0: it arrives as `E_TAXONOMY_REJECTED`) | Neither the capture nor the taxonomy: tell the user to ask Neurologyca, then ask for the interpretation again. Do not recapture |
| Gaps in the series | `capture.throttled` | The tab was hidden or covered (the warning is relative to the session's own rate: a device that is slow from the start does not raise it): the gaps are real. Keep the tab visible |
| The camera does not open | `insecure-context` (`MediaProblem`) | Serve the page over HTTPS or from `localhost` |
| The transcript comes back in English | `stt.autodetect` | The language was autodetected: pin `transcribe: { language }` |
| Voice steps reach Engine with no text, very little, or translated | none, or `stt.silent` when nothing is left | `transcribe.language` is not the language the person speaks: kodec forces it, and the model either translates into it (nothing warns) or produces what kodec discards (`low-confidence`, `repetition-loop`). Declare the person's language per capture, never infer it from the page, and do not fall back to `language: null` (it also translates); https://devlab.neurologyca.com/docs/guides/csp-transcription.md |
| A speech step will not be transcribed | `transcription.off-on-voice-step` / `transcribeSteps.excludes-voice-step` | A step with `expectsSpeech: 'yes'` runs with `transcribe` off, or `transcribeSteps` leaves it out: turn `transcribe` on and include that step's type |
| The analysis is refused for a missing axis | `E_AXES_MISSING` (not emitted with SDK 0.46.0: it arrives as `E_TAXONOMY_REJECTED`) | Almost always your own frame source, sending frames without `featuresMeta`. Do not recapture: fix the frames and ask for the interpretation again |
| `interpretation` is `null` with Measurement | `protocol.not-interpreted` | Expected: Measurement is never interpreted. The warning appears only where Engine reports `interpreted: false`; elsewhere, pass `triggerAnalysis: false` |
| A 409 from Engine | `E_CONFLICT` | Branch on `reason`, never on `expired` alone, with a default case: `SESSION_ABANDONED`, `POSITION_ALREADY_COMPLETED`, `MECHANIC_EXPIRED`, `MECHANIC_NOT_YET_AVAILABLE`, `MUST_START_AT_FIRST_POSITION`, `PROTOCOL_DEPRECATED`, `POSITION_RESERVED`, `CAPTURE_DISCARDED`, `CAPTURE_OUT_OF_ORDER`, `PROTOCOL_NOT_ANALYSED`, `CAPTURE_CANCELLED` |
| Each read of a stored interpretation generates (and bills) a new one | none (`fromCache: false`) | It was not `complete`, it was read without the audience it was written for while the person now has another, or with `reAnalyze`: send its `audience_applied`, never `reAnalyze`, and do not ask again for a `degraded` or `failed` one ([references/results-and-interpretation.md](references/results-and-interpretation.md)) |
| The reading is written for the wrong reader | none (`audience_applied`) | No `audience` on the person or the request, or a label Engine does not know (accepted silently, default reading): use only the audiences of your kit's `KIT.md` |
| An option is refused | `E_UNKNOWN_OPTION` | Do not invent options: https://devlab.neurologyca.com/docs/sdk/reference.md. `createProtocolClient` refuses an unknown key too (also inside `startup`); `signal` and `captureId` go in `captureProtocol` |
| The startup hangs on a slow network | `startup.stalled` | A download brought no byte for `stallMs`; nothing is cut. Offer wait, Cancel (`signal`) or, for `speech`, `captureProtocol({ …, transcribe: false })` on the same client |
| The capture never starts: the face model ran out | `E_CAPTURE` (`stage: 'face-model'`, `reason: 'timeout'`) | The vision cap (120 s) ran out. With `subStage: 'vision-runtime'` offer a reload, not a retry |
| The capture never starts: the face model failed its check | `E_CAPTURE` (`stage: 'face-model'`, `reason: 'integrity'`) | The downloaded face model failed kodec's integrity check (a corrupted download or a network that alters it). Show `userMessage` (`face-model.integrity`) and offer a reload or another network; never retry in a loop |
| You prepared and the capture downloads everything again | none | Another client captured: only the same client adopts what `prepare()` loaded. One client per page, `release()` when leaving |
| Transcription stops after an SDK upgrade, with ONNX Runtime self-hosted | `stt` (`subStage: 'stt-runtime'`, `cut.code: 'stt-runtime-missing'`) | A `wasmPaths` string is now a prefix ending in `/` that must serve the executor's pair; or pass `{ wasm, mjs }` (https://devlab.neurologyca.com/docs/guides/csp-transcription.md) |

More: [references/symptoms.md](references/symptoms.md), [references/pitfalls.md](references/pitfalls.md), https://devlab.neurologyca.com/docs/sdk/errors.md and https://devlab.neurologyca.com/docs/concepts/limits.md.

## References

- [references/symptoms.md](references/symptoms.md): every symptom by family (on-device, your backend and the proxy, deferred, transcription), with its code; read it when the table above has no match.
- [references/pitfalls.md](references/pitfalls.md): the known pitfalls of the SDK path, with cause and fix; read it before the first capture.
- [references/results-and-interpretation.md](references/results-and-interpretation.md): what to keep in your backend, which indicators to show, what to show when the interpretation arrives, results per question (`pairs`, `speech`), the audience and how to read an interpretation again without paying for another; read it before drawing any result.
- [references/questions-and-transcription.md](references/questions-and-transcription.md): the question of each step (`mediaPid`, `media_from`), the spoken language versus the interpretation's, and where the transcription happens and comes back; read it for any protocol with questions or voice.
- [references/methodology.md](references/methodology.md): baseline, steps and what the indicators mean; read it when designing the capture flow.
- [references/choose-mode-and-device.md](references/choose-mode-and-device.md): which mode suits the people's devices, the device check before measuring (three levels), when to offer deferred and how to read the session rate; read it before writing the capture.
- [references/startup-and-prepare.md](references/startup-and-prepare.md): the five ways to load the models with their decision and code, the startup screen (stages, messages, caps, cancelling, going on without speech), `prepare()`/`release()` with one client per page, and the startup report; read it before writing the capture.
- [references/recommendations.md](references/recommendations.md): production, consent, retries, the event stream and browsers; read it before shipping.
- [references/deferred.md](references/deferred.md): recording, uploading, the processing service and its webhook (Preview); read it only for that mode.
- [references/measurement.md](references/measurement.md): Measurement end to end; read it for the first integration.
- [references/quickstart.md](references/quickstart.md): the quickstart's tested `server.mjs`, `page.js` and `index.html`, when to close each step with one video, and the bundler; read it to start without network.
- [references/migration-1.5.md](references/migration-1.5.md): from Engine 1.5 and older examples; read it when the project has old code.
