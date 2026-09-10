# The pitch is counted, not claimed, off the reader's own transcripts

## Context

Everything this tool argues rests on one assertion: an agent without readable source pays a tax, and nobody notices it. A session that guesses an export, eats the compiler error and fixes it on the second pass looks like a session that worked. The tax is real and it is invisible, which is exactly why asserting it on a page convinces nobody.

The evidence for it was one measurement of one machine on one day, in [positioning](../positioning.md). That is an anecdote, and a reader has no reason to believe their own history looks like the author's. Meanwhile every harness on that reader's machine has been writing the answer down for months, in a transcript store nothing else reads.

The alternative to counting was the usual one: state the claim, put a number from somewhere on a slide, and ask for the install first.

## Decision

`audit` reads the transcript stores the harnesses on this machine already wrote and reports, per store, how many sessions show each of four things: an API guessed and rejected by a compiler or a runtime, a web search or fetch for documentation, a published build opened under `node_modules/` or `dist/`, and a repository cloned into a temp directory. It quotes the most recent line behind each count. Nothing is written, nothing is sent, and it needs no config, no install into a project, and no reference declared, so it answers before there is anything to be convinced of.

The shape of the read is the decision, more than the command is:

- **Bytes, not formats.** Each store gets one alternation of regular expressions, run once over each session as latin-1, and the scan stops as soon as a session has shown all four. Every pattern is fenced to a single event, because each of these formats writes one per line. Parsing three session formats properly would be a schema to maintain, per harness, pointed at files this project does not own and cannot version.
- **Sessions, not events.** A count is how many sessions did a thing at least once, so one bad afternoon of the same error cannot carry the report.
- **A quote under every count.** A number invites an argument and a line the reader recognizes ends one. It is also the only way to see a match that should not have counted.
- **A store is found or it is named.** Every store that was looked for and was not there is reported, so an empty answer can be argued with rather than read as good news. A harness with no entry is counted as nothing, never guessed at.

## Consequences

- Three harnesses are known: Claude Code, Codex, and opencode, the last of which honors `XDG_DATA_HOME`. A fourth is a row in a table, and until that row exists its sessions are invisible rather than miscounted, the same call [attribution](2026-09-10-a-run-is-attributed-only-when-it-says-so.md) makes.
- The counts are a floor. A store that moved, a harness with no row, and a session that paid the tax without saying so in a way a pattern catches all read as nothing.
- False positives exist and are conceded rather than engineered away: nothing here can tell a session that read a bundle from one that wrote a page about reading bundles, and this repository's own history is full of the second kind. Quotes that are markup or regex syntax are passed over in favor of the next match, but the count still stands, and the quote is what lets a reader throw one out.
- It reads private session history, which is why it only ever reads. Files are opened, counted and dropped; four numbers and one quoted line per store are all that survives the walk. That is the same position [the usage log](2026-09-10-usage-is-recorded-locally.md) takes about the tool's own runs, applied to files this tool did not write.
- Quoted lines are somebody else's text on its way to a terminal and an agent's context, so they go through the same sanitizing every relayed string in this tool does.
- Reading a few gigabytes takes seconds, so the walk reports progress. A command that prints nothing for that long reads as one that hung, and this one is the first thing a reader ever runs.
