# Commit history needs no affordance; the checkout is already a worktree

## Context

A reference is materialized so it can be read, and the most valuable thing in an upstream
repository is often not the file an agent opened but the commit that changed it: what a
library used to do, why the maintainers stopped doing it, which release the change shipped
in. None of that is in the working tree. The question was whether reading it needs a verb,
a flag, or a line of printed output pointing at it.

Mechanically it needs none of them. `get` returns the path to a `git worktree add --detach`
against the store's bare mirror, so the path an agent already holds is a git repository with
the full commit graph and every ref attached. `log`, `show <tag>:<file>`, `blame`, `diff`
between releases, `log -S`, `tag --contains` all run there with no further help. The
worktree shares the mirror's object store, so nothing the mirror can answer is unavailable
from the checkout; the mirror's real remaining job is the failure path, where a resolution
never produced a checkout and the fix text has to name somewhere to list tags.

The documentation had this backwards. Three places sent history questions to the mirror,
under a path an agent on the success path has never been told, while none of them said that
the path `get` prints is itself a worktree.

Whether an agent finds this unaided is not a question the source can answer, so it was run
as an eval. `evals/history` puts a library's history where the answer to a live bug lives:
the tree at HEAD states the current rule and the release it shipped in, and the account of
what the library used to do and why it changed exists only in one commit message, whose diff
deleted the old code path. The prompt asks for the maintainers' reasoning and names no
mechanism: not git, not history, not commits.

Both models run reached for git in the checkout unprompted, within a few commands of the
`get` that produced it, and neither consulted `guide` first. The reasoning came back quoted
from the commit rather than reconstructed. The capability was already discoverable; what was
missing was only that the docs described it in the wrong place.

## Decision

No `history` verb, no flag, no extra line in `get` output, and no new line in the skill stub.
An agent holding a path with a `.git` in it already knows what to do with it, and the eval
says so rather than the design merely hoping so.

What changes is where the docs point. The README, the store architecture note, and the
served guide now say that each checkout is a worktree on the mirror and that history
questions run at the path `get` printed. The guide also states the one thing the shape does
not make obvious: mirrors are cloned with `--filter=blob:none`, so commit metadata and
`--name-only` are local and free, while `-p`, `--stat`, `blame`, and `-S` fetch file contents
the first time they need them, and fail rather than degrade when the remote is unreachable.

## Consequences

- The mirror keeps one documented role, the failure path, where `problems.ts` already names
  it. Nothing routine sends an agent to a second path.
- The blob filter is now a stated property rather than a surprise. An agent working offline
  against a fresh checkout can still read the log; a `blame` in the same session cannot.
- `evals/history` becomes the regression signal for `get` output. The affordance rests
  entirely on an agent recognizing a checkout as a repository, so a future change to what
  `get` prints, or to the skill, is measurable rather than arguable.
- A `folders` reference is a plain directory and has no history unless the user's own path
  happens to be a repository. That asymmetry is inherent to the kind and is not worth a
  warning.
