# The frame and the transcript

What each frame of `POST /process-kpn-emo` (operationId `ProcessKpnEmo`) carries, and how to send the transcript, for when you compute the frames yourself instead of using the SDK. Checked against the codec the SDK uses, the sample capture of the docs and the SDK's own requests. The step-by-step guide: https://devlab.neurologyca.com/docs/api.md.

## The frame

Each item of `frames` is one video frame as MediaPipe FaceLandmarker gives it:

| Field | What it carries |
| --- | --- |
| `clientTsMs` | When the frame was captured, in epoch milliseconds, increasing |
| `landmarks` | 478 points `[x, y, z]`: the 468 of the face and the 10 of the iris (FaceLandmarker with iris). `x` and `y` normalised from 0 to 1 over the image |
| `blendshapes` | The 52 categories of FaceLandmarker in its order: `_neutral` at index 0, then the ARKit names (`jawOpen` 25, `mouthSmileLeft` 44, `mouthSmileRight` 45), with no `tongueOut` |
| `headPose` | `pitch`, `yaw` and `roll` in radians (Euler angles, ZYX) |
| `featuresMeta` | Without it, Engine gives that frame no valence or arousal and counts it in `framesWithoutFeaturesMeta` of the `202`. The keys of the sample: `space: "frame"`, `z: "mediapipe_width"`, `image_width`, `image_height` (pixels) and `client_ts_ms` (the frame's `clientTsMs`) |

- **The blendshapes are not in ARKit's order.** The spec once said "Apple ARKit 52-shape specification"; the names are ARKit's, the order is MediaPipe's. From an ARKit dictionary (iOS), put each value at its MediaPipe index: in ARKit's own order `mouthSmileLeft` would land at 43, one off.
- **The shape is exact: send 478 landmarks of 3 coordinates and 52 blendshapes, or both empty.** Classic MediaPipe without iris gives 468 (468 face + 10 iris make 478): turn the iris on. Engine is rolling out a check of this shape on `POST /process-kpn-emo` (operationId `ProcessKpnEmo`), its microintervention route and `POST /users/{app_user}/baseline` (operationId `CaptureBaseline`). Where it applies, one frame with any other shape rejects the whole batch with `400` and `qualityCode: "KPN-EMO-FRAME-MALFORMED"`, nothing is stored, and, on a capture batch, the body says which frames (`firstMalformedFrame`, `malformedFrames`; the baseline's `400` documents only the `qualityCode`): fix those frames and send the batch again. Where it does not apply yet, with 468, measured on 2026-08-09, Engine accepted every batch and the session never closed.
- **A frame with no face** comes out of the codec with `landmarks: []` and `blendshapes: []`. The SDK does not send it (it drops every frame without a head pose): drop it too. Where the shape check applies, such a frame (both empty) is accepted and counted in `framesWithoutFace` of the `202`, for information; where it does not apply yet, a frame with no face has not been measured.
- **Which `featuresMeta` keys Engine requires is not published.** Send at least the sample's; the SDK also sends its codec's own keys (`wire`, `extractor`, `mode`, `thresholds`, `delegate`, `capture`).

## The transcript

If you transcribe the session, send it once, as top-level keys of the `Final` of the last step, next to `triggerAnalysis`:

- `speech`: the whole session, with `language`, `accuracy` (`null`), `text`, `list` (`[]`) and `spokenMs` (milliseconds with voice), plus `startMs` and `endMs` when you know them.
- `sttByStep`: the same speech split by step, `[{ step, text, startMs, endMs, spokenMs }]`; `step` is the step's order (the SDK sends `null` for speech it could not place in a step; always send the order yourself), and `startMs` and `endMs` are epoch milliseconds (the clock of `clientTsMs`) or `null`.
- `sttCutBy`, only when the transcription was cut.

The public spec does not type `sttByStep` yet, and its `speech` schema lists only `language`, `accuracy`, `text` and `list`: this is the shape the SDK sends and Engine accepts, and Engine stores it as sent. The interpretation's language is the person's `narrative.language`, not the transcript's. What you send in `sttByStep` comes back per step as `transcript` in `speech` of `/results` (only in the test environment's Engine).
