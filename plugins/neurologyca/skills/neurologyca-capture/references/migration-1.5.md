# Coming from Engine 1.5

Do not use anything from Engine 1.5 or from the SDK before it replaced the `<neuro-capture>` element: `createNeuroClient`, the `<neuro-capture>` element, `siteKeyTokenProvider`, the `/session` routes. They do not exist in Engine 2.

In Engine 2 your backend enrols the person and the page captures one position at a time, identified by `userProtocolId` and `protocolMechanicId` (see the minimal path in [SKILL.md](../SKILL.md)).

The mapping, name by name: https://devlab.neurologyca.com/docs/resources/migration.md.
