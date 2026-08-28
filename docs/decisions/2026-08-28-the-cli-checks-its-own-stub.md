# The CLI checks the stub on disk against the one it ships

## Context

[The stub-and-guide split](2026-08-20-a-stub-on-disk-and-a-served-guide.md) accepted a residual risk in as many words: "A stub can only go stale about triggers and safety rules, which is a far rarer edit and a far cheaper miss."

That edit landed eight days later. An audit of local sessions found agents answering questions about a declared dependency out of `node_modules` instead of the checkout, so the stub gained a trigger keyed on the next command rather than on the kind of task, and gained `--path`. Both are exactly the class the split said would rarely move, and both are worthless to a copy that predates them.

Nothing on a machine could tell. `init` looked for the skill directory and, finding it, printed "already installed here. Nothing to do." That sentence is the whole failure: the one command whose job is to check the setup asserted the setup was fine without comparing anything. Three copies in one repository family on this machine were a version behind while `init` said they were done.

The install route does not close this either. `npx skills add` records where the file came from so `skills update` can refresh it, but nothing says *when* to run that, and a hand-copied stub has no such record at all.

## Decision

The package already ships `skills/agent-reference/SKILL.md`, so every installed CLI holds the canonical text. Compare the copies against it.

`checkSkill` reads the directories `init` already probes and reports each copy as `current`, `stale`, or `unreadable`. Comparison is a digest of the text with CRLF normalized and trailing whitespace trimmed, because line endings and a final newline are how a file was written rather than what it says: a copy checked out on Windows differs from the shipped bytes in every line and from its own source in none, and reporting that would train a reader to ignore the report.

A digest rather than a version stamp in the file. A stamp would say which version a copy forked from, which is worth something in a bug report, but it only avoids a false positive for a copy that is edited and current, and a hand-copied stub cannot be both once upstream moves. The stamp would be a line in the file, a write path, and a second thing to keep correct, for a case that does not arise.

It surfaces in two places. `init` says which copies differ instead of claiming there is nothing to do. `status` adds one `project` warning per stale copy, because `status` is the command that actually runs: in the audited window it was 29 of the 87 calls made from a consuming repository, against two for `init`. A check nobody reaches is the state this decision is fixing.

## Consequences

`getStatusReport` now takes `home`, and reads a machine-wide directory to answer a project-scoped question. That is a real widening of what `status` touches, and the tests pay for it: every call site in `tests/status.test.ts` points at a home holding no skill, so the suite cannot pass or fail on whether the machine running it has a current skill installed.

The warning names a file outside the project and, for a machine-wide install, one shared by every project on the machine. The fix line says to tell the user what was changed rather than to quietly rewrite it, for the same reason the safety rules forbid deleting a reference to make `status` clean: output going quiet is not the goal.

A copy that is deliberately edited reports as stale for as long as it stays edited, with no way to silence it. That is the honest reading. A stub the tool did not write is a stub the tool cannot vouch for, and the alternative is a suppression mechanism for a case nobody has yet had.

Staleness in the other direction reads the same way, so the wording is "is not the one this version ships" rather than "is out of date". A newer stub beside an older CLI is skew too, and which side is behind is not something the digest knows.
