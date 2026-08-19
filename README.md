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

## Use

```sh
agent-reference get zod                      # the version your lockfile has, resolved and
                                             # checked out; prints the path
agent-reference get zod@3.22.0               # any other version, side by side with the first
agent-reference get vercel-labs/just-bash    # any GitHub repo (github:, git URLs, and
                                             # file:../repo work too)
agent-reference get design-notes             # a configured reference, by name
agent-reference status                       # every configured reference, its scope and state
agent-reference validate                     # check the config files
agent-reference store                        # what the store holds, and how big
agent-reference clone                        # optional bulk prefetch (CI, a long flight)
```

`get` is the verb agents live in: it takes a name and returns a path. `status` is the
overview: it runs offline and instantly, and a reference that has never been fetched shows
as `declared`, which is the normal state of a healthy config, not a problem. When something
does need fixing, `status` leads with `problems:` and `next steps:`. Add `--json` for
structured output.

## Configure

Configuration is optional and holds what is worth remembering, not an inventory. Two files,
same format:

- `agent-reference.json`, committed. Anything fetchable and shareable: git repositories,
  package pins, groups, descriptions.
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
  "groups": {
    "documentation": {
      "description": "Read all of these before writing docs",
      "references": ["design-notes", "typescript"]
    }
  }
}
```

Every reference is a shorthand string or an object adding `description` and `groups`.
There are no commands for editing config; agents and humans write the JSON directly, and
`validate` checks it (unknown keys are rejected with a suggestion).

Dependencies need no entry at all: `get <name>` reads the lockfile at call time. A
`packages` entry exists only when there is something to remember about one, a pin the
resolver could not find, a description, or a group. `"installed"` follows the lockfile;
an exact version, range, or dist-tag asks for that instead.

Groups give a set of references one name, so "read the documentation references" means
something. Membership can be declared on the reference (`"groups": [...]`) or on the group
(`"references": [...]`); both are unioned, and any kind can join a group.

Other keys: `allImporters` to scan every workspace importer, `registry` for a private npm
registry, `cacheDir` to move the store (an `agent-reference.local.json` with `cacheDir`
inside the project keeps every checkout under a sandboxed agent's readable root).

## How versions resolve

Package versions come from the lockfile (PNPM, npm, Bun text lockfiles, and Yarn), read at
`get` time, so what is checked out cannot drift from what is installed. For each
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
the package's own directory; the repository root is `repositoryPath` in `--json`.

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
- Mirrors at `<store>/git/<host>/<owner>/<repo>.git`: the whole repository, every version.
  History questions (`git log`, `blame`, `show <tag>:<file>`, diffs between releases) run
  here with plain git and no checkout at all.
- Checkouts at `<store>/src/<host>/<owner>/<repo>/<commit>`, keyed by commit, so two
  projects on the same version share one directory, and two agents can hold two versions
  of the same repository at once with no `HEAD` to fight over.
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
