# Evals

Where a real agent is pointed at a surface whose whole product is text, and what it did is
recorded rather than argued about. `init` prints a brief for an agent to carry out, so the
only way to know whether the brief works is to hand it to one.

The first two runs paid for themselves. One found that the brief undercounted a transcript
store badly enough to read as "nothing to mine here". The next found that an agent will
refuse the whole brief when it combines a machine-wide self-install, a sweep of private
session history, and an instruction to skip confirmation, which is a conclusion no amount of
reading the text would have produced.

Runs are not tests. They cost money, they need network and a logged-in Claude Code, and they
are not deterministic. `npm test` never invokes them.

Four suites so far. `init` asks whether a printed brief gets carried out. `resolve` asks
something narrower: when `get` cannot win on its own, is what it prints enough to iterate on?
`history` asks what an agent does with a path once it has one. `adopt` asks the question
before all of them: pointed at an ordinary task, does an agent reach for the tool at all?

## init

```sh
npm run build
node evals/init/run.mjs                 # default: sonnet, prompt `npx agent-reference@latest init`
node evals/init/grade.mjs               # grade the newest run
node evals/init/grade.mjs <runDir>      # or a specific one
```

`run.mjs` builds a synthetic world, spawns `claude --print` in it, and saves what came back.
`grade.mjs` reads the transcript and the project the agent left behind, and reports each
thing the brief asked for against what actually happened, plus every command the agent ran.

### The world

A storefront project with a lockfile, an `AGENTS.md`, a `docs/adr` directory, and a git
repository, sitting in a home alongside the sibling checkouts and reference clones it has
been pointed at. Every name is invented.

Its history is the point. Twenty prior sessions are written in Claude Code's transcript
format, seeded so that a correct ranking is knowable in advance: `design-system` appears in
five distinct sessions, `platform-api` in four, `chess-engine` and `wire-format` and
`docs/adr` in three, `tiny-router` in two. Against that, three decoys: `legacy-parser` and a
`Downloads` screenshot appear once each, and `src/components` appears in six sessions as
ordinary work in the repo, never as something to go read. A correct run surfaces the first
group, skips the second, and treats `docs/adr` as the one in-repo folder that earned its
place. One session has the agent guessing at where the design system lives and getting it
wrong first, which is the signal the brief tells a miner to rank up.

`world.mjs` exports `EXPECTED`, so the fixture and the grader cannot drift apart.

### Offline by construction

Three shims sit on `PATH`. `agent-reference` runs this checkout's build against the synthetic
home, `npx` drops the flags and the version suffix and runs what is left, and `skills add`
lands the checkout's skill where the real installer would put it. That last one matters
because step one of the brief leads with the installer: without a shim a run either fails on
a command the machine does not have, or reaches the network and installs into the operator's
own home.

### Where a run lives

`~/.agent-reference-evals/init-<timestamp>/`, outside the checkout. Each run holds the world,
the shims, `before/` and `after/` copies of the project, `result.json`, and `run.json` naming
the transcript. Old runs are kept; nothing here cleans up after itself.

### How the sandbox works, and where it leaks

Two homes are in play. The agent keeps the operator's real `HOME`, because Claude Code
authenticates from it and no override survives that. The synthetic home is scoped to the
`agent-reference` shim on `PATH`, so `init` alone surveys the fake world and names its
transcript store, its checkouts, and its skill directory by absolute path. Everything the
brief hands the agent therefore resolves without the agent needing a home of its own, and
the operator's own session history is never what it is pointed at.

Seeded transcripts hold absolute paths rather than `~/`, for the same reason. That costs the
fixture one real signal, since `~/`-shaped paths are something a miner would key on.

Three caveats worth holding onto when reading a result:

- The operator's global `CLAUDE.md` and global skills are loaded, because the real home is.
  A run is a field test, not a clean room. Check the transcript before attributing a
  behavior to the brief.
- The agent runs with `--dangerously-skip-permissions`. It is pointed only at the run
  directory, but nothing enforces that.
- The agent's own transcript lands in the operator's real transcript store, under the run
  directory's escaped path. `run.json` records where.

## resolve

```sh
npm run build
node evals/resolve/run.mjs                 # default: sonnet, one turn, no hints
node evals/resolve/grade.mjs               # grade the newest run
```

### The world

A pnpm workspace where every dependency in `apps/studio` fails resolution a different way,
each drawn from something seen in the wild:

| package | what goes wrong | the way out |
| --- | --- | --- |
| `plainpkg` | nothing | works from the repository root, which it did not before |
| `splitpkg` | installed at two versions in two workspace packages | an explicit coordinate |
| `shellpkg` | root manifest has another name, and a bundled app claims this one | the repository root, said out loud |
| `oddpkg` | releases tagged by date, so no tag mentions the version | `ref`, found by listing tags in the mirror |
| `movedpkg` | registry metadata names a repository that does not exist | `repository` |
| `@acme/internal` | a workspace package | nothing: it is already on disk |

The agent is told none of that. The prompt asks for every dependency checked out and
readable, and says some will not resolve on the first try. Its only guidance is the tool's
own output, which is the thing under test.

### Offline by construction

Upstream is local git repositories, and the registry is a stub on loopback wired in through
the project's own `registry` config key. `cacheDir` puts the store inside the run directory,
so a run never touches the operator's real checkouts. Nothing here reaches npm or GitHub, so
a result is the same next month.

### What is graded

The store on disk, not the final message: a claim that something was checked out is not a
checkout. Alongside that, whether the loop was used as intended (`versions` for the ambiguous
name, a `ref` for the untaggable one, a `repository` for the moved one) and whether the agent
had to read the tool's own source to make progress, which is the failure that motivated the
suite in the first place.

## history

```sh
npm run build
node evals/history/run.mjs                 # default: sonnet, one turn, no hints
node evals/history/grade.mjs               # grade the newest run
```

`get` hands back a `git worktree`, so `log`, `show`, `blame`, and diffs between releases all
work at the printed path with no further help from the tool. Whether an agent knows that is
not something the source can answer, and it is the whole question this suite exists for: the
alternative to an affordance is that none is needed.

### The world

A gateway project that speaks an upstream binary protocol, and that protocol's library as a
local git repository. The library used to split oversized payloads across continuation
frames; one commit deleted that path, capped payloads instead, and explained itself at
length in its message. Two commits later it was released.

The split is the fixture. The tree at HEAD carries the rule and, through a terse changelog,
the release it shipped in. What the library used to do, why the maintainers stopped, and the
issue it closed exist only in commits, because the change deleted the code that would have
shown it. `world.mjs` refuses to build a world where the marker word survives into the HEAD
tree, so the question cannot quietly stop being a history question.

The prompt reports the bug a user would report, asks for the maintainers' actual reasoning,
and names no mechanism: not git, not history, not commits.

### Offline by construction

Upstream is a local git repository, reached through a relative `file:` spec so the committed
config holds no machine path, and `cacheDir` puts the store inside the run directory. The
project ships the skill stub at `.claude/skills/`, so a run measures what this repository
ships rather than whatever is installed globally on the machine.

One caveat the fixture cannot avoid: a local `file:` reference is cloned in full, because git
ignores `--filter` for local clones. A real reference is a partial clone, where commit
metadata is local but `-p`, `--stat`, `blame`, and `-S` fetch file contents on first use.

### What is graded

Whether a git history command ran against the store, and in the checkout or the mirror,
which is the load-bearing signal. Then whether the answer carries what only history holds,
and one honesty check: an account of upstream's reasoning with no commit behind it is
invention, not a pass. Going to the original repository the `file:` spec points at is
recorded as a shortcut the fixture allows and a `github:` reference does not.

## adopt

```sh
npm run build
node evals/adopt/run.mjs                 # default: sonnet, one turn, no hints
node evals/adopt/grade.mjs               # grade the newest run
```

Every other suite measures what an agent does once it has engaged. This one measures whether
it engages, on the most ordinary task there is: build something with a library the project
already installs. Nothing in the prompt names the tool, the docs, or a version, and nothing
committed in the project names the library as something to go read, because a dependency
needs no config entry. The skill's own trigger text is the only thing that can put an agent
in the repository, which makes it the thing under test.

### The world

A checkout flow built on the `acme-ui` design system, which installs at 4.2.0. The task is to
replace a plain country select with a searchable one.

The library's 3.x line had a single flat `<Combobox options={...} />`. 4.0 replaced it with
four primitives, made `filter` required, and put the combobox behind a `UIProvider` that
nothing else in the app needs yet. It also kept the flat export working so 3.x code would
still compile, and that export is now a shim: it renders an uncontrolled input, ignores
`options`, and never filters.

That shim is the trap, and it is what makes the suite discriminate. What the package publishes
is one minified bundle plus a README pointing at a docs site, so the installed package names
both the flat export and the primitives and says nothing about which one is current. An agent
working from memory writes the 3.x call, greps the bundle, finds the name it expected, and is
wrong with nothing on disk to contradict it. Only the repository carries the migration guide.

`world.mjs` exports `EXPECTED`, split into what `node_modules` answers and what only the
repository answers, so the fixture and the grader cannot drift apart. It also refuses to build
a world where any of those facts is stated in the project tree, the published bundle and its
README included. Identifiers are allowed to appear there, because a bundle names its exports;
sentences about them are not.

### Offline by construction

Upstream is a local git repository and the registry is a stub on loopback, wired in through
the project's own `registry` config key. `cacheDir` puts the store inside the run directory.
Both live in `agent-reference.local.json`, which is where machine-specific settings belong and
which also leaves the committed config empty, so `status` reports a project with no references
declared, the resting state of a project that just installs things.

The project ships the skill stub at `.claude/skills/`, so a run measures what this repository
ships rather than whatever is installed globally on the machine.

### What is graded

Four questions, in the order they stop mattering if the previous one fails. Whether a checkout
landed in the run store at the installed version. Whether the run read the repository's prose
rather than only its source, since the facts the task needs are in `docs/` and nowhere else.
Whether the code left behind is the 4.x shape rather than the remembered one, read from the
files the run changed rather than from its own summary. And whether the reply carries what only
the repository holds, which is that the export memory reaches for is a compatibility shim.

Then one honesty check, the same one `history` makes: the 4.x shape described with no checkout
behind it is a guess that happened to land, not a win. Reading `node_modules`, reaching for the
network, and going to the upstream repository directly are all reported rather than scored;
they are the routes the tool competes with, and which one a run took is the interesting part of
a failure.
