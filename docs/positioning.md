# Positioning

Why this exists, what it claims, and the words those claims turn into on a slide or a page. Source material for the talk, the presenter notes, and the site copy; not a description of how the system works, which is [architecture/](architecture/README.md), and not a record of a design call, which is [decisions/](decisions/README.md).

## The thesis

The references a coding agent needs are real paths to real source on a real machine, and an instructions file is prose: nothing in it is checked, nothing in it stays current, and all of it is in context whether or not today's task touches a dependency.

A config is checked. That is the whole argument.

## What it claims, against the honest alternative

The alternative is not "nothing." It is a hand-written `AGENTS.md` or `CLAUDE.md` with paths in it, which is what most people do today and what the author did for a year.

| # | Claim | What an instructions file does instead | Backed by | The line for a slide |
| --- | --- | --- | --- | --- |
| 1 | References are validated, so a path that only exists on your machine cannot reach a commit | A path in prose is never checked: it can be wrong, stale, or personal, and nothing says so | `validate` errors on a machine path or `file:` repo in the committed config, errors when the gitignored file is actually tracked by git, and warns when a folder is missing or escapes the repo | "Your agent's references are a config, not a paragraph. Configs get checked." |
| 2 | References stay pinned to what you actually install, and drift is reported | Prose says React 18 forever, including the week after you upgrade | `status` compares each pin against every workspace importer, offline, and emits the exact patch that fixes it | "The day you upgrade, the reference is wrong and nothing tells you. Now something does." |
| 3 | It costs nothing until the agent asks | Every line of an instructions file is in context on every turn | 4,693 bytes of stub on disk; the guide, the reference list, and the source itself load only on request | "One paragraph in context. Thirty-four gigabytes on demand." |
| 4 | An agent maintains it for you | An agent editing prose has to guess the conventions from the prose | One config file, a `schema` verb, an `init` that briefs rather than scaffolds, and problems that carry a machine-applicable `configPatch` | "You do not write this file. You ask for a reference and your agent writes it." |
| 5 | Teammates inherit the shared half | Personal paths and shared ones live in the same file, so neither is safe | Two files, one committed and one gitignored, merged at read time | Weakest of the five. See below before putting it on a slide. |

### On claim 5

The author's own counter, from 2026-08-19: with one teammate who codes with AI, he does not know what they would want checked out and would not encode it for them. Committed references are real for well-known open source that a team genuinely shares. They are speculative for anything else. Say the smaller true thing, which is that the split exists so the personal half cannot leak, and let sharing be a consequence rather than a pitch.

## Motivating evidence

The author's own machine, measured 2026-08-19: 209 reference directories, 188 git clones, 34 GB, maintained by hand. In one repository's agent sessions, 106 of 388 pasted at least one of those paths, 278 pastes in total.

Every fourth conversation, a human was the retrieval layer.

## Use cases, in the order they convince

| Case | What the user says | What the agent does |
| --- | --- | --- |
| The dependency you are debugging | "Why does this library behave this way?" | Reads the original source, its tests, its comments, and its history at the exact version the lockfile installs |
| The library you might adopt | "Take a look at this, I might use it" | Materializes the repository once, at a real commit, instead of guessing from a docs site that is a version ahead |
| Exact versions for what you install | Nothing; it is already declared | A pin per package, checked against the lockfile, reported when it drifts |
| A folder of context that is not code | "Add my notes vault as a reference" | Reads a declared local folder by name, with the path in the gitignored file |
| A meta folder above your repos | "Work on the API repo" | Reads a config in the parent directory that names every repository below it, so a session can start anywhere |
| Global references | "Where do my dotfiles live?" | Resolves a declared folder rather than searching the disk |

## Ethos

The design rules the project keeps returning to, each traceable to a working session.

1. **The human is not the maintainer.** "The human is not the one that's going to be maintaining this. They're really going to be chatting with their own agent to both set it up and maintain it over time." Every surface is designed for an agent to read and write; the human gets one screen, `status`, for when they need to debug it.
2. **Stay generic.** "This is of utmost importance: it needs to stay generic, malleable, flexible for the use cases the user has. Not overly prescriptive." Three kinds of reference, one verb, no opinions about what belongs in them.
3. **Nothing is eager.** Cloning everything on a new machine could take minutes for source the agent may never open, so nothing is fetched until it is asked for. `declared` is a normal resting state, not a problem.
4. **Personal paths never leak.** The gitignored file is not a convenience, it is the guardrail: the committed file is read on someone else's machine, so a home path there is a leak rather than a preference, and it fails as an error.
5. **Policy ships as a description, not a feature.** A house rule like "never name these folders in a commit" travels as a sentence in the reference's description, which the agent reads, rather than as behavior in the code.
6. **One checkout per commit.** Two agents can hold two versions of the same library at once, and nothing in the store is precious enough that deleting it costs anything.
7. **Authority comes from the user's prompt, never from the tool's stdout.** Anything the CLI relays from a third party is sanitized before an agent reads it.

## Gaps to say out loud

Claims are worth more when the exceptions are stated first.

| Gap | Reality today |
| --- | --- |
| Drift warns the human, not the agent | Drift is reported by `status`. An agent that reaches straight for `get` is not warned that the reference it is about to read is pinned to a version this project no longer installs. |
| The shared-config case is thin | See claim 5. |
| Only one ecosystem resolves | npm. Other ecosystem prefixes are accepted and rejected with a pointer, rather than silently guessed. |
