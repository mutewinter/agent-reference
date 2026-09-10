# The guess leads the first screen, and the page shows the chain before the examples

## Context

The first screen showed two things an agent does when it has no source: a minified bundle read out of `node_modules`, and a docs site fetched as markup. A third, an API remembered from another version, was cut on 2026-09-01 for not surviving a single line. See [the page answers why before how](2026-09-01-the-page-answers-why-before-how.md).

Two readers then failed at the same step from opposite ends. One, who does not code with agents, read the page, the repository, and a summary of both, and still could not say in a sentence what the tool is for. The other, who uses Claude Code daily, read the talk and said they had not encountered any of the failures it asserts, that pointing an agent at a docs URL from a skill file works the same, and that another tool is another thing to confuse the agent or the person running it.

Counted across 770 Claude Code session transcripts on the author's machine, which already runs this tool and whose skill steers an agent away from published builds, so these are treated numbers rather than a control:

| What the agent did | Sessions |
| --- | --- |
| Guessed an API and had it rejected by the compiler | 71 |
| Searched or fetched the web for docs | 89 |
| Read a published build under `node_modules` or `dist` | 7 |
| Cloned a repository into a temp directory | 12 |

The page led with the rarest of the four. The one it cut is ten times more common, and it is the only one that ends in a build the reader watched fail rather than in tokens nobody watches.

The same reading also found that nothing on the page said what the prompt in Get started actually leaves behind. A reader who has not run it does not know that a skill file lands in their project, that the skill is what makes the agent reach for the tool at all, or that being an ordinary `SKILL.md` is what lets a team ship it the way they ship every other skill. That last question arrived from a team lead as "does this work inside a plugin", which is the same question asked from the other side.

## Decision

**The guess leads the first screen.** An edit the agent made from memory, then the compiler rejecting it, in the theme's red the way the other two results end. It does not survive one line and never was going to; it survives four, which is what the blocks beside it take. It is also the only block naming a library other than Effect, because it needs an API that actually moved, and `useVirtual` became `useVirtualizer` between two majors of `@tanstack/react-virtual`.

**Each side of the first screen is one plain block in markdown.** A fence per tool call, each tagged with the language of what came back, reads as a file listing rather than a session, and it asks a highlighter to paint the innards of a minified bundle as though they were source. Carrying the site's red and green across as diff markers was tried and taken back out: a column of `-` down the left of a transcript is the loudest thing in it, and what it buys is a color the reader met upstairs anyway. The markers come off, the elbows stay, and each side reads as the session it is. The aside under it comes off as well, since a one-line joke needs the timing the page gives it and the README does not.

**A section between Get started and the rest shows the chain, three steps.** The skill landing in a skills folder, the skill itself whole, and the agent acting on it. The skill is read out of `skills/agent-reference/SKILL.md` rather than quoted, because an excerpt of it is a second version of the file the page is pointing at, and it is clamped to a screenful with a button rather than given its own scroller, which would trap a thumb on a phone. The third step is the first screen's failure run again with the source in hand, ending on the export that exists, so the page closes the loop it opened rather than asserting that it does. The two sentences on what setup installs lead that section instead of sitting under the copy button, where a reader is deciding to paste rather than reading about what happens afterward.

**How it works moves above the examples, and the commands become their own section.** The order a first visit asks in is what this is, how to get it, what that leaves on the machine, how it works underneath, what it looks like in use, and the commands last for whoever wants them. The examples are the longest thing on the page and were standing between the reader and the two short explanations they came for.

**The format section is gone.** It documented the config's shape to a reader who never writes one, on a page that had already shown seven configs. What it said lives in the JSON Schema the site serves, in `agent-reference guide`, and in the `help` transcript the commands section carries, all three of which are read by the agent that actually writes the file.

## Consequences

- The README and `/index.md` follow the new order out of the same regions, so the test that checks `index.md`'s headings against the page changed with it, and the README's marked regions moved rather than being rewritten.
- `fragments` in `site/code-samples.ts` existed for the format tables alone and is gone. What the highlighter takes now comes from `site/blocks.ts`, which is the one place the skill is read off disk and the only reason that module exists.
- The shipped skill is markdown with fenced examples inside it, so a fenced block on the markdown surfaces is railed with one more backtick than the longest run it contains, rather than assuming three.
- The comparison the second reader asked for, a path in an instructions file against a checked reference, is not on the page. It was drafted as three rows and cut: the page answers what this is and what it does, and arguing with what a reader already has is a different job than that.
- The link preview card still shows the bundle and the docs markup. It is drawn by hand with `pnpm og` from `site/og.ts`, which reads the hero's headings but carries its own excerpt lines, and it has not been redrawn for the guess.
