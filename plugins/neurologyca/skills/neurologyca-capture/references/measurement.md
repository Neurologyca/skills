# Measurement

The first integration: it only measures, so there is no taxonomy to settle and nothing to interpret.

## What it is

**Measurement** is a protocol every organization has, with no assignment to ask for: one position, one mechanic and one step. Measurement returns indicator values without an interpretation: you send the capture and get the indicators back, per frame and aggregated. Capture it with `triggerAnalysis: false`. https://devlab.neurologyca.com/docs/guides/measurement.md

- Each measurement is one enrolment and one capture. A completed position cannot be captured again: to measure the same person again, enrol them again.
- The step has a minimum duration in the catalogue; read it with `describeStep` and do not close the step earlier (`step.duration-below-min`).
- A baseline is recommended to compare people or sessions, not required (https://devlab.neurologyca.com/docs/concepts/baseline.md).

## The kit

The kit of a Measurement protocol (https://devlab.neurologyca.com/integration) carries a `neuro.config.json` with `taxonomy.contextId: 'measurement'`: Measurement has no taxonomy, but `createProtocolClient` requires a `contextId` and throws without one. Do not replace it with an invented context.

The same file carries `triggerAnalysis: false`, but it is not a field of the SDK's configuration: it is a key of your application, which your code reads from the JSON and passes to `captureProtocol`:

```js
const session = await client.captureProtocol({ userProtocolId, protocolMechanicId, source: { type: 'webcam' }, triggerAnalysis: false })
```

**A kit built in your backend.** With `@neurologyca/capture-server` 0.21.0, `admin.buildTenantKit(pid)` gives Measurement a kit of its own: `kind: 'measurement'`, with `config.taxonomy.contextId` `MEASUREMENT_CONTEXT_ID` (`'measurement'`), only `env.ROLE` pending (optional) and a notice to capture with `triggerAnalysis: false`. Branch on `kit.kind` (every other kit is `'context'`) and resolve the kit **before** `admin.enrol`, so a kit that fails leaves no enrolment behind. `ProtocolSummary.interpreted` (`listProtocolLibrary`) says whether a protocol is interpreted (`false` for Measurement; `null` when the catalogue does not say). Against an Engine whose catalogue does not publish `interpreted`, or with a `capture-server` whose `TenantKit` has no `kind`, it still throws `E_KIT_NO_CONTEXT` for Measurement: there, return the fixed configuration above (`engineBaseUrl: '/engine'`, `taxonomy: { contextId: 'measurement' }`, and `triggerAnalysis: false` for the capture) with nothing pending. https://devlab.neurologyca.com/docs/sdk/backend.md

Keep it `false` for Measurement. Where Engine reports that the protocol is not interpreted, the SDK sends no taxonomy and asks for no analysis on its own; where Engine does not report it, without `triggerAnalysis: false` the SDK asks for an analysis that Engine refuses. Never call `/analyze` in a Measurement flow.

## What you see

- The warning `protocol.not-interpreted`, once per capture, where Engine reports `interpreted: false`. It is expected.
- `interpretation` is `null`, as it should be: Measurement is never interpreted. The indicators arrive by `onResult`, and later with `getResults` from your backend.
- No transcription by default: its only step is not a speech step. If the person talks and you transcribe, Engine keeps the text and `/results` returns it as the `transcript` of step 1 in `speech` (measured; only in the test environment's Engine). Otherwise, turn transcription on only in protocols with speech steps (https://devlab.neurologyca.com/docs/guides/csp-transcription.md).
- In Deferred (server-side) (Preview), `triggerAnalysis: false` travels in the manifest, the service asks for no analysis and its job ends with `interpretation: 'not-requested'` ([deferred.md](deferred.md)).
