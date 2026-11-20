# Errors and what to do with them

## Contents

- [The rule: branch on the field, never on the text](#the-rule-branch-on-the-field-never-on-the-text)
- [409 and its reason](#409-and-its-reason)
- [400 and its qualityCode](#400-and-its-qualitycode)
- [401, 403, 404, 422 and 429](#401-403-404-422-and-429)
- [Answers that look fine but are not](#answers-that-look-fine-but-are-not)

Every status, field and value below is in the JSON spec (https://devlab.neurologyca.com/openapi/engine-v2.json) or in https://devlab.neurologyca.com/docs/concepts/limits.md. If an answer carries a code that is in neither, log the whole body and ask Neurologyca rather than guessing what it means.

## The rule: branch on the field, never on the text

When a `400`, `403`, `409` or `422` carries `reason`, or a `400` carries `qualityCode`, your code branches on that field. `message` and `hint` are written for people and can change.

## 409 and its reason

A `409` is a conflict with the state of the position, the session, the enrolment or the protocol. The reasons the SDK knows, which are the ones a capture can meet: `SESSION_ABANDONED`, `POSITION_ALREADY_COMPLETED`, `MECHANIC_EXPIRED`, `MECHANIC_NOT_YET_AVAILABLE`, `MUST_START_AT_FIRST_POSITION`, `PROTOCOL_DEPRECATED`, `POSITION_RESERVED`, `CAPTURE_DISCARDED`, `CAPTURE_OUT_OF_ORDER`, `PROTOCOL_NOT_ANALYSED`, `CAPTURE_CANCELLED`.

- `SESSION_ABANDONED`: no batch for too long, or a late batch of an attempt you already replaced (a restart batch with a new `captureId` closes the open attempt). Start the position again from `step` 1 and `kpnfile.order` 1.
- `POSITION_ALREADY_COMPLETED`: the position already has a completed capture. Do not capture it again: continue with `nextPosition` when the protocol has more positions; if what failed was the interpretation, call `/analyze` again. Enrol again only to measure this position again.
- `MECHANIC_NOT_YET_AVAILABLE`: the position is not open yet; retry at `earliestAt`.
- `MECHANIC_EXPIRED` and `MUST_START_AT_FIRST_POSITION`: continue with the position the answer names (`goTo`).
- `PROTOCOL_DEPRECATED`: enrol in the protocol named in `publishedProtocolPid` (`null` if there is none). On a batch it is always `null`: look the replacement up in `GET /catalog/protocols` (operationId `ListCatalogProtocols`). A capture already in progress may finish.
- `PROTOCOL_NOT_ANALYSED`: `/analyze` on a protocol that is not interpreted, such as Measurement. Read its indicators with `/results`.
- `POSITION_RESERVED`: another attempt holds the position (`holder` says which). Ask the person; only if they confirm, repeat the context call with `discardPending: true`.
- `CAPTURE_DISCARDED`, `CAPTURE_OUT_OF_ORDER` and `CAPTURE_CANCELLED`: do not retry; the answer will not change.

Engine has a few more reasons, for retired mechanics and enrolments and for recordings sent later; the full table, with what to do for each one, is in https://devlab.neurologyca.com/docs/concepts/limits.md. A `409` from `POST /users` (operationId `CreateUser`) carries no `reason`: that `externalId` already exists, so reuse the person.

## 400 and its qualityCode

A `400` from a batch can carry `qualityCode`:

- `KPN-EMO-MISSING-PACKETS`: the `Final` arrived but earlier batches of its step did not, and it stored nothing. Resend the batches in `missingOrders`, then the `Final` again. It is fixed by sending again what is missing.
- `KPN-EMO-STEP`: that `step` is not in the plan of the mechanic. Fix the `step`.
- `KPN-EMO-FRAME-MALFORMED` (also on the baseline; Engine is rolling out this check): a frame does not have 478 landmarks of 3 coordinates and 52 blendshapes, and is not a frame with no face (both empty). The whole batch was rejected and nothing stored; on a capture batch, `firstMalformedFrame` and `malformedFrames` say which frames (the baseline's `400` documents only the `qualityCode`). Fix them and send the batch again ([frames.md](frames.md)).
- `KPN-EMO-MEDIA`: the batch `mediaId` is not a uuid, is a numeric catalogue id, or does not exist. Send the `pid` of `steps[].media[]` from the script. Engine does not return this for a real media of another step, nor for a missing `mediaId`: the interpretation just lacks the question (`metadata.missing_inputs` includes `question_text`).
- The others (`KPN-EMO-STEP-TYPE`, `KPN-EMO-NO-PLAN`, `KPN-EMO-MECHANIC`, and `KPN-EMO-INTERRUPTION-CLOSED` for microinterventions) do not change by retrying: log them and tell Neurologyca if they persist.

A `400` with a JSON body (`code` and `message`, for example `Field 'x' has an invalid value or type.`) and no `qualityCode` is a body Engine could not read, and nothing was processed: fix the JSON or the type of that field. A `400` from `POST /users/block` (operationId `BlockUsers`) or `POST /users/unblock` (operationId `UnblockUsers`) in the test environment's Engine: no filter in the query (and no `all=true`), or a body; put the filters in the query. A `400` from `POST /user-protocols` (operationId `CreateUserProtocol`) with `reason: CONTEXT_REQUIRED` (the protocol is in more than one of your contexts and no `contextPid` was sent) or `CONTEXT_NOT_VALID` (that `contextPid` is not one of your contexts with this protocol): send the right `pid` from `GET /catalog/contexts` (operationId `ListCatalogContexts`). A `400` from other routes names the missing or invalid field in its message (for example `name` or `externalId` on `POST /users` (operationId `CreateUser`), or a `confirm` that does not match on `DELETE /users/{external_id}` (operationId `DeleteUser`)).

## 401, 403, 404, 422 and 429

- `401` on `POST /token` (operationId `GetToken`): the key is malformed, unknown, revoked or expired, or your organization is suspended (the same answer in every case). Reveal it again in Your account and API key (Engine keys › Reveal; it is not in the kit); never retry in a loop.
- `401` on any other route: the token is missing, expired or invalid, or its key was rotated, revoked or expired. Mint a new token and retry that call once (https://devlab.neurologyca.com/docs/start/authentication.md).
- `403` with `reason: USER_BLOCKED`: the person is blocked. Nothing can be done for them until they are unblocked, not even the next batch of a capture in progress.
- `403` with `reason: CAPTURE_TOKEN_SCOPE`: a capture token used outside its capture. Use your regular token there.
- `403` without `reason` on an enrolment or a deletion: that person was created by another key and yours does not have scope `admin`.
- `404`: an id that does not exist or is not yours. From `/analyze`, it can also mean that the position has no completed capture yet; from `/results`, that the results are not there yet.
- `422` from `/analyze`: the interpretation was refused. Either the context you set is not one of your kit (Engine accepted it with warnings and only the interpretation checks it), or, if every interpretation answers `422`, your organization is not active yet in the interpretation service. The body carries only `code` and a generic `message`, so it does not say which: compare the context id with your kit first. Do not recapture: the indicators are stored. Tell Neurologyca, then ask again on the same pair.
- `422` from the context route: not returned today (the same case answers `201` with `taxonomyWarnings`), but code for it now.
- `429` on `POST /token` (operationId `GetToken`): too many token requests from your IP. Cache the token. If a `429` carries `Retry-After`, wait that long before trying once more.
- `429` with `reason: CAPTURE_TOKEN_RATE_LIMIT`: only with a capture token, more requests in a minute for that capture than its limit (15 for the script and the context together, 30 for batches, 60 for the rest). Nothing was processed: wait the seconds in `Retry-After` and repeat the same request. A new capture token for the same `captureId` keeps the count.

## Answers that look fine but are not

| You see | What it means |
| --- | --- |
| `202` for every batch, and no `constellation.complete` | `triggerAnalysis` was left out on the last `Final` |
| `202` from `/analyze` with `reason: ANALYSIS_IN_PROGRESS` | Engine is still analysing that session and did not start a second one: wait for `constellation.complete`, or call again after `retryAfterSeconds` (`Retry-After`). Not an error, and not "no interpretation" |
| `202` with `framesWithoutFeaturesMeta` above 0 | Those frames give no valence or arousal axes |
| `201` from the context route with `taxonomyWarnings` | An id Engine does not recognise today; it warns, it does not reject |
| `200` from `/results` with empty `rawResults` | Too early: poll again |
| `200` from `/analyze` with `metadata.status: "failed"` | A placeholder: never show it |
| `200` from `/analyze` with `from_cache: true` | The stored interpretation, not a new one |
| `201` from the enrolment with `baselineWarning` | The person has no valid baseline (https://devlab.neurologyca.com/docs/concepts/baseline.md) |
