# Activity counts what agents read, off their transcripts

## Context

[The usage log](2026-09-10-usage-is-recorded-locally.md) records every run of the CLI, and a run is the least interesting part of what happens. `get` prints a path and exits; the agent then reads that checkout with its own tools, often dozens of times, and none of that passes through this process. The log says a reference was fetched. It cannot say the reference was used, which is the question `activity` exists to answer.

The harnesses already recorded the answer. Every read, search, and `git log` an agent ran against a checkout is a tool call in a transcript on the same machine, with its result beside it, which [audit](2026-09-10-the-pitch-is-counted-not-claimed.md) already reads for the opposite question: what agents did when they had no source.

## Decision

`activity` opens with what agents read out of references, counted off the Claude Code, Codex, and opencode transcripts on the machine: lines of source read, files opened, files searched, searches, git history calls, and the sessions that did any of it, then the stores those numbers came from. The summary over the usage log follows, unchanged. `--log` and the library's `getActivityReport` do not scan; the CLI's summary asks for it.

What counts, and why:

- **A call counts when it reaches into a reference.** That is a checkout under a store's `src/`, the machine's or a project's `cacheDir`, or a local path the session's project declares. A declared path that contains the project, or that the project contains, is the project reading itself and does not count. A path is a reference only from a project that declares it, so another directory's session reading the same folder is not counted.
- **Reads, searches, listings, and history, nothing else.** A dedicated tool is judged by its name. A shell command is split into the simple commands it runs, and only a verb pointed at a reference counts: `cd <ref> && sed -n 1,80p src/x.ts` is a read of that file; `pnpm run build | tail` in the same directory is not, and neither is a write, a heredoc, or `sed -i`.
- **Size is the result, not the file.** Lines read are the lines each call handed back, so the number is what entered the agent's context, not the size of what it pointed at.
- **One call is counted once.** A resumed session copies earlier events into a new file, and the call id is the key.

## Consequences

- This parses where audit does not. Audit's patterns only need to know a symptom appeared; these numbers need a call's result and its time, so each harness gets a reader. The cost is contained the same way: a transcript is checked on its raw bytes for any root it could reach before anything is decoded, and inside one, only call and result lines are parsed.
- It reads every transcript on the machine on every summary, a few seconds for a few gigabytes, with the same progress line audit draws. Nothing is cached, so nothing can go stale when a config changes what counts as a reference.
- The counts are a floor. A read through a variable more complex than `R=<path>`, a harness with no reader, or a checkout reached by a path spelled some other way reads as nothing.
- It reads private history and only ever reads, the position the usage log and audit already take. What survives the walk is a handful of totals.
