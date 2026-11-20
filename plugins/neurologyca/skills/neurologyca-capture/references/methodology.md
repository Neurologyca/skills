# Methodology

What the SDK captures, in what order, and what the results mean. Each section links the page that holds the detail; the scales and the field names are there, not here.

## The hierarchy

Everything hangs from a **context** that Neurologyca assigns to your organization. Inside it, a **protocol** says what is measured and when: an ordered list of **positions**, each one running a **mechanic** (the script of one capture) made of **steps**. You define nothing in the catalogue: your backend reads it and enrols people in it. The pair `userProtocolId` + `protocolMechanicId` is one person at one position: it is what the page captures and what you read results with later. https://devlab.neurologyca.com/docs/concepts/protocols.md

## Sessions, enrolments and interruptions

- Enrol the person (`createEngineAdmin`), ask for the next position (`getNextPosition`), and capture it. The first data Engine receives opens a session for that pair; there is no session id to keep.
- Each position has at most one open session and one completed one. To measure the same person again at a completed position, enrol them again.
- A session that receives nothing for a while is abandoned; it restarts from the first step. A position that is not open yet, or whose window closed, answers a conflict (`E_CONFLICT`): branch on `reason`.
- After a completed capture, a context may offer a **microintervention** (an **interruption**, anchored to that capture). The SDK does not drive them (`flowMode: 'free'` is refused with `E_FLOW_UNSUPPORTED`): your page handles them.

https://devlab.neurologyca.com/docs/concepts/sessions.md

## Baseline

A **baseline** is a short reference capture of one person, separate from any protocol and shared by all of them. Engine uses it to calibrate that person's indicators, and applies it whenever one exists, whatever its status. Without one, only population calibration applies and Engine does not block the capture: the enrolment carries a `baselineWarning`.

- Check it with `getBaselineInfo` and capture it with `captureBaseline` before the first protocol capture, and again when it expires or is invalid.
- It must come from the **same person** you measure, with the **same source** (camera or file) as the measurement, as the playground enforces.
- Do not run two baseline captures of the same person at once.

https://devlab.neurologyca.com/docs/concepts/baseline.md

## Steps

What the page shows and how long each step lasts come from `describeStep(step)`: duration window, text, phases, rounds and what the catalogue did not say. Never write a `switch` on `step.type`: `describeStep` reads every type the same way, without rules per type. Steps go one at a time, in the plan's order; `run()` closes a step after a time, `start()` and `end()` let your page close it. Outside the catalogue's window the SDK warns (`step.duration-below-min`, `step.duration-above-max`) or, with `stepDurations: 'enforce'`, refuses. https://devlab.neurologyca.com/docs/sdk/steps.md

## Results and interpretation

- **Indicators (HCIs)**: per frame and aggregated, per step, by `onResult` in the page and with `getResults` from your backend. Their scales are not all the same: read them in https://devlab.neurologyca.com/docs/concepts/results.md before drawing or comparing anything.
- **Interpretation**: a narrative written by a language model from the indicators, only for interpreted protocols (never Measurement). It arrives by `onInterpretation`, after the indicators.
- A **degraded** interpretation (`analysis.degraded`) can be shown, with a notice; a **failed** one (`E_ANALYSIS_FAILED`) is a placeholder: never show it as a result. In both cases the indicators are valid.
- The interpretation does not decide the result: present it as a reading of the indicators.
- What to keep, show and read again, per question and per audience: [results-and-interpretation.md](results-and-interpretation.md). The question of each step and the two languages: [questions-and-transcription.md](questions-and-transcription.md).

https://devlab.neurologyca.com/docs/concepts/results.md
