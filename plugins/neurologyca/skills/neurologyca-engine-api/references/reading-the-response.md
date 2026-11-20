# Reading the response: languages, audience, questions and what to show

What your backend sets before the capture, what it keeps, and what it shows when the results and the interpretation arrive. The field tables and examples are in https://devlab.neurologyca.com/docs/concepts/results.md; the same rules for people, with the availability table field by field: https://devlab.neurologyca.com/docs/guides/show-results.md; the calls, in [capture-cycle.md](capture-cycle.md).

## Contents

- [Two languages](#two-languages)
- [The question of each step](#the-question-of-each-step)
- [Audience](#audience)
- [What to keep](#what-to-keep)
- [Which indicators to show](#which-indicators-to-show)
- [What to show when the interpretation arrives](#what-to-show-when-the-interpretation-arrives)
- [Per step or per question](#per-step-or-per-question)
- [Reading the interpretation again without paying](#reading-the-interpretation-again-without-paying)

## Two languages

- **Spoken language**: the one the person speaks. Your transcriber uses it, and it decides which text of each question you show. It is **declared, never detected**: keep it with the person or the interview and pass it to your transcriber; one language per capture. A transcriber forced to the wrong language translates or drops the speech without an error. Send it as `speech.language` with the transcript ([frames.md](frames.md)).
- **Interpretation language**: the one Engine writes the reading in, set on the person, `narrativeLanguage` in `POST /users` (operationId `CreateUser`) or `PATCH /users/{external_id}` (operationId `UpdateUser`) (the kit's `NARRATIVE_LANGUAGE` is only the default for new people; without it, `en`). It is also the language of `questionText` in `speech` of `/results`. It never comes from the transcript, nor from `/analyze`.
  - **How to choose it**: the language of **whoever is going to read** the interpretation. If the person reads it, their spoken language; if someone else does, that reader's language, even when the person speaks another. It is **per person, not one value for the whole project**: keep it with the person and set it **before the session**.
  - **When Engine reads it**: when it interprets, not when the session is created. A session not interpreted yet comes out in the language the person has at that moment; one already interpreted comes back from `/analyze` (`from_cache: true`) in its own language, even after a `PATCH`. `reAnalyze: true` rewrites it in the current language and costs a new interpretation.
  - A `PATCH` keeps the fields you leave out and `null` removes one: send `audience` and `narrativeLanguage` together or apart without overwriting the other.

## The question of each step

- The plan (`GET /user-protocols/{userProtocolId}/mechanics/{protocolMechanicId}` (operationId `GetMechanicScript`)) gives each step its `media[]` (the questions, with `pid` and a `body` per language) and `delivery`.
- Show one question per step and never the same one in two steps (the default: the first of the step not used by an earlier one). Send its `pid` as `mediaId` in every batch of that step: a bad or unknown one is a `400` with `KPN-EMO-MEDIA`; a missing one is not an error (the interpretation just lacks the question), and a media of another step passes silently ([batches.md](batches.md)).
- A step with no media of its own can borrow its neighbour's: `delivery.media_from` is `previous_step` (an answer step: keep the previous question on screen) or `next_step` (a silent reading step shows the next step's question). An answer step (`category: 'answer'` or `expectsSpeech: 'yes'`) keeps the previous question on screen.
- Show only media bodies, in the spoken language, else English; never `delivery.instructions` or `delivery.prompt`.

## Audience

An interpreted context can write its reading for different **audiences**. Take the labels from your kit: `KIT.md`, section «Audiences», lists those of the protocol's context and of its target indicator, marks the default one «(default)» and lists those set for your organization. Some audiences are restricted and appear in a kit only when Neurologyca has set them for your organization: never send one your kit does not list.

- **On the person**: `audience` in `POST /users` (operationId `CreateUser`), or later in `PATCH /users/{external_id}` (operationId `UpdateUser`) (`null` removes it). Set it before the capture, as the playground does: the batches (and the `Final` that starts the interpretation) accept no `audience`, so only the person's audience at that moment can reach it.
- **Per request**: `audience` in the body of `POST /analyze` (operationId `Analyze`); it wins over the person's.
- **Without either**, Engine applies the context's default reading: the one `KIT.md` marks «(default)» or, when it marks none, Engine's own. A context with no audiences needs none.
- **Another audience for the same session**: one more `/analyze` with that `audience`; no new capture. Each audience is generated once per session (the first request costs a whole interpretation) and then stored.
- **`audience_applied`** in the answer is the audience sent or the person's, `null` with none. It is an echo, not proof: a label Engine does not know is accepted **without an error**, echoed and written (and billed) with the default reading, as one more interpretation.

## What to keep

Next to your user: the `externalId` (opaque), the pair (`userProtocolId`, `protocolMechanicId`), the audience you set on the person for that capture (or none: your fallback when `audience_applied` does not arrive) and, once you read the interpretation (from `/analyze`, or from `constellation.complete` on the stream when it carries them), its `audience_applied` and `metadata.status`. Engine sends no webhooks and keeps results until you delete the person.

## Which indicators to show

- Only the public indicators of https://devlab.neurologyca.com/docs/concepts/results.md, by their key exactly as it arrives (case-sensitive, `Stress_intens`, `workload_model`); ignore the other keys and tolerate one that appears or goes away. A missing key in a frame is a gap, never a zero; the scales differ (Valence, Attention).
- Which of them you receive depends on the context and on your organization's agreement (every interpreted context includes the ones its interpretation needs; the rest by agreement, and it can change). The list of each protocol is in DevLab, Your integration › Protocols, the block «Indicators you receive in this context» (`KIT.md` links to Your integration › Protocols). Treat every indicator as optional: a key that never arrives was not received. The recorded examples carry the whole public catalogue. To receive more, the user asks Neurologyca. https://devlab.neurologyca.com/docs/resources/pitfalls.md
- `session` (Preview, in the three `/results` routes; inside each item of `mechanics[]` in `GET /results/{userProtocolId}` (operationId `getResultsByEnrolment`)): whole-session values keyed by indicator, neither per frame nor per step. Today only `effective_active_attention`: `{ v, n }`, `v` from 0 to 100 (a percentage of frames with Attention = 1, not the 0–1 Attention mean) and `n` the frames it was computed over. `null` means not measured (not 0) or not in your context; on the interruption route it is `null`.
- Not valid, do not show:

- Motivation (`faa`): Not valid, do not use: it arrives out of its range and Engine is replacing its model.

- Never in `/results` (they need previous sessions of the same person in the same context and are used only inside the interpretation):

- Disengagement (Preview): **Warm-up: 5 sessions.** From the 6th session, in a step with at least 60 s of valid face (in practice about 66–76 s in a row). Per step or per session, only used for the interpretation (`/analyze`); no route returns its value today; not yet in Engine production
- Mental Fatigue Load (Preview): **Warm-up: 5 sessions.** From the person's 6th session in that context: it needs 5 previous completed sessions, and the baseline does not count. Per step or per session, only used for the interpretation (`/analyze`); no route returns its value today; not yet in Engine production
- Emotional Mental Control (Preview): **Warm-up: 5 sessions.** From the 6th session, in uninterrupted 3-minute blocks (a shorter session has no value); the Engine model is provisional. Per step or per session, only used for the interpretation (`/analyze`); no route returns its value today; not yet in Engine production
- Facial Muscle Tension (Preview): **Warm-up: 0 or 5 sessions.** From the 1st session if the context already has Neurologyca calibration data; otherwise from the 6th. Per step or per session, only used for the interpretation (`/analyze`); no route returns its value today; not yet in Engine production

## What to show when the interpretation arrives

1. `metadata.status`: `complete` shows; `degraded` shows with a notice; `failed` never shows (the indicators are still valid).
2. The summary: `structured_data.insight`, else `structured_data.headline`, else the first entry of `sections[]`.
3. The reading: `sections[]` (match by `key`, never by `title`) **or** `interpretation` (Markdown), never both; render Markdown safely.
4. A 0 to 100 index when the domain has one (each under its own key, for example `wellness_index`): `value` and `label` as they come ([capture-cycle.md](capture-cycle.md#8-the-interpretation)).
5. Who it was written for (`audience_applied`, or «default reading»).
6. Preview, only when present (seen so far only in the test environment's Engine): `structured_data.primary_emotion.term` (English catalogue term), `structured_data.selected_ehcis[]` (`id` and `measured_value`, whole session, in the context's order; the `id` is not the `/results` key, and a relevant one may not be in your `/results` if your context does not include it; only public ones, never Motivation nor the four that need previous sessions) and `structured_data.pairs[]`. Nothing else of `structured_data` or `metadata` is promised.

## Per step or per question

Indicators and `speech` come **per step**, keyed by the step's order. A question often spans two steps (question, then answer with `media_from: previous_step`). To show per question:

- With `structured_data.pairs[]` (Preview): `windows.opening.order` and `windows.closing.order` are the step orders where the question opens and closes; ignore a pair whose orders are not in your results or whose `status` (`complete`) you do not know. With a question in one step and its answer in the next, the answer comes as an `incomplete` pair whose `notes` include `question_from_preceding_step` and has only `windows.closing.order`: its question is the step before (the question step comes `unpaired`, without orders).
- Without it: from `speech` (only in the test environment's Engine), a step with `questionText` and `transcript` is one question, and a step with `questionText` followed in the very next step by one with only `transcript` (or repeating that `questionText`) is one too; otherwise leave the question alone.
- `transcript` is what you sent for that step in `sttByStep`; joining them is not the full text. Show it only to whom your consent allows; never log it.
- Means: `aggResults` is per step. For a question or the whole session, add up every frame's value in `rawResults` for those steps and divide by the frames that carry the key; never average the step means. The only session values Engine gives are `selected_ehcis[].measured_value` and `session` (today only Effective Active Attention).

## Reading the interpretation again without paying

`POST /analyze` answers from storage (`from_cache: true`) only when the stored interpretation came out `complete`, you send the `audience` it was written for (its `audience_applied`; without `audience`, Engine uses the person's **current** one and, if it changed, generates and bills another), and you do not send `reAnalyze`. With `degraded` or `failed`, every call regenerates it: ask once. `reAnalyze: true` **always** generates and bills a new one (Engine may keep the previous one: `re_analyze_kept_previous: true`); calls with `step` are never cached; `POST /analyze/stream` is never stored. Keep `reAnalyze` out of anything a browser can reach (https://devlab.neurologyca.com/docs/api/proxy.md).
