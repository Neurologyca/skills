# The frame batches

Every frame of a position reaches Engine in batches sent to `POST /process-kpn-emo` (operationId `ProcessKpnEmo`). These rules are checked against the spec, the Limits page (https://devlab.neurologyca.com/docs/concepts/limits.md) and the HTTP path the playground runs. Each one says whether Engine enforces it or whether it is the good practice the SDK follows.

## What Engine enforces

- **One step at a time, each with its own numbering.** `step` is the step's `order` from the plan (at least 1), and `kpnfile.order` starts at 1 again in every step, with no gaps.
- **Every step closes with its own `Final`.** Without it, every batch still answers `202` but the step never closes and the session is abandoned. A gap in `kpnfile.order` is caught at the `Final` instead (next rule).
- **A batch carries at least one frame**, the `Final` included. If a step has nothing left for its `Final`, keep its last frames for it.
- **The `Final` checks the step.** If earlier batches of that step are missing, the `Final` answers `400` with `qualityCode: "KPN-EMO-MISSING-PACKETS"` and a `missingOrders` list, and stores nothing. Resend the batches in `missingOrders`, then the `Final` again.
- **A `step` that is not in the plan** answers `400` with `qualityCode: "KPN-EMO-STEP"`: fix the `step`.
- **`triggerAnalysis` only counts on the `Final` of the last step.** Left out, it means `false` over HTTP (the SDK does the opposite). Send `true` there on an interpreted protocol; with Measurement, send `false` and never call `/analyze`.
- **Free flow.** In a mechanic whose `flowMode` is `free`, also send `mechanicComplete: true` on that last `Final`.
- **The media.** `mediaId` is the `pid` of the media the step shows, in every batch of that step. A `mediaId` that is not a uuid, is a numeric catalogue id or does not exist answers `400` with `qualityCode: "KPN-EMO-MEDIA"`: send `steps[].media[].pid` from the script. When the step has several media (alternative questions), send the `pid` of the one you showed in every batch of that step: without it the interpretation lacks the question (`metadata.missing_inputs` includes `question_text`, and `status` is not `degraded`). Engine does not check that the `mediaId` belongs to the step, so a media of another step passes without an error. In a step with phases the text media are cues of each phase, not alternatives.
- **A resent batch keeps the first copy.** Sending the same `kpnfile.order` again with other content answers `202` and Engine keeps what it received first.
- **Silence abandons the session.** With no batch for a while (a setting of the environment), the next batch answers `409` with `reason: SESSION_ABANDONED`: start that position again from `step` 1 and `kpnfile.order` 1. What was sent is discarded.

## What the SDK does, and you should too

- **Small batches, cut by count and by size.** Send `Partial` batches while the step runs, never more than 300 frames or 3 MB of frames each (the SDK's limits, the `Final` included). A camera frame with full-precision floats is tens of kilobytes, so the byte cut is the one that usually applies. The spec recommends small batches for latency.
- **A body cap that fits the batch.** Whatever sits in front of Engine (your proxy, a gateway, a serverless function) must accept your largest batch: at least 4.5 MB for batches cut like the SDK's. A Vercel function caps the body at 4.5 MB and a Next.js Pages Router API route (`pages/api`) at 1 MB by default (an App Router route handler has no body parser); over the cap you get a `413`, which is final.
- **A pause before each `Final`.** Engine aggregates the step when the `Final` arrives, and the batch just before it may still be in process. Wait 2.5 s since the previous accepted batch of that step before you send its `Final`. The gap is per step.
- **One retry for a `429`.** If a batch answers `429` with `Retry-After`, wait that long and send the same batch once more (the playground does this once, with a cap of its own).
- **`featuresMeta` on every frame.** Frames without it give no valence or arousal axes; the `202` counts them in `framesWithoutFeaturesMeta`.

## Order of the calls around the batches

1. Open the stream (`GET /stream/{userProtocolId}` (operationId `StreamUserProtocol`)).
2. Set the context of an interpreted protocol (`POST /user-protocols/{userProtocolId}/{protocolMechanicId}/context` (operationId `SetContext`)), before the first frame.
3. For each step of the plan, in `order`: its `Partial` batches, the pause, its `Final`.
4. Wait for `constellation.complete` or `results.ready`, then read `/results` (see [capture-cycle.md](capture-cycle.md)).

A `202` only means accepted and queued; a `400` with a `qualityCode` that is not `KPN-EMO-MISSING-PACKETS`, `KPN-EMO-STEP`, `KPN-EMO-MEDIA` or `KPN-EMO-FRAME-MALFORMED` (the ones you fix and send again) does not change by retrying. The full table of quality codes is in https://devlab.neurologyca.com/docs/concepts/limits.md.
