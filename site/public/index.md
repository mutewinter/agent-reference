# agent-reference

**Give your agents the source**

## How it works

```text
> Set this project up for agent-reference: run `npx agent-reference init` and follow the brief it prints.
* Bash(npx agent-reference init)
  ⎿ 2,723 sessions across claude-code, codex and opencode
* Read(pnpm-lock.yaml)
  ⎿ effect 4.0.0-rc.111
* Write(agent-reference.json)
  ⎿ 1 reference
* Bash(rg -o 'github:\S+' ~/.claude | sort | uniq -c)
  ⎿ 41 Effect-TS/website
    12 earendil-works/pi
* Update(agent-reference.json)
  ⎿ 3 references
```

`agent-reference.json`

```jsonc
{
  "references": {
    "effect": {
      "source": "npm:effect@4.0.0-rc.111",
      "description": "Every example online is still v3"
    },
    "effect-docs": {
      "source": "github:Effect-TS/website",
      "directory": "apps/web/src/content/docs/v4",
      "description": "The v4 docs the site does not publish"
    },
    "pi": "github:earendil-works/pi"
  }
}
```

Your agent maintains this file, adding references as it needs them and cloning anything new on first use.

### Now use your agent normally

```text
> Implement an edit tool like pi's, using Effect v4
* Skill(agent-reference)
  ⎿ Launching skill: agent-reference
* Bash(agent-reference get pi)
  ⎿ ~/.agent-reference/src/…/earendil-works/pi/dcd461925db2
* Read(…/packages/coding-agent/src/core/tools/edit.ts)
  ⎿ Read 461 lines
* Bash(agent-reference get effect-docs)
  ⎿ ~/.agent-reference/src/…/website/6ee985b191a6/…/docs/v4
* Read(…/docs/v4/platform/file-system.mdx)
  ⎿ Read 115 lines
```

From here your agent reads the real source of the libraries you depend on, and checks out the repositories it needs, at the version this project installs.

## Get started

### Let your agent set it up

```text
Set this project up for agent-reference: run `npx agent-reference init` and follow the brief it prints.
```

Instructs your agent to install the skill and set up a config for the folders, repositories, and packages you often reference.

### Install it yourself

```sh
npm install -g agent-reference
cd ~/code/acme/web
claude "Help me set up agent-reference"       # or codex, opencode, pi
```

## Examples

### Reference other folders on your computer

By name, and read where they already are, so there is nothing to keep in sync.

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
  "references": {
    "api": {
      "source": "../api",
      "description": "Acme's API"
    },
    "workers": {
      "source": "../workers",
      "description": "Acme's background workers"
    },
    "shared": {
      "source": "../shared",
      "description": "Acme's shared code"
    }
  }
}
```

### Reference public or private repos, automatically cloned

From GitHub or any git remote, kept up to date, and fetched the first time your agent asks for it.

`agent-reference.json`

```jsonc
{
  "references": {
    "codex": {
      "source": "github:openai/codex",
      "description": "OpenAI's coding agent, written in Rust"
    }
  }
}
```

### Check out source for exact npm versions

Your agent reads the version this project installs, from the repository rather than from build output. No entry is needed for that. Declare one when there is something about a dependency worth remembering.

`agent-reference.json`

```jsonc
{
  "references": {
    "ai": {
      "source": "npm:ai@7.0.78",
      "description": "Read its docs/ and changelog before writing v7; v6 examples still dominate search results"
    }
  }
}
```

```text
# your agent runs this, not you
agent-reference get ai
~/.agent-reference/src/…/vercel/ai/5b64c3901f7e/packages/ai

# nothing declares electron; the lockfile is the whole answer
agent-reference get electron
~/.agent-reference/src/…/electron/electron/22bbbc9fa06d
```

### Reference a skill from another project

Let your agent use a skill that lives in another project, without copying it in and letting the two drift.

`agent-reference.local.json`

```jsonc
{
  "references": {
    "commit-style": {
      "source": "~/code/other-app/.claude/skills/commit",
      "description": "The commit style we use"
    }
  }
}
```

### Define references for every agent on your computer

References every agent on this machine can reach, from any folder that has no config of its own.

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
  "references": {
    "dotfiles": "~/.dotfiles",
    "personal": "~/code/personal",
    "work": "~/code/work",
    "forks": {
      "source": "~/code/forks",
      "description": "Upstream repos I have patched"
    }
  }
}
```

### Group references under one name

A set is a reference that resolves to more than one path. Its key is its name, like any other, so one get takes all of them.

`agent-reference.json`

```jsonc
{
  "references": {
    "harnesses": {
      "description": "How other agents solve the same problems",
      "references": [
        "github:earendil-works/pi",
        "github:openai/codex",
        "github:anomalyco/opencode"
      ]
    }
  }
}
```

```text
$ codex "Implement context compaction based on how
  other coding harnesses do it"

* Bash(agent-reference get harnesses)
  ⎿ pi        ~/.agent-reference/src/…/earendil-works/pi/dcd461925db2
    codex     ~/.agent-reference/src/…/openai/codex/a4f10b27e83c
    opencode  ~/.agent-reference/src/…/anomalyco/opencode/7b0e5c31d4a9

* Read(…/pi/packages/coding-agent/src/core/compaction/compaction.ts)
```

### A complex example

Every kind of source in one map, a set among them, and what your agent sees when it asks.

`agent-reference.json`

```jsonc
{
  "references": {
    "ai": "npm:ai@7.0.78",
    "electron": {
      "source": "npm:electron@41.0.2",
      "description": "Pinned: we ship against this build's native module ABI"
    },
    // Relative, and inside this repo. A machine path belongs in
    // agent-reference.local.json, which merges over this file.
    "decisions": "./docs/decisions",
    "style": "./docs/style-guide.md",

    // A set is a reference that resolves to several paths. Its key is its
    // name, so `get harnesses` takes all of them at once.
    "harnesses": {
      "description": "How other agents solve the same problems",
      "references": [
        "github:earendil-works/pi",
        {
          "source": "github:openai/codex",
          "ref": "v0.20.0",
          "description": "Pinned: we match this version's tool schema"
        }
      ]
    }
  }
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

  harnesses  set · 2 references
             "How other agents solve the same problems"
    pi     git · ready · ~/.agent-reference/src/…/pi/dcd461925db2
    codex  git · declared · github:openai/codex

package versions read from pnpm-lock.yaml
```

## Where the source lands

Skip this if you like: your agent handles all of it. It is here for anyone who wants to see where the source it reads lands. Two projects, pinning two versions of the same dependency, sharing one store.

`web/agent-reference.json`

```jsonc
{
  "references": {
    "effect": "npm:effect@4.0.0-rc.111",
    "pi": "github:earendil-works/pi"
  }
}
```

`api/agent-reference.json`

```jsonc
{
  "references": {
    "effect": "npm:effect@3.19.4"
  }
}
```

```text
~/.agent-reference/
├── git/ # one clone per repository
│   ├── github.com/Effect-TS/effect.git
│   └── github.com/earendil-works/pi.git
├── src/ # one checked-out worktree per version
│   ├── github.com/Effect-TS/effect/6ba41e59c827/
│   ├── github.com/Effect-TS/effect/c41d80f2b3e5/
│   └── github.com/earendil-works/pi/dcd461925db2/
└── state/ # one file per project
    ├── web-a3f81c0426.json
    └── api-5c02e7d1b8.json
```

All of it is cache. Delete any of it and the next get rebuilds what it needs, mirror first, network last. agent-reference store --prune drops the checkouts that have gone unused.

## The format

One `references` map, from the name your agent asks for to where that source comes from. An object with `source` is a reference; an object with `references` is a set. That is the only rule.

| a value may be | |
| --- | --- |
| `"github:openai/codex"` | a reference: one name, one source |
| `{ "source": "…", "ref": "…" }` | a reference, with more said about it |
| `["openai/codex", "./docs"]` | a set: one name, several sources |
| `{ "references": ["…", "…"] }` | a set, with a heading |

| a source may be | |
| --- | --- |
| `"./docs/decisions"` | a folder or a file, read where it lives |
| `"github:openai/codex"` | a repository, at its default branch |
| `"openai/codex#v0.20.0"` | the same, at a tag, branch, or commit |
| `"npm:zod@3.22.0"` | a package, at an exact version |

A set is a reference that resolves to more than one path, so its name works everywhere a name works: `get harnesses` takes all of them, `status harnesses` reports the group. There is no flag for it and no second namespace.

## The commands

You will not need these. Your agent runs them. They are here anyway.

### agent-reference help

```text
# every command, from the version you have installed
$ agent-reference help
agent-reference

Gives an agent readable upstream source on demand: dependencies at their exact
installed version, git repositories, and local files and folders, all by name.
Nothing is fetched until asked for.

Usage:
  agent-reference get <spec>... [--json]
  agent-reference versions <name> [--json]
  agent-reference status [name...] [--json]
  agent-reference clone  [name...] [--json]
  agent-reference init   [project] [--json]
  agent-reference validate
  agent-reference guide
  agent-reference schema
  agent-reference store [--prune] [--days <n>]

Commands:
  get       Materialize one reference and print its path. A spec is a configured
            name, a dependency name (version from the lockfile), a name@version,
            github:owner/repo, owner/repo, a git URL, or a path. A package may
            carry an ecosystem prefix (npm:zod@3.22.0); npm is the default and
            the only one resolved today. Works with no config at all.
  versions  Report every version of a package this project installs, which
            workspace package installs it, and the lockfile the numbers came out
            of. Reads only; never fetches.
  status    Report every configured reference: source, state, and absolute path.
            Declared-but-not-fetched is the normal state, not a problem.
  clone     Bulk prefetch every configured reference, for CI or a long flight.
  init      Survey this project and print a setup brief for the agent to carry
            out. Reads and prints only; it never writes.
  validate  Check agent-reference.json and agent-reference.local.json; flags
            machine paths that do not belong in the committed file, and the
            local file being tracked by git. Exits non-zero, so CI can gate on
            it.
  guide     Print the full agent instructions for this version.
  schema    Print the JSON Schema for agent-reference.json.
  store     Show what the store holds and how big it is. --prune deletes
            checkouts unused for --days (default 30).

  <command> --help explains one command on its own.

Options:
  --json          Print machine-readable JSON.
  --prune         For store: delete stale checkouts.
  --days <n>      For store --prune: age threshold in days. Default 30.

References are declared in agent-reference.json (committed, shareable) and
agent-reference.local.json (gitignored, machine paths and private references),
as one "references" map from a name to a source. A value that is an array, or an
object with a "references" array, is a set: a name that stands for several, and
that get and status take like any other name. Edit the JSON directly; run
`agent-reference validate` after. The store lives in ~/.agent-reference. Set
AGENT_REFERENCE_STORE_DIR to move it.
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
  "$id": "https://unpkg.com/agent-reference@1/schema/agent-reference.schema.json",
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

## More

- [llms.txt](https://agent-reference.dev/llms.txt): what this domain publishes for agents, and when to reach for the tool at all
- [Agent skill](https://agent-reference.dev/.well-known/agent-skills/agent-reference/SKILL.md): the one verb, when to reach for it, and the safety rules. `npx skills add https://agent-reference.dev` installs it into a harness from this domain
- [Config JSON Schema](https://agent-reference.dev/schema/agent-reference.schema.json): what `agent-reference.json` and `agent-reference.local.json` are checked against. Read it before writing one; `agent-reference schema` prints the same document from the installed CLI
- [Source](https://github.com/mutewinter/agent-reference): the CLI, the tests that specify it, and `docs/decisions/` for why the design is what it is
- [Package](https://www.npmjs.com/package/agent-reference): released versions. `npx agent-reference init` sets a project up without installing anything first
