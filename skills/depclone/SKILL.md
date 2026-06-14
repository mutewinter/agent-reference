---
name: depclone
description: Locate and use exact-version dependency source worktrees created by the depclone CLI.
compatibility: Requires the depclone CLI in the project or PATH. Requires shell access for status and clone commands.
allowed-tools: Bash(depclone:*) Read
metadata:
  status-command: depclone status --json
---

# DepClone

Use this skill when you need to inspect dependency implementation source for a JavaScript or TypeScript project.

First run this command from the project root:

```sh
depclone status --json
```

Use the JSON response as the source of truth:

1. For entries with `status: "ready"`, use `worktreePath` for source inspection.
2. For `missing`, `stale`, or `missing-worktree`, run:

```sh
depclone clone --non-interactive
```

Then run `depclone status --json` again.

3. For `not-installed`, a configured lockfile reference is not in the current project. Do not inspect an old clone as if it matched the project.
4. For `unconfigured`, only inspect the dependency if the task directly requires it.

Prefer the reported `worktreePath` over `node_modules`. The status output includes the exact current lockfile version, cloned version, checkout SHA, and local path.
