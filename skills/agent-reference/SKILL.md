---
name: agent-reference
description: Locate and use local package, git, and folder references materialized by the agent-reference CLI. Use when a repo has agent-reference.json, agent-reference.local.json, or a .agent-reference.json manifest, or when the user asks to inspect cloned dependency source or configured agent references.
---

# agent-reference

Use this skill to inspect configured local reference source instead of guessing paths from config files or `node_modules`.

First run this from the project root:

```sh
agent-reference status
```

Read the table before navigating the filesystem.

Rules:

- Use the `path` column as the source location only when it is an absolute path and the status is `ready`.
- Treat `package` references as exact to `currentVersion`.
- If a package or git reference is `missing`, `stale`, or `missing-worktree`, run `agent-reference clone --non-interactive`, then run `agent-reference status` again.
- If a package reference is `not-installed`, the configured `"installed"` package no longer exists in the active lockfile. Do not use an old clone as current source.
- If a folder reference is `missing`, it cannot be cloned. The user or repo config needs to create or correct that path.
- Prefer status output over the `.agent-reference.json` manifest at the project root; the manifest is generated state from the last clone run.
- Use `agent-reference status --json` only when a script or tool needs structured output. The equivalent source field is `references[].path`.

Status output includes configured references, current lockfile versions, cloned versions, statuses, and absolute paths for references that are ready.
