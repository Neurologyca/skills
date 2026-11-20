# Symptoms

## Contents

- [Token and access](#token-and-access)
- [People and enrolments](#people-and-enrolments)
- [Batches](#batches)
- [Stream and results](#stream-and-results)
- [Interpretation](#interpretation)

Each row is checked against the JSON spec (https://devlab.neurologyca.com/openapi/engine-v2.json), https://devlab.neurologyca.com/docs/concepts/limits.md and the pitfalls the docs publish (https://devlab.neurologyca.com/docs/resources/pitfalls.md). Branch on the status and the field, never on `message`.

## Token and access

| Symptom | Status and field | Cause | Fix | Where |
| --- | --- | --- | --- | --- |
| The token route refuses the key | `401` on `POST /token` | The key is malformed, unknown, revoked or expired | Reveal the key again in Your account and API key (Engine keys › Reveal; it is not in the kit); never retry in a loop | https://devlab.neurologyca.com/docs/start/authentication.md |
| Every call answers `401` after a while | `401`, empty body, `WWW-Authenticate: Bearer` | The token expired, or its key was rotated or revoked | Mint a new token and retry the call once; cache tokens by `expiresIn` | https://devlab.neurologyca.com/docs/start/authentication.md |
| The token route answers `429` | `429` on `POST /token`, empty body | Too many token requests from your IP | Mint once and reuse the token until shortly before it expires | https://devlab.neurologyca.com/docs/start/authentication.md |
| The stream closes and reconnecting fails | `stream.end` with `reason: credential_…` | The key behind the token was rotated, revoked, deleted, expired or had its scope changed | After `credential_rotated` or `credential_scope_changed`, mint a new token (with the new key after a rotation) and reconnect; after `credential_revoked`, `credential_deleted` or `credential_expired`, a new token does not help: get a valid key first (Your account and API key › Engine keys; it is not in the kit) | https://devlab.neurologyca.com/docs/start/authentication.md |
| Nothing works for one person | `403` with `reason: USER_BLOCKED` | The person is blocked | Unblock them first, with the filter in the query | https://devlab.neurologyca.com/openapi/engine-v2.json |
| The key shows up in the page, a bundle or git | none | The key left your backend | Keep it in your backend's environment only; ask for a rotation if it leaked | https://devlab.neurologyca.com/docs/api/proxy.md |

## People and enrolments

| Symptom | Status and field | Cause | Fix | Where |
| --- | --- | --- | --- | --- |
| Creating the person fails | `409` on `POST /users`, no `reason` | That `externalId` already exists in your organization | Reuse the person and go on to the enrolment | `POST /users` (operationId `CreateUser`) |
| Enrolling fails for some people only | `403` on `POST /user-protocols`, no `reason` | They were created by another key and yours does not have scope `admin` | Enrol them with the key that created them, or an `admin` one | `POST /user-protocols` (operationId `CreateUserProtocol`) |
| Enrolling answers `409` | `409` with `reason: PROTOCOL_DEPRECATED` | The protocol was retired | Use the protocol in `publishedProtocolPid` | https://devlab.neurologyca.com/docs/concepts/limits.md |
| The position read has no next position | `nextProtocolMechanic` without an id | Every position of the enrolment is complete | Enrol again to measure again | https://devlab.neurologyca.com/docs/concepts/sessions.md |
| `/users/block` acted on every user | `200` on `POST /users/block` | The filters were sent in the body; they are read from the query (the test environment's Engine now answers `400` with no filter or with a body) | Put `externalId` in the query and refuse to send the call without a filter; `all=true` only on purpose | https://devlab.neurologyca.com/docs/reference.md |

## Batches

| Symptom | Status and field | Cause | Fix | Where |
| --- | --- | --- | --- | --- |
| The `Final` stores nothing | `400`, `qualityCode: KPN-EMO-MISSING-PACKETS`, `missingOrders` | Earlier batches of that step did not arrive | Resend the batches in `missingOrders`, then the `Final` | https://devlab.neurologyca.com/docs/concepts/limits.md |
| A batch is refused for its step | `400`, `qualityCode: KPN-EMO-STEP` | The `step` is not in the plan of the mechanic | Use the `order` of the steps of the plan | https://devlab.neurologyca.com/docs/concepts/limits.md |
| A batch (or a baseline batch) answers `400` about its frames | `400`, `qualityCode: KPN-EMO-FRAME-MALFORMED`; on a capture batch also `firstMalformedFrame` and `malformedFrames` | A frame without 478 landmarks of 3 coordinates and 52 blendshapes (and not both empty, a frame with no face). Engine is rolling out this check | Fix those frames (turn the iris on if you get 468) and send the batch again | [frames.md](frames.md) |
| A batch answers `400` and resending changes nothing | `400` with another `qualityCode` | The mechanic or the plan cannot take that batch | Do not retry; log it and tell Neurologyca if it persists | https://devlab.neurologyca.com/docs/concepts/limits.md |
| A batch answers `400` about the media | `400`, `qualityCode: KPN-EMO-MEDIA` | A `mediaId` that is not a uuid, is a numeric catalogue id or does not exist | Send `steps[].media[].pid` of that step, from the script | https://devlab.neurologyca.com/docs/concepts/limits.md |
| Every batch answers `202` but the position never completes | `202` | A step without its `Final`, or a free-flow mechanic without `mechanicComplete` on the last `Final` (a gap in `kpnfile.order` shows instead as the `KPN-EMO-MISSING-PACKETS` row above) | Close each step with a `Final`, and add `mechanicComplete: true` in free flow | [batches.md](batches.md) |
| The aggregate of a step misses its last batches | `202` | The `Final` came right after the batch before it | Wait 2.5 s before each `Final` | [batches.md](batches.md) |
| Batches are refused after a pause | `409` with `reason: SESSION_ABANDONED` | No batch for longer than the environment allows | Start the position again from `step` 1 and `kpnfile.order` 1 | https://devlab.neurologyca.com/docs/concepts/sessions.md |
| Batches are refused on a finished position | `409` with `reason: POSITION_ALREADY_COMPLETED` | The position already has a completed capture | Stop sending; continue with `nextPosition` if the protocol has more positions, and enrol again only to measure this one again | https://devlab.neurologyca.com/docs/concepts/limits.md |
| No valence or arousal for part of the capture | `202` with `framesWithoutFeaturesMeta` above 0 | Frames without `featuresMeta` | Send `featuresMeta` on every frame | [frames.md](frames.md) |

## Stream and results

| Symptom | Status and field | Cause | Fix | Where |
| --- | --- | --- | --- | --- |
| Waiting for `results.ready` after each step hangs | No event | It comes once per position, and not when an interpretation runs | Treat it as a signal; poll `/results` as the fallback | https://devlab.neurologyca.com/docs/concepts/results.md |
| `results.ready` never arrives on an interpreted protocol | `constellation.complete` instead | That position asked for an interpretation | Treat either event as the end of the capture | https://devlab.neurologyca.com/docs/api.md |
| `/results` is empty right after the last `Final` | `200` with empty `rawResults`, or `404` | The indicators are still being computed | Poll a few times, a few seconds apart | `GET /results/{userProtocolId}/{protocolMechanicId}` (operationId `getResultsByPosition`) |
| The stream closes after a long silence | `stream.end` with `reason: idle_timeout` | No events for a long time | Reconnect if you still need it | `GET /stream/{userProtocolId}` (operationId `StreamUserProtocol`) |

## Interpretation

| Symptom | Status and field | Cause | Fix | Where |
| --- | --- | --- | --- | --- |
| `constellation.complete` never comes | No event; every batch `202` | `triggerAnalysis` left out on the last `Final` | Send `triggerAnalysis: true` there, or call `/analyze` when the results are ready | https://devlab.neurologyca.com/docs/api.md |
| The context answers `201` with warnings | `taxonomyWarnings` with `UNKNOWN_CONTEXT` or `UNKNOWN_HCI` | Engine's local copy of the taxonomy can lag behind | Log them; what confirms the context is that `/analyze` answers | https://devlab.neurologyca.com/docs/api.md |
| The interpretation is refused | `422` from `/analyze` | A context that is not from your kit, or your organization is not active in the interpretation service | Do not recapture; take the context from the kit, and tell Neurologyca if every interpretation fails | https://devlab.neurologyca.com/docs/concepts/protocols.md |
| `/analyze` refuses a Measurement capture | `409` with `reason: PROTOCOL_NOT_ANALYSED` | Measurement is not interpreted | Read its indicators with `/results` | https://devlab.neurologyca.com/docs/guides/measurement.md |
| `/analyze` says there is nothing yet | `404`, «No results found.» | The position has no completed capture yet | Wait for the end of the capture, then ask again | https://devlab.neurologyca.com/docs/api.md |
| A blocking `/analyze` is cut | `504` | The interpretation takes a minute or two | Wait for `constellation.complete`, or give the call a long timeout | https://devlab.neurologyca.com/docs/guides/timeouts.md |
| The person sees an empty or generic interpretation | `200`, `metadata.status: "failed"` | A placeholder built when the interpretation failed | Never show it; show the indicators | https://devlab.neurologyca.com/docs/concepts/results.md |
| The interpretation does not fit the audience | `200`, `audience_applied` | An audience label Engine does not know is accepted without an error | Use only the audiences your kit lists for the context (`KIT.md`, Audiences) | https://devlab.neurologyca.com/docs/concepts/results.md |
