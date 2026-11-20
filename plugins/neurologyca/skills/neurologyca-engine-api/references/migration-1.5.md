# Coming from Engine 1.5

Do not use anything from Engine 1.5: the `/session` routes, `sessionId`, the per-user token with `securityKey`, and the kodec 1.x packages. They do not exist in Engine 2.

In Engine 2 your backend mints one token per key, creates the person, enrols them in a protocol and captures one position at a time, identified by `userProtocolId` and `protocolMechanicId` (see [capture-cycle.md](capture-cycle.md)).

The mapping, route by route: https://devlab.neurologyca.com/docs/resources/migration.md.
