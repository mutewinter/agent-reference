# Two config scopes with a leak guardrail; no links kind

## Context

References split naturally by shareability: anything fetchable (git repositories, package
pins) is safe to share with a team, while machine paths and private references are not,
and can leak sensitive information if committed. Separately, a `links` kind for URLs was
considered for online references that get re-shared across sessions (issues, changelogs,
API docs).

## Decision

Two files, same format: `agent-reference.json` is committed and holds the shareable;
`agent-reference.local.json` is gitignored, holds machine paths and private references,
and overrides same-named entries. `validate` errors on absolute or `~/` folder paths in
the committed file and warns on `../` escapes, so the delineation is mechanical rather
than a convention to remember. Both files are optional.

No `links` kind: folders are the universal container. An agent gathers online material
into a folder and declares that folder as a reference with a description. Per-reference
and per-group descriptions are also the carrier for user policy (for example "never name
this folder in committed code"), which ships as data, never as product behavior.

## Consequences

- The schema stays at three kinds: packages, folders, git.
- A user-global scope (one config for every project on a machine) remains open; the
  layering supports it later without new concepts, following the `~/.npmrc` precedent.
- CI can run `validate` to make personal-path leaks structurally impossible.
