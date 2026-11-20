# What is safe to send again

Network calls fail halfway. This is what happens when you repeat each call of the cycle, checked against the spec and https://devlab.neurologyca.com/docs/concepts/limits.md.

## The person: a repeated externalId

`POST /users` (operationId `CreateUser`) with an `externalId` that already exists in your organization answers `409`, with no `reason`. Treat it as success and reuse the person: that is what the playground's backend does before it enrols them. Never create a second identity for the same real person: the baseline and the results hang from the `externalId`.

## The enrolment: not idempotent

`POST /user-protocols` (operationId `CreateUserProtocol`) assigns the protocol again every time you call it: the same protocol can be assigned to the same person more than once, and each call returns a new `userProtocolId`. Save the one you got and reuse it; if you are not sure the first call went through, list the person's enrolments (`GET /users/{app_user}/user-protocols` (operationId `ListUserProtocols`)) before you enrol again.

## The context: safe to repeat

`POST /user-protocols/{userProtocolId}/{protocolMechanicId}/context` (operationId `SetContext`) can be called again while the position is in progress: fields you leave out keep their previous value. Once the position has a completed capture it answers `409` with `POSITION_ALREADY_COMPLETED`.

## The batches: resend what is missing

- A batch sent twice with the same `kpnfile.order` answers `202`, and Engine keeps the first copy. Resending the same content is harmless; resending different content changes nothing.
- When the `Final` answers `400` with `KPN-EMO-MISSING-PACKETS`, it stored nothing: resend the batches listed in `missingOrders`, then send the `Final` again.
- After `409` with `SESSION_ABANDONED`, what was sent is discarded: start the position again from `step` 1 and `kpnfile.order` 1.
- After `409` with `POSITION_ALREADY_COMPLETED`, stop sending: the capture is stored. Continue with `nextPosition` if the protocol has more positions.

## The interpretation: cached

`POST /analyze` (operationId `Analyze`) on a position that is already interpreted answers `200` with `from_cache: true`: the stored interpretation, served without computing it again. Each audience is generated once and then cached; asking for one audience never overwrites another. A call with `step` is never cached: each one computes again, so do not repeat it. Do not call it in a loop to wait for it: wait for `constellation.complete` or give one blocking call a long timeout.

## Reading results: always safe

`GET /results/{userProtocolId}/{protocolMechanicId}` (operationId `getResultsByPosition`) only reads. Poll it as often as you need, a few seconds apart.

## Cleaning up test people

Delete a test person with `DELETE /users/{external_id}` (operationId `DeleteUser`). It is irreversible and all or nothing: the person goes together with their captures, sessions, enrolments, baseline and consents, and the answer says how many records of each kind were deleted. The body must carry `confirm` with the same `externalId` as the path. A key with scope `read_all` can only delete the people it created; a key with scope `admin`, anyone in its organization.

Use a recognisable prefix for the `externalId` of your test people, so you never delete a real person by mistake.
