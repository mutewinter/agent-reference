# A run is attributed only when it says so

## Context

The first version of the usage log recorded that a run happened, what it was for, and whether it threw. Reading a few days of it showed what was missing, and most of it was data the CLI already held at the moment it wrote the line and dropped on the floor: which flags were typed, whether anyone was watching, how sure the checkout was of its version, and whether a run that succeeded had handed back something the caller would misread.

One thing was missing for a different reason. The question the log exists to answer is "is my agent using this", and the log could not tell an agent's run from a person's, let alone say which agent. That question has an obvious wrong answer available: walk up the process tree until something recognizable appears.

## Decision

A line gains six things, all of them already in hand when it is written: `flags` (names as typed, values dropped), `tty`, `cli`, `warnings`, `agent`, and a `confidence` on each materialized reference. `ok` now reflects the exit code as well as a thrown failure, because `validate` prints its findings and sets 1 without throwing, and was recorded as a clean run.

Attribution is a table of exact environment variable names a harness sets on its own process, mapping to a short label. Only whether a name is set is read. The value is never recorded, the environment at large is never surveyed, and the process tree above this one is never inspected. A caller that matches no row is recorded as no caller.

## Consequences

- `activity` can separate a person at a terminal from a harness, which is the whole question. A run reads as the harness that named itself, `terminal` when stdout was a terminal, and `unattributed` otherwise.
- Adding a harness is one row, and until that row exists its runs read as unattributed rather than as something else. A wrong label is worse than no label: it would be counted, believed, and never questioned.
- The environment is where credentials live, which is the reason the value is never read and the reason no pattern ever decides which variables to look at. A fixed list of names is auditable by reading it.
- The process tree was the alternative with the best coverage: it needs no cooperation from the harness. It also costs a spawn on every run, differs per platform, and means reading the names of processes that are not ours to inspect. Coverage is not worth any of that here.
- Fields are additive and the schema version is unchanged, so lines written before this keep counting. They read as unattributed, with no flags and an unknown CLI version, which is exactly what was true of them.
- A line grows from roughly 200 bytes to roughly 300, so a rotation generation holds around 7,000 runs instead of 10,000.
