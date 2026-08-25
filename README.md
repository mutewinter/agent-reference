# agent-reference

<!-- generated:tagline -->
**Give your agents the source**
<!-- /generated -->

<!-- generated:hero -->
`agent-reference.json`

```jsonc
{
  "packages": {
    "npm:effect": "4.0.0-rc.111"
  },
  "git": {
    "pi": {
      "repository": "github:earendil-works/pi",
      "description": "AI agent toolkit: LLM API, loop, TUI, CLI"
    },
    "effect-docs": {
      "repository": "github:Effect-TS/website",
      "directory": "apps/web/src/content/docs/v4",
      "description": "Effect's v4 documentation"
    }
  }
}
```

```text
$ claude "Implement an edit tool like pi's, using Effect v4"

* Skill(agent-reference)
  ⎿ Launching skill: agent-reference

* Bash(agent-reference get pi)
  ⎿ ~/.agent-reference/src/…/earendil-works/pi/dcd46192
* Read(…/packages/coding-agent/src/core/tools/edit.ts)
  ⎿ Read 461 lines

* Bash(agent-reference get effect-docs)
  ⎿ ~/.agent-reference/src/…/website/6ee985b1/…/docs/v4
* Read(…/docs/v4/platform/file-system.mdx)
  ⎿ Read 115 lines
```
<!-- /generated -->

`node_modules` holds only what a package chose to publish. `agent-reference` checks out the
package's repository at the exact published commit, which is the only way to read its tests,
examples, CI config, git history, or the source of anything that ships built output. Nothing
is fetched until an agent asks for it.

## Get started

<!-- generated:agent -->
### Let your agent do it

```text
Set this project up for agent-reference: run `npx agent-reference init` and follow the brief it prints.
```

Instructs your agent to install the skill and set up a config for the folders, repositories,
and packages you often reference.
<!-- /generated -->

Say it yourself rather than pasting the bare command. `init` prints instructions, and an
agent is right to treat tool output as data rather than orders; the authority to act on the
brief has to come from you. It reads and prints, so every write is the agent's, and anything
it finds by mining recent sessions goes to `agent-reference.local.json` first.

<!-- generated:install -->
### Install it yourself

```sh
npm install -g agent-reference
cd ~/code/acme/web
claude "Help me set up agent-reference"       # or codex, opencode, pi
```
<!-- /generated -->

Needs Node 20+ and git 2.19+ on `PATH`, for partial clones and worktrees. That is the whole
setup: `get` works immediately, with no config file and no prefetching.

## Examples

<!-- generated:examples -->
### Multiple repositories

Let your agent read other repositories checked out on your computer, by name.

```text
~/code/acme/
├── web/
│   └── agent-reference.local.json
├── api/
├── workers/
└── shared/
```

`web/agent-reference.local.json`

```jsonc
{
  "paths": {
    "api": {
      "path": "../api",
      "description": "Acme's API"
    },
    "workers": {
      "path": "../workers",
      "description": "Acme's background workers"
    },
    "shared": {
      "path": "../shared",
      "description": "Acme's shared code"
    }
  }
}
```

### Source code you reference

agent-reference keeps up-to-date clones of anything you want your agent to read, from GitHub
or any git remote.

`agent-reference.json`

```jsonc
{
  "git": {
    "codex": {
      "repository": "github:openai/codex",
      "description": "OpenAI's coding agent, written in Rust"
    }
  }
}
```

### Dependencies, at the version you install

Your agent reads the version this project installs, from the repository rather than from
build output. No entry is needed for that. Declare one when there is something about a
dependency worth remembering.

`agent-reference.json`

```jsonc
{
  "packages": {
    "npm:ai": {
      "version": "7.0.78",
      "description": "Read its docs/ and changelog before writing v7; v6 examples still dominate search results"
    }
  }
}
```

```text
# your agent runs this, not you
agent-reference get ai
~/.agent-reference/src/…/vercel/ai/5b64c390/packages/ai

# nothing declares electron; the lockfile is the whole answer
agent-reference get electron
~/.agent-reference/src/…/electron/electron/22bbbc9f
```

### Skills from another project

Let your agent use a skill that lives in another project, without copying it in and letting
the two drift.

`agent-reference.local.json`

```jsonc
{
  "paths": {
    "commit-style": {
      "path": "~/code/other-app/.claude/skills/commit",
      "description": "The commit style we use"
    }
  }
}
```

### Global references

References every agent on this machine can reach, from any folder that has no config of its
own.

```text
~/
├── agent-reference.local.json
├── .dotfiles/
└── code/
    ├── personal/
    ├── work/
    └── forks/
```

`~/agent-reference.local.json`

```jsonc
{
  "paths": {
    "dotfiles": "~/.dotfiles",
    "personal": "~/code/personal",
    "work": "~/code/work",
    "forks": {
      "path": "~/code/forks",
      "description": "Upstream repos I have patched"
    }
  }
}
```

### Use sets to group references

Group references so your agent can pull all of them in by name.

`agent-reference.json`

```jsonc
{
  "sets": [
    {
      "name": "coding harnesses",
      "description": "How other agents solve the same problems",
      "git": [
        "github:earendil-works/pi",
        "github:openai/codex",
        "github:anomalyco/opencode"
      ]
    }
  ]
}
```

```text
$ codex "Implement context compaction based on how
  other coding harnesses do it"

* Bash(agent-reference status --set "coding harnesses")
  ⎿ codex  git · ready · ~/.agent-reference/src/…/codex/a4f10b27
    pi     git · ready · ~/.agent-reference/src/…/pi/dcd46192

* Read(…/pi/packages/coding-agent/src/core/compaction.ts)
```

### A complex example

Every kind at once, and what your agent sees when it asks.

`agent-reference.json`

```jsonc
{
  "git": {
    "pi": "github:earendil-works/pi"
  },
  "packages": {
    "npm:ai": "7.0.78",
    "npm:electron": {
      "version": "41.0.2",
      "description": "Pinned: we ship against this build's native module ABI"
    }
  },
  // Relative, and inside this repo. A machine path belongs in
  // agent-reference.local.json, which merges over this file.
  "paths": {
    "decisions": "./docs/decisions",
    "style": "./docs/style-guide.md"
  },
  "sets": [
    {
      "name": "coding harnesses",
      "description": "How other agents solve the same problems",
      "git": [
        "github:earendil-works/pi",
        {
          "repository": "github:openai/codex",
          "ref": "v0.20.0",
          "description": "Pinned: we match this version's tool schema"
        }
      ]
    }
  ]
}
```

```text
# your agent runs this, not you
agent-reference status
agent-reference.json (shared)
  ai         npm · ready · 7.0.78 verified
  electron   npm · declared · 41.0.2
  decisions  folder · ready · ./docs/decisions
  style      file · ready · ./docs/style-guide.md

  How other agents solve the same problems
    pi     git · ready · ~/.agent-reference/src/…/pi/dcd46192
    codex  git · declared · github:openai/codex

package versions read from pnpm-lock.yaml
```
<!-- /generated -->

## The commands

<!-- generated:commands -->
You will not need these. Your agent runs them. They are here anyway.

### agent-reference help

```text
# every command, from the version you have installed
$ agent-reference help
agent-reference

Gives an agent readable upstream source on demand: dependencies at their exact
installed version, git repositories, and local files and folders, all by name. Nothing is
fetched until asked for.

Usage:
  agent-reference get <spec>... [--json]
  agent-reference versions <name> [--json]
  agent-reference status [reference...] [--set <name>] [--json]
  agent-reference clone  [reference...] [--set <name>] [--json]
  agent-reference init   [project] [--json]
  agent-reference validate
  agent-reference guide
  agent-reference schema
  agent-reference store [--prune] [--days <n>]

Commands:
  get       Materialize one reference and print its path. A spec is a configured
            reference name, a dependency name (version from the lockfile), a
            name@version, github:owner/repo, owner/repo, a git URL, or file:../repo.
            A package may carry an ecosystem prefix (npm:zod@3.22.0), in a spec
            here and as a key in the config alike; npm is the default and the
            only one resolved today. Works with no config and no project at all.
  versions  Report every version of a package this project installs, which
            workspace package installs it, and the lockfile the numbers came out
            of. Reads only; never fetches, and an unknown ecosystem or an absent
            package is an answer, not an error.
  status    Report every configured reference: scope, state, and absolute path.
            Declared-but-not-fetched is the normal state, not a problem.
  clone     Bulk prefetch every configured reference, for CI or a long flight.
  init      Survey this project and print a setup brief for the agent to carry
            out: install the skill, mine recent sessions for references worth
            declaring, write the config, and show the user the result. Reads and
            prints only; it never writes.
  validate  Check agent-reference.json and agent-reference.local.json; flags
            machine paths that do not belong in the committed file, and the
            local file being tracked by git. Exits non-zero, so CI can gate on
            it.
  guide     Print the full agent instructions for this version. The installed
            skill is a short stub that cannot go stale; everything about config
            shape and setup lives here, next to the code it describes.
  schema    Print the JSON Schema for agent-reference.json.
  store     Show what the store holds and how big it is. --prune deletes
            checkouts unused for --days (default 30) and any repository left
            with none; everything pruned is refetched on the next get.

Options:
  --set <name>    Select every reference in a set, by the set's name or an
                  unambiguous piece of its description. Repeatable.
  --json          Print machine-readable JSON.
  --prune         For store: delete stale checkouts.
  --days <n>      For store --prune: age threshold in days. Default 30.

References are declared in agent-reference.json (committed, shareable) and
agent-reference.local.json (gitignored, machine paths and private references).
Edit the JSON directly; run `agent-reference validate` after. The store lives
in ~/.agent-reference. Set AGENT_REFERENCE_STORE_DIR to move it.
```

### agent-reference status

```text
# what this project declares, and whether it is on disk yet
$ agent-reference status
agent-reference.json (shared)
  semver    npm · declared · 7.8.4
  brief     file · ready · ~/code/my-app/notes/brief.md
  notes     folder · ready · ~/code/my-app/notes
  opencode  git · declared · github:anomalyco/opencode
            "A coding agent for terminal dwellers"

package versions read from pnpm-lock.yaml

2 of 4 not fetched yet, which is normal · agent-reference get <name>
```

### agent-reference get brief

```text
# a name in, a path out. This is the one agents live in
$ agent-reference get brief
brief -> ~/code/my-app/notes/brief.md
```

### agent-reference versions semver

```text
# which versions this project installs, and where. Never fetches
$ agent-reference versions semver
semver · pnpm-lock.yaml

  7.8.4  (lockfile root)

  agent-reference get npm:semver@7.8.4
```

### agent-reference validate

```text
# check the config, including that no machine path reached the committed file
$ agent-reference validate
ok: ~/code/my-app/agent-reference.json defines 4 references in 0 sets.
```

### agent-reference schema

```text
# the JSON Schema for the config, for an editor or an agent writing one
$ agent-reference schema
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://unpkg.com/agent-reference/schema/agent-reference.schema.json",
  "title": "agent-reference config",
  "description": "Desired state for the local reference source an agent can read. Lives at agent-reference.json (committed) or agent-reference.local.json (machine-specific, gitignored). Both are read as JSON with comments (// and /* */) and trailing commas, so a note beside an entry is part of the format; keep any the file already carries when editing it.",
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "$schema": {
      "type": "string",
      "description": "URL of this schema. Optional; ignored at runtime."
    },
…
```
<!-- /generated -->

## Configure

Configuration is optional and holds what is worth remembering, not an inventory. Two files,
same format, and the examples above are what goes in them:

- `agent-reference.json`, committed. Anything fetchable and shareable: git repositories,
  package pins, sets, descriptions.
- `agent-reference.local.json`, gitignored. Machine paths and private references.
  `validate` errors if an absolute or `~/` path appears in the committed file, so personal
  paths cannot reach a commit. Entries here override same-named committed entries.

Every reference is a shorthand string or an object adding `description`. There are no
commands for editing config; agents and humans write the JSON directly, and `validate`
checks it (unknown keys are rejected with a suggestion). Both files are read as JSON with
comments (`//` and `/* */`) and trailing commas, because a file people edit by hand is a
file people annotate.

Dependencies need no entry at all: `get <name>` reads the lockfile at call time. A
`packages` entry exists only when there is something to remember about one, a pin the
resolver could not find, a description, or a place in a set, and it always carries an exact
version. Ranges, dist-tags, and a "follow the lockfile" mode are all rejected, because a
config entry has to mean the same thing on every machine and next month; `status` reports a
pin that has fallen behind what the project installs instead of silently following it.

A `packages` key is the coordinate `get` prints, with the version left out because the value
holds it: `"zod"` and `"npm:zod"` are the same entry. The prefix names the registry the
package name lives in, not the tool that installs it, so a pnpm, Yarn, or Bun project writes
`npm:` like everyone else. Which package manager this project actually uses is read from the
lockfile rather than declared, and `status` names that lockfile once at the end of its
output, because a version means nothing without the file it was checked against.

A set is a labeled list: a description saying what the collection is for, with members
declared inline the way a human would paste them. Member names derive from the path or
repository basename (override with `"name"` when two collide), the same reference may
appear in several sets, and a set can mix paths, git repositories, and packages.
`status` renders each set as its own section under its description, and `--set` selects
one by its short `name` or any unambiguous piece of its description, so "the
documentation sources" works in chat and on the command line alike.

Other keys: `registry` for a private npm registry, `cacheDir` to move the store (an `agent-reference.local.json` with `cacheDir`
inside the project keeps every checkout under a sandboxed agent's readable root).

Any directory is a project: the nearest config (walking up) anchors it, and a Node
lockfile is optional. In a Python repo, a Rust repo, or a plain folder, `paths` and
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
npm run sync-readme   # after changing the site's copy or the CLI's output
```

Tests use fixture lockfiles and local git repositories. They do not call npm or GitHub.

Everything above `## Configure` is generated into the regions this file marks with
`<!-- generated:... -->`. The tagline, the hero, the get-started copy, and the examples come
from `site/code-samples.mjs`, which [the site](https://agent-reference.dev) renders too; the
command reference comes from running the CLI against a throwaway project, so it cannot
describe a command the tool no longer has. Edit those at the source, not here. `npm test`
fails when this file is behind. Everything below is written for a README and has no
counterpart on the site.

Not supported yet: binary `bun.lockb` (generate a text `bun.lock` first), and
all-workspaces scanning for npm, Bun, and Yarn (point at the specific workspace package).
