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

Two suites so far. `init` asks whether a printed brief gets carried out. `resolve` asks
something narrower: when `get` cannot win on its own, is what it prints enough to iterate on?

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
