# The installed skill is a stub; the guide is served by the CLI

## Context

Every other artifact this tool ships travels with the CLI. The skill does not. It is copied into a project, or into a machine-wide skills directory, and then nothing updates it: it has no version, no record of where it came from, and no way to notice that the CLI beside it has moved on. It is also the artifact most likely to change, because most of what will be wrong with this tool is that an agent did the wrong thing, and that is a wording fix.

The failure is not hypothetical. Three repositories on this machine were carrying a skill that told an agent to write `"installed"` as a package version, months of tool-time after the config format stopped accepting it. Nothing on those machines could have detected the skew. The skill described a format; the format moved; the description stayed.

`agent-browser` ships two directories for exactly this reason and says so in its own stub: a 3 KB discovery stub that `npx skills add` picks up, and 72 KB of skill content served by the CLI at runtime, resolved by walking up from the executable. Their split is by size and specialization, since no agent should pay for the Slack skill to learn browser automation. That reasoning does not transfer here: this entire skill was 6.5 KB, half the size of their stub alone.

## Decision

Split the skill by **stability**, not by size.

The file installed on disk holds only what stays true across versions: the frontmatter and its triggers, the one verb and its examples, that the config files are an index to read directly, and the safety rules. Those are behavioral. A version of this tool that changes them is a different product.

`agent-reference guide` prints the rest from `guide/agent-reference.md`, shipped in the package and read at runtime the way `schema` already reads its file. That is everything describing a format that moves: the shape of every config entry, the routing table for adding one, what `versions` and `status` report, and how setup works. The stub tells the agent to run it before writing anything.

`npx skills add` becomes the primary install route in the `init` brief, with copying from the package as the offline fallback. The installer records where the file came from, so `skills update` can refresh it; a copy has no such record. With the file reduced to a stub, the two routes install the same unchanging content, so the choice stops being load-bearing.

## Consequences

The skew that matters is gone. An agent that runs `guide` gets instructions that came out of the same binary it is about to invoke, so they cannot describe a different version. A stub can only go stale about triggers and safety rules, which is a far rarer edit and a far cheaper miss.

The cost is a redirect that has to be followed. An agent that reads the stub and never runs the command is worse off than one holding the whole skill, and no amount of wording guarantees the hop. This is measurable rather than arguable: the resolve eval already points a fresh agent at this tool with no hints, and running it against the stub reports whether the redirect gets taken.

`guide` output is a file this tool ships, not something read out of a project, so it carries the same trust as the rest of the CLI's stdout. Nothing in it is interpolated from a config or a transcript, for the same reason the `init` brief interpolates nothing.
