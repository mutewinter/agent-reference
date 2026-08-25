# Two config scopes with a leak guardrail; no links kind

## Context

References split naturally by shareability: anything fetchable (git repositories, package pins) is safe to share with a team, while machine paths and private references are not, and can leak sensitive information if committed. Separately, a `links` kind for URLs was considered for online references that get re-shared across sessions (issues, changelogs, API docs).

## Decision

Two files, same format: `agent-reference.json` is committed and holds the shareable; `agent-reference.local.json` is gitignored, holds machine paths and private references, and overrides same-named entries. Both files are optional.

The guardrail keys on what a value means, not on which key holds it: no kind is banned from the committed file, because a repo-relative folder means the same thing on every checkout and belongs there. `validate` errors on an absolute or `~/` path anywhere one can hide, which is a `folders` path, a `file:` repository under `git`, and `cacheDir`, and warns on `../` escapes. It also errors when `agent-reference.local.json` is tracked by git, asked of the index rather than of `check-ignore`, which excludes tracked files and so reports a committed config as merely unignored. `status` repeats the path checks as warnings, since they are string work over a config it has already loaded, and an agent runs `status` far more often than it runs `validate`.

No `links` kind: folders are the universal container. An agent gathers online material into a folder and declares that folder as a reference with a description. Per-reference and per-group descriptions are also the carrier for user policy (for example "never name this folder in committed code"), which ships as data, never as product behavior.

## Consequences

- The schema stays at three kinds: packages, folders, git.
- A user-global scope (one config for every project on a machine) remains open; the layering supports it later without new concepts, following the `~/.npmrc` precedent.
- CI can run `validate` to make personal-path leaks structurally impossible.
- The same leak is an error in `validate` and a warning in `status`, deliberately: it fails a build, but it blocks no reference, so status must not tell an agent to stop.
