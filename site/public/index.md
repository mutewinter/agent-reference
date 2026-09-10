# agent-reference

**Give your agents the source**

A CLI your agent uses to read the real source of your dependencies, at the version you actually have installed, plus any repo or folder you point it at.

### Your agent, without the source

```text
* Read(node_modules/effect/dist/FileSystem.js)
  ⎿ import*as t from"./Array.js";import*as e from…
    …r=t=>e.fail(new n({module:"FileSystem",method…
    …class extends r{readFile(t){return e.suspend(…
* WebFetch(effect.website/docs/platform/file-system)
  ⎿ <!doctype html><html lang="en" class="dark">…
    …<nav class="sidebar"><a href="/docs/getting…
    …<div class="prose"><h1>FileSystem</h1><p>The…
    …<script id="__NEXT_DATA__" type="applicat…
```

### Your agent, with the source

```text
* Bash(agent-reference get effect)
  ⎿ effect@4.0.0-rc.111 -> ~/.agent-reference/src/effect@4.0.0-rc.111
* Read(…/effect@4.0.0-rc.111/packages/effect/README.md)
  ⎿ # effect
    Effect is a library for building robust, maintainable, type-safe, and…
    ## Installation
* Read(…/effect@4.0.0-rc.111/packages/effect/src/FileSystem.ts)
  ⎿ /**
     * Open a file at `path` with the specified `options`.
     *
     * **Details**
     *
     * The file handle will be automatically closed when the scope is closed.
     */
    readonly open: (
      path: string,
      options?: {
        readonly flag?: OpenFlag | undefined
        readonly mode?: number | undefined
      }
    ) => Effect.Effect<File, PlatformError, Scope>
```

*[Any questions?](https://www.youtube.com/watch?v=F0kCYP_iPtg)*

## Get started

### Let your agent set it up

TL;DR: Give your agent this prompt; it’ll handle the rest.

```text
Set this project up for agent-reference: run `npx agent-reference init` and follow the brief it prints.
```

Run `npm install -g agent-reference`, then `agent-reference init` in your project and follow the printed setup brief.

## Examples

### Your agent uses agent-reference

```text
> Implement an edit tool like pi's, using Effect v4
* Bash(agent-reference get effect)
  ⎿ effect -> ~/.agent-reference/src/effect@4.0.0-rc.111
* Bash(agent-reference get effect-docs)
  ⎿ effect-docs -> ~/.agent-reference/src/effect-website/docs/v4
* Read(…/docs/v4/platform/file-system.mdx)
* Update(agent-reference.json)
  ⎿ "pi": { "source": "github:earendil-works/pi", … }
* Bash(agent-reference get pi)
  ⎿ pi -> ~/.agent-reference/src/pi
* Read(…/pi/packages/coding-agent/src/core/tools/edit.ts)
```

`agent-reference.json`

```jsonc
{
  "references": {
    "effect": {
      "source": "npm:effect@4.0.0-rc.111",
      "description": "v4's own examples; the ones online are v3"
    },
    "effect-docs": {
      "source": "github:Effect-TS/website",
      "directory": "apps/web/src/content/docs/v4",
      "description": "The v4 docs the site does not publish"
    },
    "pi": {
      "source": "github:earendil-works/pi",
      "description": "A small terminal coding agent, in TypeScript"
    }
  }
}
```

Committed beside your `package.json`. Your agent writes it and adds to it as it goes.

### Clones repositories on demand

```text
> can remotion render a video right in the browser? if so wire it up
* Bash(agent-reference get remotion)
  ⎿ remotion -> ~/.agent-reference/src/remotion
* Read(…/remotion/packages/webcodecs/README.md)
* Update(src/Export.tsx)
> copy codex's shell approval flow into ours
* Bash(agent-reference get codex)
  ⎿ codex -> ~/.agent-reference/src/codex
* Read(…/codex/codex-rs/core/src/exec_policy.rs)
* Update(src/approval.ts)
```

`agent-reference.json`

```jsonc
{
  "references": {
    "remotion": {
      "source": "github:remotion-dev/remotion",
      "description": "Video in React, and the renderers behind it"
    },
    "codex": {
      "source": "github:openai/codex",
      "description": "OpenAI's coding agent, written in Rust"
    }
  }
}
```

### Provides references to other folders on your computer

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

### Checks out the full source for exact package versions

```text
> upgrade the chat route to ai v7
* Bash(agent-reference get ai)
  ⎿ ai@6.0.43 -> ~/.agent-reference/src/ai@6.0.43/packages/ai
* Bash(agent-reference get ai@7.0.78)
  ⎿ ai@7.0.78 -> ~/.agent-reference/src/ai@7.0.78/packages/ai
* Read(…/ai@7.0.78/packages/ai/CHANGELOG.md)
* Update(src/routes/chat.ts)
```

```text
~/.agent-reference/src/
├── ai@6.0.43/
│   └── packages/ai/
│       ├── CHANGELOG.md
│       └── src/
└── ai@7.0.78/
    └── packages/ai/
        ├── CHANGELOG.md
        └── src/
```

### Provides references for every agent on your computer

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
    "dotfiles": {
      "source": "~/.dotfiles",
      "description": "My shell, editor and git config"
    },
    "personal": {
      "source": "~/code/personal",
      "description": "Everything I write for myself"
    },
    "work": {
      "source": "~/code/work",
      "description": "Everything I write for the company"
    },
    "forks": {
      "source": "~/code/forks",
      "description": "Upstream repos I have patched"
    }
  }
}
```

### Groups references for easy mentioning

```text
> Implement context compaction based on how other harnesses do it
* Bash(agent-reference get harnesses)
  ⎿ pi -> ~/.agent-reference/src/pi
    codex -> ~/.agent-reference/src/codex
    opencode -> ~/.agent-reference/src/opencode
* Read(…/coding-agent/src/core/compaction/compaction.ts)
```

`agent-reference.json`

```jsonc
{
  "references": {
    "harnesses": {
      "description": "How other agents solve the same problems",
      "references": {
        "pi": {
          "source": "github:earendil-works/pi",
          "description": "The smallest of the three, in TypeScript"
        },
        "codex": {
          "source": "github:openai/codex",
          "description": "Rust, with the sandbox and the approval flow"
        },
        "opencode": {
          "source": "github:anomalyco/opencode",
          "description": "Its tests sit beside each tool"
        }
      }
    }
  }
}
```

## How it works

Skip this if you like: your agent handles all of it. Two projects, pinning two versions of the same dependency, sharing one store.

`web/agent-reference.json`

```jsonc
{
  "references": {
    "effect": {
      "source": "npm:effect@4.0.0-rc.111",
      "description": "v4's own examples; the ones online are v3"
    },
    "pi": {
      "source": "github:earendil-works/pi",
      "description": "A small terminal coding agent, in TypeScript"
    }
  }
}
```

`api/agent-reference.json`

```jsonc
{
  "references": {
    "effect": {
      "source": "npm:effect@3.19.4",
      "description": "v3, which this service is built on"
    }
  }
}
```

```text
~/.agent-reference/
├── git/ # one clone per repo
│   ├── Effect-TS/effect.git
│   └── earendil-works/pi.git
├── src/ # a worktree per version
│   ├── Effect-TS/effect/[[6ba41e59c827]]/ # 4.0.0-rc.111
│   ├── Effect-TS/effect/[[c41d80f2b3e5]]/ # 3.19.4
│   └── earendil-works/pi/[[dcd461925db2]]/ # tip of main
└── state/ # one file per project
    ├── web-a3f81c0426.json
    └── api-5c02e7d1b8.json
```

All of it is cache. Delete any of it and the next get rebuilds what it needs, mirror first, network last. agent-reference store --prune drops the checkouts that have gone unused.

### The format

One `references` map, from the name your agent asks for to where that source comes from. Every value is an object holding either `source` or `references`: the first is a reference, the second is a set. That is the only rule.

| a value may be | |
| --- | --- |
| `{ "source": "…", "description": "…" }` | a reference: one name, one source |
| `{ "description": "…", "references": { … } }` | a set: one name, several references |

| a source may be | |
| --- | --- |
| `"./docs/decisions"` | a folder or a file, read where it lives |
| `"github:openai/codex"` | a repository, at its default branch |
| `"openai/codex#v0.20.0"` | the same, at a tag, branch, or commit |
| `"npm:zod@3.22.0"` | a package, at an exact version |

A set is a reference that resolves to more than one path, so its name works everywhere a name works: `get harnesses` takes all of them, `status harnesses` reports the group. The description is required on both: a name is what the agent already has, and what it needs is when the thing behind it is worth opening.

### The commands

You will not need these. Your agent runs them. They are here anyway.

#### agent-reference help

```text
# every command, from the version you have installed
$ agent-reference help
agent-reference

Gives an agent readable upstream source on demand: dependencies at their exact
installed version, git repositories, and local files and folders, all by name.
Nothing is fetched until asked for.

Usage:
  agent-reference get <spec>... [--json | --path]
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
  guide     Print the full agent instructions for this version. What goes in the
            config is here and not in this help.
  schema    Print the JSON Schema for agent-reference.json.
  store     Show what the store holds and how big it is. --prune deletes
            checkouts unused for --days (default 30).

  <command> --help explains one command on its own.

Options:
  --json          Print machine-readable JSON.
  --path          For get: the resolved paths alone, one per line, for a shell
                  variable. Problems still print, on stderr.
  --prune         For store: delete stale checkouts.
  --days <n>      For store --prune: age threshold in days. Default 30.

References are declared in agent-reference.json (committed, shareable) and
agent-reference.local.json (gitignored, machine paths and private references),
as one "references" map from a name to a source. Every value is an object
holding either "source" or "references"; the second is a set: a name that
stands for several, and that get and status take like any other name. Edit the
JSON directly; run `agent-reference validate` after. The store lives in
~/.agent-reference. Set AGENT_REFERENCE_STORE_DIR to move it.
```

#### agent-reference status

```text
# what this project declares, and whether it is on disk yet
$ agent-reference status
agent-reference.json (shared)
  semver    npm · declared · 7.8.4
            "Read its range grammar before writing one by hand"
  brief     file · ready · ~/code/my-app/notes/brief.md
            "What this project is for, in one page"
  notes     folder · ready · ~/code/my-app/notes
            "Everything written down while building this"
  opencode  git · declared · github:anomalyco/opencode
            "A coding agent for terminal dwellers"

package versions read from pnpm-lock.yaml

2 of 4 not fetched yet, which is normal · agent-reference get <name>
```

#### agent-reference get brief

```text
# a name in, a path out. This is the one agents live in
$ agent-reference get brief
brief -> ~/code/my-app/notes/brief.md
```

## More

- [llms.txt](https://agent-reference.dev/llms.txt): what this domain publishes for agents, and when to reach for the tool at all
- [Agent skill](https://agent-reference.dev/.well-known/agent-skills/agent-reference/SKILL.md): the one verb, when to reach for it, and the safety rules. `npx skills add https://agent-reference.dev` installs it into a harness from this domain
- [Config JSON Schema](https://agent-reference.dev/schema/agent-reference.schema.json): what `agent-reference.json` and `agent-reference.local.json` are checked against. Read it before writing one; `agent-reference schema` prints the same document from the installed CLI
- [Source](https://github.com/mutewinter/agent-reference): the CLI, the tests that specify it, and `docs/decisions/` for why the design is what it is
- [Package](https://www.npmjs.com/package/agent-reference): released versions. `npx agent-reference init` sets a project up without installing anything first
