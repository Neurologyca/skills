# Neurologyca agent skills

Official skills that teach coding agents (Claude Code, Cursor, Codex and others) to integrate [Neurologyca](https://www.neurologyca.com) by following the verified steps of the [DevLab documentation](https://devlab.neurologyca.com/docs/), instead of guessing.

This repository is a read-only mirror of the skills published by [DevLab](https://devlab.neurologyca.com). Every file here is identical to the version DevLab serves.

| Skill | Use it to |
| --- | --- |
| [`neurologyca-capture`](plugins/neurologyca/skills/neurologyca-capture/SKILL.md) | Integrate human-context capture in a web app with [`@neurologyca/capture`](https://www.npmjs.com/package/@neurologyca/capture) and its [`@neurologyca/capture-server`](https://www.npmjs.com/package/@neurologyca/capture-server) backend. |
| [`neurologyca-engine-api`](plugins/neurologyca/skills/neurologyca-engine-api/SKILL.md) | Call the Engine 2 HTTP API directly from a backend in any language. |

## Install

**Any agent** ([skills CLI](https://github.com/vercel-labs/skills)), from DevLab:

```sh
npx skills add https://devlab.neurologyca.com
```

**Claude Code**, as a plugin from this repository:

```text
/plugin marketplace add Neurologyca/skills
/plugin install neurologyca@neurologyca
```

Then ask your agent for the integration. Each skill ships read-only helper scripts (`scripts/doctor.mjs`) that check your project without printing secrets. See [Build with your coding agent](https://devlab.neurologyca.com/docs/start/ai-agents/) for the full guide.

## Requirements

- A [DevLab](https://devlab.neurologyca.com) account. Your API key belongs in your backend, never in the browser.
- Node.js 20 or later for the helper scripts.

## License

The skills are proprietary. You may read them freely, and install and use them with a Neurologyca account, under the [Neurologyca Agent Skills License](https://devlab.neurologyca.com/legal/skills-license/) (also in [LICENSE](LICENSE)).

## Support

This mirror does not accept issues or pull requests. See [how to get help](https://github.com/Neurologyca/.github/blob/main/SUPPORT.md), or report a vulnerability through the [security policy](https://github.com/Neurologyca/.github/blob/main/SECURITY.md).
