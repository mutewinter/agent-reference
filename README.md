# agent-reference

Keeps the upstream source behind a project's dependencies checked out locally, so a coding
agent can read the real thing instead of guessing from `node_modules` or the network.

`node_modules` holds only what a package chose to publish. `agent-reference` checks out the
package's repository at the exact published commit, which is the only way to read its
tests, examples, CI config, git history, or the source of anything that ships built output.
It also tracks plain folders and arbitrary git repositories as references.

## Install

```sh
npm install -g agent-reference
npx skills add mutewinter/agent-reference   # teaches your agent to use it
```

Needs Node 20+ and git 2.19+ on `PATH`.

## Use

```sh
agent-reference status                       # every reference, with absolute paths
agent-reference status zod                   # one reference
agent-reference status --group documentation # a named set
agent-reference clone                        # materialize everything configured
agent-reference validate                     # check agent-reference.json
agent-reference schema                       # print the config JSON Schema
```

`status` is the command an agent runs. It reports each reference with its absolute path,
and leads with `problems:` and `next steps:` when something needs doing. Add `--json` for
structured output.

## Configure

Commit `agent-reference.json`. There are no commands for adding references; agents and
humans edit this file directly, and `validate` checks it.

```json
{
  "packages": {
    "react": "installed",
    "prettier": "3.6.2"
  },
  "folders": {
    "design-notes": "./references/design-notes",
    "api-docs": {
      "path": "../platform/docs",
      "description": "Source of truth for endpoint contracts",
      "groups": ["documentation"]
    }
  },
  "git": {
    "typescript": "github:microsoft/TypeScript#main"
  },
  "groups": {
    "documentation": "Read all of these before writing docs"
  }
}
```

Every reference is a shorthand string or an object adding `description` and `groups`.
`packages` values are `"installed"` (follow the lockfile) or an exact version, range, or
dist-tag. `git` values are `github:owner/repo#ref`, a git URL, or `file:../repo#ref`.

Groups give a set of references one shorthand name, so five documentation folders can be
addressed at once with `--group documentation`. Membership can be declared on the reference
(`"groups": [...]`) or on the group (`"references": [...]`); both are unioned.

Put machine-specific paths in `agent-reference.local.json`, same format, not committed.
Its entries override same-named entries in the shared file.

Other keys: `allImporters` to scan every workspace importer, `registry` for a private npm
registry, `cacheDir` to move the store. Unknown keys are rejected with a suggestion.

## How versions resolve

Package versions come from the lockfile (PNPM, npm, Bun text lockfiles, and Yarn), not from
`package.json` ranges. For each `name@version`, the registry manifest gives the git remote
and, when present, the publish commit. Otherwise `agent-reference` tries the usual tags
(`pkg@1.2.3`, `v1.2.3`, `1.2.3`), then searches the tag list for the version.

Every candidate commit is verified before use: the package's `package.json` at that commit
must report the same name and version. This matters in monorepos, where a `v1.2.3` tag can
belong to an unrelated package's release. Each reference records how sure the result is:

| confidence | meaning |
| --- | --- |
| `pinned` | the ref was chosen by hand in the config, which overrides everything below |
| `verified` | package.json at the checkout reported exactly this name and version |
| `unverified` | the commit looked right but no package.json confirmed it |
| `fallback` | nothing matched, so the default branch was checked out; not the published version |

For a monorepo package the whole repository is checked out but `path` points at the
package's own directory; the repository root is `repositoryPath` in `--json`.

## When resolution fails

Some repositories tag releases in ways no tool can guess, and some packages have no
repository in their registry metadata. Failures are recorded in the lockfile and reported
by `status` as `unresolvable`, together with the fix and the JSON to add. `status` does
*not* suggest re-running `clone` for these, because it would fail identically.

Three package keys exist for this:

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
and private packages work. Editing any of them makes the reference worth retrying, so
`status` goes back to recommending `clone`. One unresolvable reference never stops the
others.

## Layout

Everything heavy lives in one machine-wide store, shared across projects and worktrees,
like the pnpm store:

- Store root: `$AGENT_REFERENCE_STORE_DIR`, `$XDG_CACHE_HOME/agent-reference`, or the OS cache directory.
- Bare repositories at `<store>/repositories/<host>/<owner>/<repo>.git`.
- Checkouts at `<store>/worktrees/<host>/<owner>/<repo>/<commit>`, keyed by commit, so two
  projects on the same version share one.

Inside a project there are exactly two files, both committed: `agent-reference.json` and the
generated `agent-reference.lock.json`, which records the resolved repository and commit for
each reference and contains no machine-specific paths. Local paths are derived from each
machine's store at read time.

The store is a cache. Delete it any time and `agent-reference clone` rebuilds it.

## Development

```sh
npm test
npm run build
```

Tests use fixture lockfiles and local git repositories. They do not call npm or GitHub.

Not supported yet: binary `bun.lockb` (generate a text `bun.lock` first), and
all-workspaces scanning for npm, Bun, and Yarn (point at the specific workspace package).
