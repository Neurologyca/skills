# Results, interpretation and audience

What to keep, what arrives, and what to show when the interpretation comes. Each section links the page that holds the detail; the scales, field tables and examples are there (https://devlab.neurologyca.com/docs/concepts/results.md); the same rules for people, with the availability table field by field: https://devlab.neurologyca.com/docs/guides/show-results.md.

## Contents

- [What to keep in your backend](#what-to-keep-in-your-backend)
- [What arrives, and when](#what-arrives-and-when)
- [The indicators: which ones to show](#the-indicators-which-ones-to-show)
- [What to show when the interpretation arrives](#what-to-show-when-the-interpretation-arrives)
- [Per step, or per question: pairs and speech](#per-step-or-per-question-pairs-and-speech)
- [Audience: who the reading is written for](#audience-who-the-reading-is-written-for)
- [Reading a session again without paying for another](#reading-a-session-again-without-paying-for-another)
- [Late results](#late-results)

## What to keep in your backend

Engine sends no webhooks for live captures, and the tab can close. Keep, next to your own user:

- the pair (`userProtocolId`, `protocolMechanicId`), from the enrolment and `getNextPosition`: it is all you need to read results and the interpretation again, weeks later;
- the `externalId` of the person (opaque, never an email), to delete them later with `deleteUser`;
- the audience you set on the person for that capture (or none): it is the one the interpretation was written for, and your fallback when `audience_applied` does not arrive;
- how the interpretation came out (`metadata.status`) and the audience Engine applied (`audience_applied`). Live, the interpretation reaches the **page** by `onInterpretation` and your backend never calls `/analyze`: send both from the page to your backend when they arrive (`metadata` of the event; `audience_applied` in its `raw` body, at the root or inside `payload`, only when Engine sends it). From your backend, `AnalyzeResult` gives them (`metadata`, `audienceEvidence.audienceApplied`). You need them to read it again for free (below).

Read an interpretation again from your backend with `admin.analyze(pair, { audience })`, not with the page's `client.analyze(userProtocolId, protocolMechanicId)`: that one takes no `audience`, so it uses whatever audience the person has at that moment.

A `202` from `/analyze` (`ANALYSIS_IN_PROGRESS`) means «interpreting», never «no interpretation». `client.analyze()` and `admin.analyze` do not throw on it: they return `interpretation: null` with `inProgress: true` and `retryAfterMs` (`null` when Engine does not say), and Engine's body in `raw`. Check `inProgress` before treating `interpretation: null` as final, wait `retryAfterMs` (your own default when `null`) and ask again a few times at most; then show it as interpreting and ask later. At the close of a capture the SDK already waits and asks again by itself (`analysis.in-progress`), and ends with `E_ANALYSIS_IN_PROGRESS` (recoverable: the results were delivered) if Engine is still writing it. Copy this module (https://devlab.neurologyca.com/docs/sdk/errors.md):

```js
// A 202 from /analyze means "interpreting", not "no interpretation". client.analyze() in the page (@neurologyca/capture
// 0.44.0 or later) and admin.analyze() in your backend (capture-server 0.20.0 or later) say so: interpretation: null,
// inProgress: true and retryAfterMs, the wait Engine asks for (null when it does not say).
/**
 * @param {() => Promise<{ interpretation: string | null, inProgress: boolean, retryAfterMs: number | null, raw: unknown }>} ask
 *   in the page: () => client.analyze(userProtocolId, protocolMechanicId); in your backend: () => admin.analyze(pair)
 * @param {{ tries?: number, wait?: (ms: number) => Promise<void> }} [o]
 * @returns {Promise<{ interpretation: string | null, interpreting: boolean, raw: unknown }>}
 */
export async function askInterpretation(ask, { tries = 4, wait = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  for (let i = 1; ; i++) {
    const { interpretation, inProgress, retryAfterMs, raw } = await ask()
    if (!inProgress) return { interpretation, interpreting: false, raw }
    if (i >= tries) return { interpretation: null, interpreting: true, raw } // still interpreting: show it so, ask later
    await wait(retryAfterMs ?? 30_000) // Engine's wait, else about 30 s
  }
}
```

Engine keeps results until you delete the person; the playground's «SDK and API» piece «Save and read later» runs this same code (https://devlab.neurologyca.com/docs/sdk/results-backend.md).

## What arrives, and when

| What | In the page | In your backend |
| --- | --- | --- |
| Indicators, per step and per frame | `onResult` (`hcis`, `hcisByStep`, `frameCount`, and `raw`, the whole body of `GET /results/{userProtocolId}/{protocolMechanicId}` (operationId `getResultsByPosition`): draw the per-frame series from it, no extra call); `CaptureOutcome` when `stop()` resolves | `getResults({ userProtocolId, protocolMechanicId })` (`rawResults`, `aggResults`, `speech`); `getProtocolResults({ userProtocolId })` for every mechanic of an enrolment |
| What was asked and said, per step (`speech`) | not in the SDK's events: read it from `raw` or from your backend | `speech` of `getResults` (only in the test environment's Engine; `null` when Engine does not send it) |
| The interpretation | `onInterpretation` (text, `structured`, `metadata`), then `onInterpretationDetails`; `CaptureOutcome.interpretation` and `.structured`, never `metadata` (keep `metadata.status` from `onInterpretation`; `CaptureOutcome.status` is the capture's) | `admin.analyze(pair)` (`AnalyzeResult`: `interpretation`, `structured`, `metadata`, `fromCache`) |
| What happened on the device (transcription setup, per-step transcription, capture quality) | `onReport` (`SessionReport`), also when the capture ends with `endedBy: 'abort'` or `'error'`; `CaptureOutcome` does not carry it | nothing: send what you need from the page |

If you read the live stream yourself, a position that asked for the interpretation normally ends with `constellation.complete`, not `results.ready`. The indicators come first and the interpretation later (it can take minutes, https://devlab.neurologyca.com/docs/guides/timeouts.md): show the indicators as soon as they arrive, and the interpretation when it comes. With Measurement there is no interpretation at all ([measurement.md](measurement.md)).

## The indicators: which ones to show

- Build only on the public indicators of the table in https://devlab.neurologyca.com/docs/concepts/results.md, by the key exactly as it arrives in `/results` (case-sensitive: `Stress_intens`, `workload_model`). The public keys: `Attention`, `effective_active_attention` (Effective Active Attention, Preview), `workload_model` (Workload), `Coherence`, `Comprehension`, `Confusion`, `Joy`, `Sadness`, `Surprise`, `Anger`, `Disgust`, `Fear`, `Neutral`, `Anticipation`, `Anxiety`, `Awe`, `Contempt`, `Curiosity`, `Cynicism`, `Delight`, `Despair`, `Disapproval`, `Envy`, `Guilt`, `Hope`, `Love`, `Morbidness`, `Outrage`, `Pessimism`, `Pride`, `Remorse`, `Shame`, `Submission`, `Trust`, `Unbelief`, `valence` (Valence), `arousal` (Arousal), `Interest`, `Frustration`, `Rejection`, `Stress_intens` (Stress intensity). The payload carries more keys than the public catalogue (technical ones): ignore the rest, never draw them (a chart or table built from every key of the payload shows them), and keep your code tolerant of an indicator that appears or goes away (the public list is provisional).
- Which of them you receive depends on the context and on your organization's agreement: every interpreted context includes the ones its interpretation needs, the rest arrives by agreement, and the list can change with it. The list of each protocol is in DevLab, Your integration › Protocols, the block «Indicators you receive in this context» (`KIT.md` links to Your integration › Protocols; it does not copy the list). Treat every indicator as optional: a key that is missing was not received, never a zero. The recorded examples (playground, docs) carry the whole public catalogue, so an indicator there may not reach your capture. To receive more, the user asks Neurologyca. https://devlab.neurologyca.com/docs/resources/pitfalls.md
- `session` (Preview, in the three `/results` routes of the HTTP API): whole-session values keyed by indicator; today only `effective_active_attention`, `{ v, n }` (`v` from 0 to 100, a percentage of frames with Attention = 1, not the 0–1 Attention mean; `n` the frames it was computed over). `null` means not measured (not 0) or not in your context. `getResults` of `createEngineAdmin` does not return it today: read it over the HTTP API (https://devlab.neurologyca.com/docs/concepts/results.md).
- Sort `rawResults` by `timestamp`; a missing key is a gap, never a zero. The scales are not all the same (Valence, Attention and its mean as a fraction): read them before drawing or comparing.
- Not valid, do not show:

- Motivation (`faa`): Not valid, do not use: it arrives out of its range and Engine is replacing its model.

- Never in `/results`: they need previous sessions of the same person in the same context, Engine uses them only inside the interpretation, and they are Preview. Do not look for them in your data; if you show them, show them as locked until that history exists, as the playground does:

- Disengagement (Preview): **Warm-up: 5 sessions.** From the 6th session, in a step with at least 60 s of valid face (in practice about 66–76 s in a row). Per step or per session, only used for the interpretation (`/analyze`); no route returns its value today; not yet in Engine production
- Mental Fatigue Load (Preview): **Warm-up: 5 sessions.** From the person's 6th session in that context: it needs 5 previous completed sessions, and the baseline does not count. Per step or per session, only used for the interpretation (`/analyze`); no route returns its value today; not yet in Engine production
- Emotional Mental Control (Preview): **Warm-up: 5 sessions.** From the 6th session, in uninterrupted 3-minute blocks (a shorter session has no value); the Engine model is provisional. Per step or per session, only used for the interpretation (`/analyze`); no route returns its value today; not yet in Engine production
- Facial Muscle Tension (Preview): **Warm-up: 0 or 5 sessions.** From the 1st session if the context already has Neurologyca calibration data; otherwise from the 6th. Per step or per session, only used for the interpretation (`/analyze`); no route returns its value today; not yet in Engine production

- Workload and Motivation need a warm-up inside each step: `null` in many frames is normal.

## What to show when the interpretation arrives

1. Branch on `metadata.status` (in the page, from `onInterpretation`; `CaptureOutcome` does not carry it): `complete` shows; `degraded` (`analysis.degraded`) shows with a notice; `failed` never shows as a result: in the page it is `E_ANALYSIS_FAILED`; in your backend `admin.analyze` throws `EngineAdminError` with `E_ENGINE_HTTP` (the body in `cause`) instead of returning it. In every case the indicators are valid.
2. The summary first: `structured_data.insight`; if it is `null`, `structured_data.headline`; if that is `null` too, the first entry of `sections[]` (some interpretations have no headline by design).
3. Then the whole reading, **one** of the two: `sections[]` if you lay it out yourself (each with `key`, `title`, `body` in Markdown and `severity`), or `interpretation` if you render Markdown. They carry the same content: never both. Match a section by its `key`, never by its `title` (titles are written for the audience and can repeat). Render the Markdown safely (no raw HTML).
4. A 0 to 100 index, when the domain publishes one (each under its own key, for example `wellness_index`): `readScoreIndex(structured, key)` (the key defaults to `wellness_index`; pass the one of your domain) from `@neurologyca/capture` (or `/helpers`) on `onInterpretation`'s `structured` or `CaptureOutcome.structured`, and in your backend on `AnalyzeResult.structured` with the one in `@neurologyca/capture-server`. Show `value` as it comes; no number with `status: 'not_shown'`; mark `'degraded'` as a less reliable reading; show `label` as it comes next to the number, never composed, translated or compared in tests (`band` is a key, not text). Expect `null` for interpretations stored before the index existed and from the lightweight analysis.
5. Who it was written for: the audience Engine applied (below), or «default reading» when none was sent.
6. **Preview fields**, only when present and with the page working without them (seen so far only in the test environment's Engine): `structured_data.primary_emotion.term` (a catalogue term in English, whatever the narrative's language: show it untranslated or map it yourself), `structured_data.selected_ehcis[]` (the indicators the context declares relevant, in the context's order, each with `id` and `measured_value`, the whole-session value; the `id` is not the `/results` key, and a relevant one may not be in your `/results` if your context does not include it; show only public ones, never Motivation, and leave the four above to their own block) and `structured_data.pairs[]` (next section). Rely on nothing else of `structured_data` or of `metadata` (model, tokens, timings are Engine's internals).

All of this, as tested code: [quickstart.md](quickstart.md), «Show the results». Present the interpretation as a reading of the indicators, never as a decision. With the SDK there is one interpretation per session, the stored one: the page and your backend read the same text. `interpretation: 'stream'` generates one more that Engine does not store; leave the default.

## Per step, or per question: pairs and speech

The indicators come **per step** (`hcisByStep`, `rawResults` and `aggResults` keyed by the step's order), and so does `speech`. A question often spans two steps: the question in one, the answer in the next (the answer step has `media_from: previous_step`). To show the result **per question**:

- With `structured_data.pairs[]` (Preview): each pair has `index`, `status` (`complete`) and `windows.opening.order` and `windows.closing.order`, the step orders where the question opens and closes (the same keys as `aggResults`). With a question in one step and its answer in the next, the answer comes as an `incomplete` pair whose `notes` include `question_from_preceding_step` and has only `windows.closing.order`: its question is the step before (the question step comes `unpaired`, without orders). Ignore a pair whose orders are not in your results or whose `status` you do not know.
- Without it, or for the steps no pair covers, group from `speech` as the playground does: a step with both `questionText` and `transcript` is one question; a step with `questionText` followed, in the very next step, by one with only `transcript` (or repeating that `questionText`) is one question too. If the transcript sits further on, or the next step has none, leave the question alone.
- `speech` per step: `questionText` (the question shown, in the language of the person's **narrative**, not the spoken one; absent for a person without that language) and `transcript` (what the SDK sent for that step, as sent). A step appears only with one of the two; with nothing, `speech` is `{}`. Joining the `transcript` values is **not** the full text: speech outside a step is not there.
- **Means across steps.** `aggResults` gives one mean per step; the SDK already computes the frame means: `hcis` over every frame of the session and `hcisByStep` over the frames of each step. Engine gives no mean for a question spanning two steps nor for the whole session, except `selected_ehcis[].measured_value` (whole session, relevant indicators) and `session` (today only Effective Active Attention). For several steps, add up every frame's value in `rawResults` for those steps and divide by the frames that carry the key; never average the step means.
- The playground's Results lets you choose the range (whole session, one question, one step) and shows each mean with who gives it; with a question or a step, the question and «What they said» (or why there is nothing: [questions-and-transcription.md](questions-and-transcription.md)).

The transcript is what the person said, and the interpretation is what was read in it: show them only to that person (or to whom your consent says), never in logs, analytics or test fixtures, not even a few characters. To check them, count words or characters, or log `metadata.status`.

## Audience: who the reading is written for

An interpreted context can write its reading for different **audiences**. The labels come from your kit: `KIT.md`, section «Audiences», lists those of the protocol's context (and of its target indicator, `taxonomy.hciId`), marks the default one «(default)», and lists the ones set for your organization. Some audiences are restricted: a kit shows them only when Neurologyca has set them for your organization. Never send a label your kit does not list.

- **Set it on the person** (the usual way): `admin.createUser({ …, audience })` or, later, `admin.updateUser(externalId, { audience })` (`null` removes it). Do it before the capture, as the playground does: the batches (and the `Final` that starts the interpretation) accept no `audience`, so only the person's audience at that moment can reach it.
- **Or per request, from your backend**: `admin.analyze(pair, { audience })`. A blank value throws `E_AUDIENCE_INVALID` (Engine would treat it as absent).
- **Without `audience`** anywhere, Engine applies the context's default reading: the one `KIT.md` marks «(default)» or, when it marks none, Engine's own. A context without audiences needs none.
- **The same session, for another audience**, without capturing again: `admin.analyze(pair, { audience: 'other' })` or `analyzeForAudiences(…)`, which never forces a new reading and throws `E_AUDIENCE_KEPT_PREVIOUS` instead of returning an older stored reading of that same audience (Engine kept the previous one after a failed or worse retry, or because the stored one was `degraded` or `failed`). Each audience is generated once per session (the first request costs a full interpretation) and then stored.
- **What Engine applied**: `audience_applied` (`AnalyzeResult.audienceEvidence.audienceApplied`): the audience sent, or the person's; `null` with none. It is an echo, not proof: Engine accepts a label it does not know **without an error**, echoes it and writes (and bills) the default reading as one more interpretation. `audienceEvidence.profileName` can reveal that silent fallback, but it is a profile name, not an audience label.
- The interpretation's **language** is not the audience: it is the person's `narrative.language`, chosen for whoever is going to read the reading (the person's spoken language if they read it, the reader's if someone else does) and set per person before the session ([questions-and-transcription.md](questions-and-transcription.md)). Engine reads it when it interprets: a stored interpretation comes back in the language it was written in, even after `updateUser`; only `reAnalyze: true` rewrites it in the current one, at the cost of a new interpretation. Set the audience and the language together with one `updateUser`: it keeps the fields you leave out. In the playground, «Interpretation» (next to «Spoken language») sets it on the test person, as your backend would.

Before writing code, compare the readings of your kit's audiences in the playground (https://devlab.neurologyca.com/playground#measure, «Audience»): it sets the audience on the test person before enrolling, as your backend would (https://devlab.neurologyca.com/docs/start/testing.md).

## Reading a session again without paying for another

Engine stores the interpretation per session and audience. `POST /analyze` serves it from storage (`from_cache: true`, `AnalyzeResult.fromCache`) **only** when:

- the stored one came out `complete` (with `degraded` or `failed`, or none stored yet, every call regenerates it and is billed: ask once, never in a loop);
- you send the audience it was written for (its `audience_applied`). Without `audience`, Engine uses the one the person has **now**: if it changed since, it generates and bills a new interpretation for that audience. If `audience_applied` was `null`, read again without `audience` only while the person still has none;
- and without `reAnalyze`.

`reAnalyze: true` (`admin.analyze(pair, { reAnalyze: true })`) **always** generates a new interpretation and bills it, replacing the stored one for that audience (unless the new one comes out worse: `keptPrevious`, Engine's `re_analyze_kept_previous`). Use it only on a deliberate decision, from your backend; the SDK's proxy strips it from browser bodies. A call with `step` is never cached either. Measurement has nothing to read again. https://devlab.neurologyca.com/docs/concepts/results.md

## Late results

- `E_RESULTS_TIMEOUT`: nothing arrived within `outcomeDeadlineMs` (240 s by default), but Engine is still processing. Do not recapture: read later with `retrieveResults(userProtocolId, protocolMechanicId)` in the page or `getResults` in your backend.
- Read too early, `/results` comes back with empty `rawResults` and `aggResults`: read again a little later, a few times.
- `E_INTERPRETATION_TIMEOUT` or `E_ANALYSIS_IN_PROGRESS` after `stop()`: Engine has the capture; never `abort()`. Show the indicators and ask for the interpretation later (`client.analyze()`, or `admin.analyze` from your backend, with the pattern above).
- With the deferred mode (Preview), wait for the job's `succeeded`, not the `interpreting` notice ([deferred.md](deferred.md)).
