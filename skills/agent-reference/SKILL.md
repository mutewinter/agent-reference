---
name: agent-reference
description: Read a dependency's real upstream source, tests, examples, git history, or CI config, and read local folder and git references declared for agents. Use whenever a task needs to look inside a library rather than just call it - "how does X actually implement this", "how do the maintainers test X", "why does X behave this way", "read the source of X" - and whenever a repo has agent-reference.json, agent-reference.local.json, or agent-reference.lock.json. Also use to add, pin, describe, or group a reference in agent-reference.json.
---

# agent-reference

Use this skill to inspect configured local reference source instead of guessing paths from config files or `node_modules`.

## When to use this instead of node_modules

`node_modules` holds only what a package chose to publish, which is usually build output.
`agent-reference` checks out the package's **repository** at the exact published commit, so
it is the only way to read:

- tests, so you can see what maintainers actually guarantee
- examples, benchmarks, CI workflows, and contributor docs
- git history and blame, to answer "why is it written this way"
- source for any package that ships only `dist/`
- files stripped by `.npmignore` or a `files` allowlist

Check `agent-reference status` first whenever a task calls for any of those. If a package
happens to ship its full source and you only need the implementation, reading
`node_modules` is fine. Folder and git references are never in `node_modules` at all.

## Reading references

First run this from the project root:

```sh
agent-reference status
```

Read the table before navigating the filesystem.

**Read the `problems:` and `next steps:` sections before doing anything else.** They state
what is wrong and exactly how to fix it. `next steps` is ordered; run it top to bottom, and
run those commands before concluding anything about a reference's state.

**Never delete a reference from `agent-reference.json` to make `status` clean.** Every
reference was declared deliberately, and removing one silently drops that source for the
whole team. Fix the reference, or tell the user you could not and why. The only time a
reference should be removed is when the user asks for it.

Rules:

- Use the `path` column as the source location only when it is an absolute path and the status is `ready`.
- For a package published from a monorepo, `path` is the package's own directory inside the checkout. The whole repository is at `references[].repositoryPath` in `--json` output.
- Treat `package` references as exact to `currentVersion`.
- If a package or git reference is `missing`, `stale`, or `missing-worktree`, run `agent-reference clone`, then run `agent-reference status` again.
- If a package reference is `unresolvable`, cloning already failed for it. **Do not run clone again**; it will fail the same way. Follow the matching entry under `problems`, which usually means pinning `ref` or `repository` (see "When a reference cannot resolve" below).
- If a package reference is `not-installed`, the configured `"installed"` package no longer exists in the active lockfile. Do not use an old clone as current source.
- If a folder reference is `missing`, it cannot be cloned. The user or repo config needs to create or correct that path.
- Prefer status output over `agent-reference.lock.json`; the lockfile records resolved commits, not local paths.
- Use `agent-reference status --json` only when a script or tool needs structured output. The equivalent source field is `references[].path`, and problems are in `problems[]` with `severity`, `summary`, `fix`, and a ready-made `configPatch`.

Status output includes configured references, current lockfile versions, cloned versions, statuses, group membership, descriptions, and absolute paths for references that are ready.

### Groups

References can be grouped under a shorthand name, so the user can say "read the documentation references" instead of naming five folders. The `groups:` section of `agent-reference status` lists every group and its members.

```sh
agent-reference status --group documentation
agent-reference clone --group documentation
```

A bare name narrows to one reference: `agent-reference status zod`, `agent-reference clone zod`. Use `kind:name` (`folder:api-docs`) when the same name is used by more than one kind.

### Checkout confidence

`--json` reports `references[].confidence` for packages:

- `pinned` — a human or agent chose the ref by hand in the config. Treat it as intentional and leave it alone.
- `verified` — the package.json at the checked-out commit reported exactly this name and version. Trust it.
- `unverified` — the commit looked right but no package.json confirmed it. Spot-check before relying on it.
- `fallback` — no matching commit was found and the repository default branch was checked out. This is **not** the published version; say so rather than treating the source as authoritative, and pin the right ref.

### When a reference cannot resolve

Some repositories tag releases in ways no tool can guess, and some packages have no
repository in their registry metadata at all. When `status` reports `unresolvable`, or a
`fallback` confidence, use your judgment to find the right commit and pin it. This is the
supported escape hatch, not a workaround.

1. Read the `fix` line for that reference. It names the exact config key to set and, when a
   repository is already on disk, gives the `git` command to list candidate tags.
2. Find the commit. The bare repository is in the store, so you can inspect it directly:

   ```sh
   git -C <bare-repo-from-fix> tag --list '*1.2.3*'
   git -C <bare-repo-from-fix> show <tag>:package.json
   ```

   Check that `version` in that `package.json` matches the version you want.
3. Pin it in `agent-reference.json`:

   ```json
   {
     "packages": {
       "odd-tags": {
         "version": "1.2.3",
         "ref": "release-1.2.3",
         "description": "Pinned by hand: tags do not follow any known pattern"
       }
     }
   }
   ```

4. Run `agent-reference clone`, then `agent-reference status` again. The
   reference should read `ready` with `pinned` confidence.

Other keys for the same situation:

- `repository` — when registry metadata has no repository, or points at the wrong one. Accepts `github:owner/repo`, a git URL, or `file:../repo`.
- `directory` — when the package lives in a monorepo subdirectory that was not detected.
- Setting both `repository` and `ref` skips the registry entirely, which is how unpublished and private packages work.

Always write a `description` when you pin something by hand, saying why. A later agent has
no other way to know the pin was deliberate.

## Editing the config

Write `agent-reference.json` directly as JSON. There are no CLI commands for adding or removing individual references.

- `agent-reference schema` prints the full JSON Schema for the file.
- `agent-reference validate` checks the file and reports located errors and warnings. Run it after every edit.

Every reference is either a shorthand string or an object that adds `description` and `groups`:

```json
{
  "packages": {
    "react": "installed",
    "zod": {
      "version": "3.25.0",
      "description": "Schema shapes we mirror in our own validators",
      "groups": ["validation"]
    }
  },
  "folders": {
    "design-notes": "./references/design-notes",
    "api-docs": {
      "path": "../platform/docs",
      "description": "Source of truth for endpoint contracts",
      "groups": ["documentation"]
    }
  },
  "git": {
    "typescript": "github:microsoft/TypeScript#main",
    "design-system": {
      "repository": "github:acme/design-system",
      "ref": "v4",
      "groups": ["documentation"]
    }
  },
  "groups": {
    "documentation": {
      "description": "Read all of these before writing docs",
      "references": ["design-notes", "git:design-system"]
    }
  }
}
```

Editing rules:

- `packages` values are `"installed"` (follow the lockfile) or an exact version, semver range, or dist-tag.
- `description` is free-form, and matters most for references the user declared by hand. It is what tells a later agent *why* the reference is here, so write one whenever the user explains a reference.
- Group membership can be declared either with `groups` on a reference or with `references` on the group. Both are unioned, so pick whichever is the smaller edit.
- A group whose value is a plain string is a description with no members yet.
- Put machine-specific paths in `agent-reference.local.json` (same format, not committed). Entries there override same-named entries in `agent-reference.json`.
- Unknown keys are rejected with a suggestion. If `validate` reports one, fix the key rather than dropping the field.
- After changing `packages` or `git`, run `agent-reference clone` so the lockfile and checkouts catch up.
