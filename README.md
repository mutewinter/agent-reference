# agent-reference

Gives a coding agent readable upstream source on demand: any dependency at its exact
installed version, any git repository, and any local folder, all addressable by name.

`node_modules` holds only what a package chose to publish. `agent-reference` checks out the
package's repository at the exact published commit, which is the only way to read its
tests, examples, CI config, git history, or the source of anything that ships built output.
Nothing is fetched until an agent asks for it.

## Install

```sh
npm install -g agent-reference
npx skills add mutewinter/agent-reference   # teaches your agent to use it
```

Needs Node 20+ and git 2.19+ on `PATH`. That is the whole setup: `get` works immediately,
with no config file and no prefetching.

The skill that lands in your project is a short stub, deliberately: it holds only what stays
true across versions. Everything that changes with the tool, config shape included, is
printed by `agent-reference guide` from the CLI itself, so a project that installed the skill
months ago still gets instructions matching the version it runs.

## Set a project up

Hand your agent one line:

```
Set this project up for agent-reference: run `npx agent-reference@latest init` and follow the brief it prints.
```

Say it yourself rather than pasting the bare command. `init` prints instructions, and an agent
is right to treat tool output as data rather than orders; the authority to act on the brief has
to come from you.

`init` surveys the project and prints a brief for the agent to carry out: install the skill
so later sessions find the tool without being told, mine recent sessions for the references
this project already needs, write the config, and add one sentence to whichever instruction
file the agent here reads. It reads and prints, so every write is the agent's, and it ends
by having the agent show you `status`, which is exactly what your agent will see from then
on. Anything it finds by mining goes to `agent-reference.local.json` first; promoting an
entry to the committed file is your call, not a heuristic.

## Use

```sh
agent-reference get zod                      # the version your lockfile has, resolved and
                                             # checked out; prints the path
agent-reference get zod@3.22.0               # any other version, side by side with the first
agent-reference versions zod                 # every version this project installs, and where
agent-reference get vercel-labs/just-bash    # any GitHub repo (github:, git URLs, and
                                             # file:../repo work too)
agent-reference get design-notes             # a configured reference, by name
agent-reference status                       # every configured reference, its scope and state
agent-reference init                         # print a setup brief for an agent to carry out
agent-reference validate                     # check the config files
agent-reference guide                        # the full agent instructions, from this version
agent-reference store                        # what the store holds, and how big
agent-reference clone                        # optional bulk prefetch (CI, a long flight)
```

`get` is the verb agents live in: it takes a coordinate and returns a path. A coordinate is
`name@version`, a repository spec, or a bare name as shorthand for whatever this project
installs. When the shorthand is ambiguous, because a workspace installs two versions of the
same package, `get` prints the coordinates and stops rather than picking one; `versions`
answers the same question directly and never fetches. A package name may carry an ecosystem
prefix (`npm:zod@3.22.0`); npm is the default and the only one resolved today. `status` is the
overview: it runs offline and instantly, and a reference that has never been fetched shows
as `declared`, which is the normal state of a healthy config, not a problem. When something
does need fixing, `status` leads with `problems:` and `next steps:`. Add `--json` for
structured output.

## Configure

Configuration is optional and holds what is worth remembering, not an inventory. Two files,
same format:

- `agent-reference.json`, committed. Anything fetchable and shareable: git repositories,
  package pins, sets, descriptions.
- `agent-reference.local.json`, gitignored. Machine paths and private references.
  `validate` errors if an absolute or `~/` path appears in the committed file, so personal
  paths cannot reach a commit. Entries here override same-named committed entries.

```json
{
  "packages": {
    "prettier": "3.6.2"
  },
  "folders": {
    "design-notes": "./references/design-notes"
  },
  "git": {
    "typescript": "github:microsoft/TypeScript#main"
  },
  "sets": [
    {
      "description": "Documentation sources to read before writing docs",
      "folders": ["./references/style-guide"],
      "git": ["github:acme/design-system#v4"]
    }
  ]
}
```

Every reference is a shorthand string or an object adding `description`. There are no
commands for editing config; agents and humans write the JSON directly, and `validate`
checks it (unknown keys are rejected with a suggestion).

Dependencies need no entry at all: `get <name>` reads the lockfile at call time. A
`packages` entry exists only when there is something to remember about one, a pin the
resolver could not find, a description, or a place in a set, and it always carries an exact
version. Ranges, dist-tags, and a "follow the lockfile" mode are all rejected, because a
config entry has to mean the same thing on every machine and next month; `status` reports a
pin that has fallen behind what the project installs instead of silently following it.

A set is a labeled list: a description saying what the collection is for, with members
declared inline the way a human would paste them. Member names derive from the path or
repository basename (override with `"name"` when two collide), the same reference may
appear in several sets, and a set can mix folders, git repositories, and packages.
`status` renders each set as its own section under its description, and `--set` selects
one by its short `name` or any unambiguous piece of its description, so "the
documentation sources" works in chat and on the command line alike.

Other keys: `registry` for a private npm registry, `cacheDir` to move the store (an `agent-reference.local.json` with `cacheDir`
inside the project keeps every checkout under a sandboxed agent's readable root).

Any directory is a project: the nearest config (walking up) anchors it, and a Node
lockfile is optional. In a Python repo, a Rust repo, or a plain folder, `folders` and
`git` references work exactly the same; only package references need a lockfile.

## How versions resolve

Package versions come from the lockfile (PNPM, npm, Bun text lockfiles, and Yarn), read at
`get` time, so what is checked out cannot drift from what is installed. Every workspace
importer is read, not just the one nearest the working directory, and the nearest one wins
when several install the same name at different versions. For each
`name@version`, the registry manifest gives the git remote and, when present, the publish
commit. Otherwise `agent-reference` tries the usual tags (`pkg@1.2.3`, `v1.2.3`, `1.2.3`),
then searches the tag list.

Every candidate commit is verified before use: the package's `package.json` at that commit
must report the same name and version. This matters in monorepos, where a `v1.2.3` tag can
belong to an unrelated package's release. Each checkout records how sure the result is:

| confidence | meaning |
| --- | --- |
| `pinned` | the ref was chosen by hand in the config, which overrides everything below |
| `verified` | package.json at the checkout reported exactly this name and version |
| `unverified` | the commit looked right but no package.json confirmed it |
| `fallback` | nothing matched, so the default branch was checked out; not the published version |

For a monorepo package the whole repository is checked out but the printed path points at
the package's own directory, and only when a `package.json` there reports this exact name
**and** version. A directory that merely carries the right name is not enough: repositories
bundle demo apps that claim the package's name, and pointing an agent at one hands it two
files and calls them the source. When nothing confirms, the path is the repository root,
which is never a lie about what it contains. The repository root is `repositoryPath` in
`--json`, and `directory` in the config overrides the whole question.

## When resolution fails

Some repositories tag releases in ways no tool can guess, and some packages have no
repository in their registry metadata. Failures are recorded and reported by `status` as
`unresolvable`, together with the fix and the JSON to add. Three package keys exist for
this:

| key | use when |
| --- | --- |
| `ref` | the right commit or tag cannot be guessed; a pin always wins |
| `repository` | registry metadata has no repository, or the wrong one |
| `directory` | the monorepo subdirectory was not detected |

```json
{
  "packages": {
    "odd-tags": {
      "version": "1.2.3",
      "ref": "release-1.2.3",
      "description": "Pinned by hand: tags follow no known pattern"
    }
  }
}
```

Setting both `repository` and `ref` skips the registry entirely, which is how unpublished
and private packages work. One unresolvable reference never stops the others.

## Layout

A project carries exactly one committed file, `agent-reference.json`, plus the optional
gitignored `agent-reference.local.json`. Everything else lives in one machine-wide store,
shared across projects and worktrees, like the pnpm store:

- Store root: `~/.agent-reference`, the same on every platform, or `$AGENT_REFERENCE_STORE_DIR`.
- Mirrors at `<store>/git/<host>/<owner>/<repo>.git`: the whole repository, every version,
  cloned without file contents until something asks for them.
- Checkouts at `<store>/src/<host>/<owner>/<repo>/<commit>`, keyed by commit, so two
  projects on the same version share one directory, and two agents can hold two versions
  of the same repository at once with no `HEAD` to fight over. Each one is a git worktree
  on the mirror, so history questions (`git log`, `blame`, `show <tag>:<file>`, diffs
  between releases) run with plain git at the path `get` printed.
- Materialization state at `<store>/state/<project>.json`, one file per project on this
  machine, recording what has been resolved and checked out. It is a cache, not a
  lockfile, and is never committed.

Checkouts are keyed by commit rather than version because a release tag can move or be
deleted, while a commit cannot. When stdout is a terminal, printed paths shorten to
`~/...`; piped and `--json` output always gives the literal absolute path.

The mirrors, checkouts, and state are all cache. Delete any of it at any time; the next
`get` rebuilds what it needs. Because checkouts are keyed by commit, old versions
accumulate; `agent-reference store` reports what the store holds, and `--prune` trims it:

```sh
agent-reference store                    # per-repository sizes and a total
agent-reference store --prune            # drop checkouts unused for 30 days,
                                         # then any repository left with none
agent-reference store --prune --days 0   # drop everything
```

Sizes are computed by walking the store, so `store` is the only command that pays that
cost, and only when asked.

## Development

```sh
npm test
npm run build
```

Tests use fixture lockfiles and local git repositories. They do not call npm or GitHub.

Not supported yet: binary `bun.lockb` (generate a text `bun.lock` first), and
all-workspaces scanning for npm, Bun, and Yarn (point at the specific workspace package).
