# The store

One machine-wide store holds everything heavy, shared across projects and worktrees. The
default root is `~/.agent-reference`, movable with `$AGENT_REFERENCE_STORE_DIR` or the
`cacheDir` config key.

## Zones

- `git/<host>/<owner>/<repo>.git`: bare mirrors, fetched with `--filter=blob:none`. A
  mirror is the raw repository, every version at once. History-wide questions (`git log`,
  `blame`, `show <tag>:<file>`, diffs between releases) run here with plain git and no
  checkout.
- `src/<host>/<owner>/<repo>/<commit>`: read-only worktrees attached to the mirror, one
  per commit. Two projects on the same version share one directory; two agents holding
  different versions of the same repository get different directories, so there is no
  shared `HEAD` to fight over. Worktrees share the mirror's objects, so a new version
  costs one file tree, not one clone.
- `state/<project>.json`: per-project materialization state, keyed by a hash of the
  project root. Records which commit each reference resolved to and which resolutions
  failed, so `status` can report without network access. A cache, never committed.

Every zone is delete-safe: the next `get` rebuilds exactly what it needs, mirror first,
network last.

## Keying and pruning

Checkouts are keyed by commit rather than version because a tag can move or be deleted
while a commit cannot, and because a path printed into a transcript should still mean the
same thing later. The cost is accumulation: old versions stay behind after upgrades.
`store` reports what has accumulated (the only command that walks the store for sizes),
and `store --prune` drops checkouts unused past an age threshold, then any mirror left
with no checkouts.

## Read-only by contract

Nothing under `src/` is ever edited: a checkout is a shared snapshot, and mutating one
would corrupt every other project's view of that commit. Work that needs a mutable copy
(patching a dependency, preparing an upstream pull request) happens in a working copy
created outside the store, which the local mirror makes cheap to seed.
