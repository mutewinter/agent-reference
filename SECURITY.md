# Security

## Reporting a vulnerability

Report privately through GitHub, on the [Security tab of this repository](https://github.com/mutewinter/agent-reference/security/advisories/new). That opens a draft advisory only the maintainers can see. Please do not open a public issue for a vulnerability.

Say what you can reach and how, and include the config or command that reproduces it. A first reply should take a few days.

Only the latest published version is supported. There are no maintained release branches, so a fix ships as a new release rather than as a backport.

## What this tool trusts

`agent-reference` turns names into readable source on disk. It runs `git` and reads the npm registry, and it does so with values it did not write: a repository URL out of registry metadata, a `directory` out of a package's manifest, a ref out of a config file someone else committed. Those are the interesting inputs, and the ones a report is most likely to be about.

The boundaries it holds, each enforced in [`src/git.ts`](src/git.ts):

- **Every git invocation is built from one argv.** `gitArgv` applies the transport policy, so no caller can spawn `git` around it.
- **`ext::` transports are refused outright**, and `file` transports stay at git's `user` default. `ext::` runs an arbitrary command as a transport, and CI images do relax git's defaults, so this is stated rather than inherited.
- **No value reaching argv may begin with `-`.** git reads such an argument as an option wherever it sits, and `--upload-pack=<cmd>` turns a fetch into code execution that no protocol policy stops.
- **A repository URL must use https, http, ssh, git, or a local path.** Anything else is refused before a store path is derived from it.
- **git never waits for a human.** `GIT_TERMINAL_PROMPT=0`, so a private or missing repository fails rather than sitting in a credential prompt.
- **A `directory` cannot climb out of its checkout.** Both the configured subtree and the one a package's own manifest declares are normalized and then checked for containment against the resolved path.
- **Relayed text is stripped of control characters.** Registry errors, git's stderr, and config descriptions all reach a terminal and an agent's context, where control bytes reposition a cursor and can shape text like instructions.
- **`init` interpolates nothing it read.** The brief it prints is a prompt handed to an agent, so only values `init` computed itself go into it; a checked-in file cannot write instructions to a future agent in this tool's voice.

Materialized source is not sandboxed. A checkout is upstream's files on your disk, and reading them is the point; nothing here executes them, and neither should anything downstream without deciding to.

Credentials are the ambient ones. `agent-reference` clones with your own git configuration and never stores, prompts for, or transmits a credential.

## Out of scope

- A reference resolving to source you did not expect, when the config declares it. `agent-reference validate` and the confidence a checkout reports are the tools for that.
- Anything requiring an attacker who can already write to your `agent-reference.json`, your lockfile, or your store directory.
- Denial of service from a deliberately enormous repository. Clones are `--filter=blob:none`, but a checkout is still as large as upstream made it.
