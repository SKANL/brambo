---
title: Your first brambo session
sidebar_position: 1
audience: Developers and maintainers
prerequisites: Node.js >=20
outcome: Install the SDK, run a prompt, and interpret the result
scope: First session using the published SDK
compatibility: Published packages support Node.js >=20
translationStatus: original
---
# Your first brambo session

Use `@brambodev/session` when your host needs a typed result without owning CLI argument parsing, exit codes, and lifecycle cleanup. This path requires Node.js 20 or newer and a separately installed, authenticated executor such as Claude Code, Codex, or OpenCode.

## Quick path

1. Install the SDK:

   ```bash
   npm install @brambodev/session
   ```

2. Create `session.mjs`:

   ```js
   import { runSession } from '@brambodev/session'

   const result = await runSession({ prompt: 'List the files in this workspace' })
   console.log(result.status, result.summary)
   ```

3. Run it from the workspace you want brambo to use:

   ```bash
   node session.mjs
   ```

The returned value is a `ResultEnvelope`. A failed or cancelled result carries a non-empty `errors` array; environment failures throw a coded error.

Confirm the installed release with `npm ls @brambodev/session` or inspect `node_modules/@brambodev/session/package.json`. The vendor executor is a separate prerequisite; brambo does not install or authenticate it for you.

## Use the configuration documents

`runSession` does not read files for you. Read the layers once and pass the snapshot into the run:

```js
import { readExecutorConfigLayers, runSession } from '@brambodev/session'

const configLayers = await readExecutorConfigLayers({ projectDir: process.cwd() })
const result = await runSession({ prompt: 'List the files in this workspace', configLayers })
console.log(result)
```

Layers resolve in this order: defaults, global, project, agent, then invocation. The selected workspace root comes from the invocation `cwd`, or from `workspace.rootDir` when `cwd` is omitted.

For configuration keys, file locations, and defaults, continue to [Configuration](../guides/configuration). For executor and workspace selection, see [Executors and workspaces](../guides/executors-and-workspaces).

## What happens to the workspace

The default session provider creates `.brambo/workspaces/<uuid>` below the selected root. `release()` ends a lease; it does not delete the workspace. Use the explicit workspace-removal helpers when deletion is intended.

## Next step

If you need to replace the executor or workspace implementation, read [Create an adapter](../how-to/create-adapter).
