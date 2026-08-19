# Materialization state lives in the store, not the project

## Context

The tool used to write a committed `agent-reference.lock.json` recording each reference's
resolved repository and commit. Committed, it churned in every dependency-bump PR, added a
family of drift states (stale lock, lock disagreeing with config) that `status` had to
narrate and agents had to be taught about, and made the project carry two generated files.

## Decision

Resolution and checkout state is a machine-local cache at `<store>/state/<project>.json`,
keyed by project root. The project commits exactly one file, `agent-reference.json`. Pins
in the config remain the mechanism for cross-machine agreement where it matters.

## Consequences

- Dependency bumps commit nothing; the next `get` re-resolves from the new lockfile.
- `verified` resolutions re-derive identically on any machine from the same inputs.
  `unverified` and `fallback` results could differ across machines, and those are exactly
  the cases the tool already tells agents to pin.
- Failure memory (which references are unresolvable, under which overrides) is
  per-machine; a fresh machine may retry one doomed materialization once.
- There is no reviewable team record of resolved commits. If that ever matters more than
  bump-time churn, this decision is the one to supersede.
