# Usage is recorded locally, and stays there

## Context

Nothing in the tool could answer "is this being used, and for what". The store shows what has been fetched, but a checkout is evidence that something was fetched once, not that anything was read since; `status` describes a project, not a habit. Both the user and the tool's own development need the other question answered: which references an agent actually reaches for, how often, and how recently. The same record is the first thing worth reading when a run misbehaved, because it says what was asked for and what came back.

The obvious shape for that is analytics, and analytics normally means a network call. This tool's whole claim is that it fetches nothing until asked, so a background report about how it is being used would contradict the thing it is for.

## Decision

Every run appends one line of JSON to `<store>/log/usage.jsonl`: the time, the command, the project root, the specs asked for, the references materialized, how long it took, and the failure when there was one. `agent-reference activity` counts that file; `--log` prints the runs themselves.

The file never leaves the machine. Nothing sends it, nothing uploads it, and no command offers to. `AGENT_REFERENCE_NO_LOG=1` stops the recording entirely.

Three consequences of that placement, each deliberate:

- It goes in the default store, not the store a project's `cacheDir` names. A record of what this machine did spans projects, so it cannot live inside one project's cache. `AGENT_REFERENCE_STORE_DIR` still moves it, because that variable moves the whole store.
- The append is one write, never a read-modify-write. Past 2 MB the file becomes `usage.1.jsonl` and a new one starts, so the log is bounded without a rewrite on the path every command runs through. The reader takes both generations and skips any line it cannot parse, since concurrent runs append to it.
- `activity` itself is not recorded. Reading a log is not a use of the tool, and a viewer that appends to what it shows makes its own numbers.

## Consequences

- The log holds machine paths, which is why it is in the store and not in a project. It is the same class of file as `state/`: local, delete-safe, never committed.
- Recording is best effort. A failure to write is swallowed, because a record of a run is worth less than the run, and the write happens after the command has already printed its answer.
- The line format carries a `v`, and a reader skips lines carrying anything else. A future shape can be written without migrating what is already there; the old lines simply stop being counted.
- If sharing this ever becomes worth doing, it is an explicit command a person runs against a file they can read first, never a background upload. Nothing here is a step toward one.
