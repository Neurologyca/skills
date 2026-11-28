# Questions, languages and transcription

How to show the question of each step, which language is which, and where the transcription comes from and goes. The detail is in https://devlab.neurologyca.com/docs/sdk/steps.md and https://devlab.neurologyca.com/docs/guides/csp-transcription.md.

## Contents

- [The question of each step](#the-question-of-each-step)
- [Two languages: spoken and interpretation](#two-languages-spoken-and-interpretation)
- [Transcription: where it happens and what to collect](#transcription-where-it-happens-and-what-to-collect)
- [When a step has no transcript](#when-a-step-has-no-transcript)

## The question of each step

- Read each step with `describeStep(step)`, never with rules per `step.type`. Its text media (the questions) are in `describeStep(step).texts`; `facts.text` is only the first match.
- **Declare the question you show**: `await session.step(n).start({ mediaPid })` (also in `run({ durationMs, mediaPid })`). Without it, in a step with several questions, the SDK warns `step.media-undeclared` (not in steps with phases) and the interpretation lacks the question; a `mediaPid` that is not of the step throws `E_MEDIA_UNKNOWN`.
- **One question per step, never the same one in two steps.** The default is the first question of the step not used yet by an earlier one. If a protocol has more steps than different questions, it cannot be captured this way.
- **A step without media of its own** can borrow its neighbour's: `delivery.media_from` is `previous_step` (an answer step: keep the previous question on screen) or `next_step` (a silent reading step shows the question chosen for the next step; it lends the text, never the media, so declare no `mediaPid` there). An answer step (`category: 'answer'` or `expectsSpeech: 'yes'`) keeps the previous question on screen and shows its own media as the line under it. Any other step is not an answer step, whatever its type's name or `responseClock` say: never show it as «answer now». `describeStep` (`StepFacts`) gives `expectsSpeech` but not `category` nor `media_from` (SDK 0.46.1; asked): read them from the plan step, `session.plan.steps[i].category` and `.delivery.media_from` (`StepDelivery` does not type it). https://devlab.neurologyca.com/docs/sdk/steps.md
- Show only media bodies, never `delivery.instructions` or `delivery.prompt`. Pick the text in the **spoken** language (below), else English, else the first language the body has. Insert it as text (`textContent`), never as HTML.
- The kit writes the default choice as `media` in `neuro.config.json` (`{ "<mechanic>": { "<step order>": "<mediaPid>" } }`) and `KIT.md` lists the options. `media` (like `triggerAnalysis`) is a key of your page, not of the SDK's configuration. The starters split `transcribe`, `transcribeSteps`, `triggerAnalysis` and `media` off the JSON, pass the rest to `defineTenantConfig`, and then pass `transcribe: { language }` with the kit's `transcribeSteps` or, without it, the voice step types; without transcription the reference code turns audio off (`channels: { audio: false }`), so no microphone opens.

The playground's reference code applies exactly these rules (`stepPrompt` and `mediaFor` in its integrations; «SDK and API» shows them). Over the HTTP API the same choice goes as `mediaId` in every batch of the step; in Deferred (server-side), as the `mediaPid` of each step in the manifest.

Copy this module: it applies these rules to `session.plan.steps` and gives the `mediaPid` to declare (https://devlab.neurologyca.com/docs/sdk/steps.md uses it in its step loop).

```js
// What each step shows, from the plan: its own question; without one, the previous step's (media_from 'previous_step')
// or the next step's text (media_from 'next_step', a silent reading step: it lends the text, never the media).
// An answer step (category 'answer' or expectsSpeech 'yes') keeps the previous question on screen, its own media under it.
// Only media bodies, never delivery.instructions or delivery.prompt.
import { describeStep } from '@neurologyca/capture/record' // the light entry: it does not download kodec

/**
 * @typedef {{ kind: 'question' | 'answer' | 'silent', text: string | null, cue: string | null, mediaPid: string | null }} StepPrompt
 * @param {import('@neurologyca/capture/record').PlanStep[]} steps session.plan.steps
 * @param {number} order the step to show
 * @param {Record<string, string>} choice the mediaPid you chose per step order; absent, the step's first text
 * @param {string} lang the spoken language
 * @returns {StepPrompt | null} mediaPid: what to declare in start({ mediaPid }), null when the step has no media of its own
 */
export function stepPrompt(steps, order, choice, lang) {
  const sorted = [...steps].sort((a, b) => a.order - b.order)
  const at = sorted.findIndex((s) => s.order === order)
  if (at < 0) return null
  const step = sorted[at], prev = sorted[at - 1], next = sorted[at + 1]
  /** @param {import('@neurologyca/capture/record').PlanStep} s */
  const pidOf = (s) => choice[String(s.order)] ?? describeStep(s).texts[0]?.mediaPid ?? null
  /** @param {import('@neurologyca/capture/record').PlanStep} s */
  const own = (s) => {
    const body = describeStep(s).texts.find((t) => t.mediaPid === pidOf(s))?.body
    return body ? (body[lang] ?? body.en ?? Object.values(body)[0] ?? null) : null
  }
  /** @param {import('@neurologyca/capture/record').PlanStep} s */
  const isAnswer = (s) => s.category === 'answer' || s.expectsSpeech === 'yes'
  const from = step.delivery?.media_from // not in StepFacts today: read it from the plan step
  /** @type {StepPrompt['kind']} */
  const kind = isAnswer(step) ? 'answer' : from === 'next_step' && step.expectsSpeech === 'no' ? 'silent' : 'question'
  const mine = own(step)
  if (mine === null) {
    const lent = from === 'previous_step' && prev ? stepPrompt(steps, prev.order, choice, lang)?.text ?? null
      : from === 'next_step' && next ? own(next) : null
    return lent === null ? null : { kind, text: lent, cue: null, mediaPid: null }
  }
  // Not after a next_step reading step: that one already showed this step's own question.
  if (isAnswer(step) && prev && !isAnswer(prev) && prev.delivery?.media_from !== 'next_step') {
    const question = stepPrompt(steps, prev.order, choice, lang)?.text ?? null
    if (question !== null) return { kind, text: question, cue: mine, mediaPid: pidOf(step) }
  }
  return { kind, text: mine, cue: null, mediaPid: pidOf(step) }
}
```

## Two languages: spoken and interpretation

| | Spoken language | Interpretation (narrative) language |
| --- | --- | --- |
| What it is | The language the person **speaks** in the capture | The language Engine writes the reading in |
| How to choose it | The one the person speaks, declared | The one of **whoever is going to read** the interpretation: the person's spoken language if they read it themselves; the reader's if someone else does, even when the person speaks another |
| Where it is set | `transcribe: { language }` in the client (or the kit's `transcribe.language`), a code without a region (`es`, `en`) | On the person, **before the session**: `narrative: { language }` in `createUser` / `updateUser` (`narrativeLanguage` in the HTTP API; the kit's `NARRATIVE_LANGUAGE` is only the default for new people); without it, `en` |
| What it changes | The transcription, and which text of each question you show | The text of the interpretation, and `questionText` in `speech` |
| What it never changes | The interpretation's language | The transcription |

- The spoken language is **declared, never detected**. Keep it with the person or the interview in your backend and pass it to every capture; if you do not know it, ask before capturing (on the consent screen). Do not infer it from the page's language when the two can differ. One language per capture.
- A wrong spoken language does not fail: the text comes back translated into the declared language, or empty (only `stt.silent` when nothing is left). `language: null` autodetects (`stt.autodetect`) and can translate into English too: do not fall back to it.
- `transcribe` lives in the client's configuration, not in `captureProtocol`: when people speak different languages, create the client for each capture with that person's language.
- The interpretation's language is **per person, not one value for the whole project**: keep it with the person (or ask who will read the reading) and set it on each one. Without `narrative.language` on the person, a capture in Spanish comes back interpreted in English (https://devlab.neurologyca.com/docs/sdk/backend.md).
- Engine reads the person's language **when it interprets**, not when the session is created: a session not interpreted yet comes out in the language the person has at that moment, and one already interpreted comes back in its own language, even after `updateUser`. `updateUser` keeps the fields you leave out (`null` removes one). To rewrite an interpretation in the new language, `admin.analyze(pair, { reAnalyze: true })` from your backend: it costs a new interpretation, so only on a deliberate decision.

## Transcription: where it happens and what to collect

- **Live, on the device.** `transcribe: { language }` turns it on (the kit's `transcribe` object turns it on even if your code passes none; only `transcribe: false` in the client keeps it off). With the camera it opens the **microphone**: the consent must say so, and that the text goes to a language model. With a `<video>` source it transcribes the file's own audio. The audio never leaves the device: only the text goes to Engine, once, in the last `Final`.
- **Which steps.** `transcribeSteps`: the step **types** to transcribe, taken from `PlanStep.type` of the plan (or the kit). Absent, every step is transcribed live; a step with `expectsSpeech: 'yes'` left out warns `transcribeSteps.excludes-voice-step`, and a live capture with `transcribe` off whose plan has `expectsSpeech: 'yes'` steps warns `transcription.off-on-voice-step`. Measurement's only step is not a voice step: transcribe it only if you want the text.
- **Deferred (Preview).** The processing service transcribes the recording's whole audio on the server (also between steps; only the text of the `transcribeSteps` steps reaches Engine), with the job's `language` and `transcribeSteps` ([deferred.md](deferred.md)). Engine never transcribes.
- **Where to collect it.** Per step, in `speech` of `/results` (`getResults` in your backend): `transcript` (what was sent for that step) and `questionText` (only in the test environment's Engine). There is no full-text field: joining the steps is not the whole transcript. Live, `onTranscript` streams the text in the page while the person speaks.
- The transcript is personal data: keep it out of logs, analytics, fixtures and examples.

## When a step has no transcript

- Show **every** warning, not only the last one: the `stt` warning, with its `blocker` (`no-webgpu`, `ladder-exhausted`, `video-cost-veto`, `no-memory-to-learn`, `dtype-required`), is the only sign that a capture is not transcribing, and a later one (`source.ended`) can replace it in a single-slot UI. Keep it in its own slot.
- `onReport` explains the rest when the capture ends: `transcriptionSetup` (`model`, `language`, `languageSource`, `backend`, `provisionalVetoLifted`) and, per step, `transcription.stepsTranscription[]` (`order`, `transcribed`, `emitted`, `spokenMs`): `transcribed: false` or `emitted: 0` heard no speech, which explains an empty `transcript`.
- `video-cost-veto`: transcribing made the camera analysis too slow in that browser, and kodec stored a veto there. A provisional one (measured at 8 fps or less, typically a hidden tab) is lifted by the first capture above that rate since SDK 0.41.0. To retry by hand, behind a button the person presses and never automatically: `readTranscriptionVeto(kodec)` and, if there is a veto, `forgetTranscriptionVeto(kodec)`, with the `kodec` that `@neurologyca/capture` exports. The veto belongs to the browser, not the person.
- If an answer step ends without speech (closed right after it opened), Engine can skip the interpretation.
- Every reason a transcript can be missing, in one list: https://devlab.neurologyca.com/docs/guides/show-results.md.

More symptoms: [symptoms.md](symptoms.md), section on transcription.
