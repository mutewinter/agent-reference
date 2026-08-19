# Materialize lazily, on demand

## Context

The original model was eager: the config declared references, `clone` materialized all of
them, and `status` treated anything unmaterialized as a problem to nag about. A config
with a dozen git references meant minutes of cloning on a new machine, for repositories an
agent might never read. The tool's users and maintainers are agents, which act at the
moment of need, not in advance.

## Decision

Config declares; nothing fetches until asked. `get <spec>` materializes exactly one
reference at the moment an agent needs it, mirror first, network last. A declared but
never-fetched reference reports as `declared`, the normal resting state of a healthy
config, not a problem. `clone` remains as optional bulk prefetch for CI or offline work.

## Consequences

- Setup is instant: install the CLI and the skill, and `get` works with no config at all.
- A committed reference costs a teammate's machine nothing until their agent asks for it,
  which is what makes sharing the config free.
- `status` runs offline and never suggests fetching everything; per-reference actions name
  the `get` command instead.
- The committed lockfile lost its purpose along with the eager model; see
  [state in the store](2026-08-19-state-in-the-store.md).
