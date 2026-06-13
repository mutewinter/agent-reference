---
name: depclone
description: Use local exact-version dependency source worktrees created by the depclone CLI.
---

# DepClone

Use this skill when you need to inspect dependency implementation source for a JavaScript or TypeScript project.

1. Check for `.depclone/manifest.json` in the project root.
2. If it exists, read it and use each dependency's `worktreePath` for source inspection.
3. If it does not exist, check for `depclone.config.json` and run `depclone clone --non-interactive` to restore the configured references.
4. If there is no config, run `depclone list` to see exact installed direct dependencies.
5. Ask for or choose relevant dependencies, then run `depclone clone --package <name>`.
5. Prefer `.depclone/dependencies/<package>/<version>` worktrees over `node_modules` for deeper source reading.

The manifest records package names, versions, repository URLs, checkout commits, and worktree paths.
