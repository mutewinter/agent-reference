# The store

One machine-wide store holds everything heavy, shared across projects and worktrees. The default root is `~/.agent-reference`, movable with `$AGENT_REFERENCE_STORE_DIR` or the `cacheDir` config key.

## Zones

- `git/<host>/<owner>/<repo>.git`: bare mirrors, fetched with `--filter=blob:none`. A mirror is the raw repository, every version at once, and it is what a failure message points at when there is no checkout to work from yet.
- `src/<host>/<owner>/<repo>/<commit>`: worktrees attached to the mirror, one per commit, each directory named for the first twelve characters of its sha. Two projects on the same version share one directory; two agents holding different versions of the same repository get different directories, so there is no shared `HEAD` to fight over. Worktrees share the mirror's objects, so a new version costs one file tree, not one clone, and every history-wide question (`git log`, `blame`, `show <tag>:<file>`, diffs between releases) is answerable from the worktree without naming the mirror at all. The `blob:none` filter shows up here rather than in the commit graph: metadata is local, while `-p`, `--stat`, `blame`, and `-S` fetch file contents the first time they need them.
- `state/<project-slug>-<hash>.json`: per-project materialization state, keyed by a hash of the project root. Records which commit each reference resolved to and which resolutions failed, so `status` can report without network access. A cache, never committed.

Every zone is delete-safe: the next `get` rebuilds exactly what it needs, mirror first, network last.

## Keying and pruning

Checkouts are keyed by commit rather than version because a tag can move or be deleted while a commit cannot, and because a path printed into a transcript should still mean the same thing later. The cost is accumulation: old versions stay behind after upgrades. `store` reports what has accumulated (the only command that walks the store for sizes), and `store --prune` drops checkouts unused past an age threshold, then any mirror left with no checkouts.

## Read-only by contract

Nothing under `src/` is ever edited: a checkout is a shared snapshot, and mutating one would corrupt every other project's view of that commit. Work that needs a mutable copy (patching a dependency, preparing an upstream pull request) happens in a working copy created outside the store, which the local mirror makes cheap to seed.
