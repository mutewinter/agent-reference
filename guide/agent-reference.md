# agent-reference guide

The instructions the skill on disk is too short to carry, printed by the installed CLI so they always describe the version running on this machine.

## Reading what a project declares

`agent-reference versions <name>` answers "what does this project install, and where" without fetching anything. It names the lockfile the numbers came out of, so a version is never separated from its source. Reach for it when `get <name>` reports that a name is ambiguous, when a package lives in a workspace package rather than the root, and before writing a package reference, which always carries an exact version.

`agent-reference status` lists everything declared for this project. Every line names where that reference comes from, so the kind column reads `npm`, `git`, `file`, or `folder`, and the lockfile package versions were read from is stated once at the end. A set is printed under the name you ask for it by, with its description beneath. `declared` means not fetched yet, which is normal; nothing needs doing until the source is needed. Read `problems:` and `next steps:` first when they appear; they state the fix exactly, including JSON to add.

## When to use this instead of node_modules

`node_modules` holds only what a package published, usually build output. `get` checks out the package's repository at the exact shipped commit, which is the only way to read the full `README`, `docs/`, examples, tests, CI workflows, the changelog and its migration guides, git history, and the source behind `dist/`. That list is why a checkout answers ordinary API questions too, not just archaeology: the published build carries the code and almost none of the prose, and a docs site describes whatever version is current rather than the one this project installs. The path it prints is a git worktree, so the repository's history is already there: `git -C <path> log`, `show <tag>:<file>`, `blame`, and diffs between releases all run against the whole repository rather than the one commit checked out. Mirrors are cloned without file contents, so commit metadata and `--name-only` are free and offline, while `-p`, `--stat`, `blame`, and `-S` fetch what they need the first time they run.

## Holding the path in a variable

`get --path` prints the resolved paths alone, one per line, and nothing else. It is what to use whenever the path is going into a shell variable or a loop rather than onto the screen:

```sh
EL=$(agent-reference get electron --path)
rg -n "createThumbnailFromPath" "$EL/docs/api/native-image.md"
```

Do not cut the path out of the default line. That line names the spec before the path and the confidence after it, so `sed 's/.*-> //'` leaves the trailing parenthetical inside the variable and the next command opens a directory whose name carries `(unverified, tag ...)`. `tail -1` is worse: a problem prints under the path, so on the result that most needs reading it returns the `fix:` sentence instead of a path.

Problems still print under `--path`, on stderr, so a `$(...)` capture takes the path and leaves the warning in front of you. Redirecting stderr to `/dev/null` throws away the only thing that says a checkout is not the version you asked for.

## The config is one map

Both files hold a single `references` object, from the name an agent asks for to where that source comes from:

```jsonc
{
  "references": {
    "decisions": {
      "source": "./docs/decisions",
      "description": "Why this project is shaped the way it is, one file per decision"
    },
    "pi": {
      "source": "github:earendil-works/pi",
      "description": "A small terminal coding agent, in TypeScript"
    },
    "zod": {
      "source": "npm:zod@3.22.0",
      "description": "The schema library this project validates with, v3's API"
    }
  }
}
```

Every value is an object, and it holds either `source` or `references`: the first is a reference, the second is a set. Both carry a `description`, which is required. What kind of reference it is follows from the source rather than from a declaration, the same way `status` reports `file` or `folder` from what it finds on disk:

| source shape | reads as | example |
| --- | --- | --- |
| `./x`, `../x`, `~/x`, `/x` | a path on this machine, read where it lives | `"./docs/decisions"` |
| `github:owner/repo`, `owner/repo` | a repository, at its default branch | `"github:openai/codex"` |
| either, with `#ref` | a repository at a tag, branch, or commit | `"openai/codex#v0.20.0"` |
| a git URL, `git@`, `ssh:`, `https://…git`, `file://` | any git remote | `"https://git.acme.dev/ui.git"` |
| `npm:name@version`, `name@version` | a package at an exact version | `"npm:zod@3.22.0"` |

A path source has to start with `./`, `../`, `~/` or `/`. `docs/decisions` is a valid `owner/repo` shorthand, so the prefix is what tells the two apart; `validate` warns when a shorthand names a folder that is also in this project.

The other keys are optional and say how to reach the source:

```jsonc
{
  "references": {
    "electron": {
      "source": "npm:electron@42.3.3",
      "directory": ".",
      "description": "The desktop runtime this app ships in; docs/api/ documents every BrowserWindow option. directory is \".\" because the root manifest is named @electron-ci/dev-root."
    },
    "effect-docs": {
      "source": "github:Effect-TS/website",
      "directory": "apps/web/src/content/docs/v4"
    }
  }
}
```

- `ref` pins the checkout. On a package source it overrides version resolution, which is what a repository whose tags do not match its published versions needs. On a path source it is refused: a checkout read where it lives has no other ref.
- `repository` overrides what the registry reported. Package sources only, since a repository source already names its own remote.
- `directory` names the subtree worth reading in a monorepo. The reference resolves to that subtree while `status` still reports the checkout root. Several subtrees of one repository are several entries with distinct names; they share one clone, and each gets its own `ref` and description. A `directory` that is not in the checkout is an error naming the path to fix, because upstream reorganizations are the usual cause and a silent fall back to the root would hand you the wrong scope.
- `description` is required, and it is the whole value of a reference to a future agent. Say what the source is, in terms that stay true: what a reader finds inside it, and whose it is. Keep it short, and say what the name does not already carry. Two things beyond the content earn their place: why a pin exists, and user policy ("never name this folder in committed code"). It is not an instruction to the reader and not a status report on the project, because both go stale while the source does not: `"OpenAI's coding agent, written in Rust"` outlives `"read it before writing v7"`, and an agent judges a durable description against the task in front of it rather than against a trigger someone guessed at in advance.

## Sets are references that resolve to several paths

A set has a name and members, and the name works everywhere a reference's name works. `get harnesses` materializes all of them, `status harnesses` reports the group. There is no separate flag and no separate namespace.

```jsonc
{
  "references": {
    "harnesses": {
      "description": "How other agents solve the same problems",
      "references": {
        "opencode": {
          "source": "github:anomalyco/opencode",
          "description": "A terminal coding agent whose tests sit beside each tool"
        },
        "codex": {
          "source": "github:openai/codex",
          "ref": "v0.20.0",
          "description": "Pinned: we match this version's tool schema"
        },
        "opencode-fork": {
          "source": "github:mutewinter/opencode",
          "description": "Our patches, and what upstream has not taken yet"
        }
      }
    }
  }
}
```

A set's `description` is the heading `status` prints under its name. Its members are a map keyed by name, exactly as the outer one is, so a member is written the same way a top-level entry is and every name `get` accepts is somewhere in the file. Members may be any kind, so one set can hold a package, a repository and a folder together. A set holds references, never other sets. When the user says "add this to the documentation sources", find the set whose name or description matches and add the member to its map.

Names are one namespace: a set may not take a reference's name, and two entries pointing somewhere different may not share one. The parser refuses both rather than leaving an ambiguity for every later lookup to rediscover. The same source listed in two sets is repetition, not a conflict, and becomes one reference belonging to both.

## Adding references ("add this as a reference: ...")

Edit the JSON directly; there are no add commands. Both config files are read as JSON with comments (`//` and `/* */`) and trailing commas, so preserve any note the file already carries rather than reformatting it away, and write one yourself when an entry needs a caveat that is not a `description`. Run `agent-reference validate` after every edit. Route by what was pasted:

Every entry is `"<name>": { "source": …, "description": … }`, wherever it lands.

| the user pastes | source to write | file |
| --- | --- | --- |
| a dependency name | usually nothing: `get` already works. Add an entry only for a pin, a description, or a place in a set, and give it an exact version from `agent-reference versions <name>` | `agent-reference.json` |
| a coordinate `get` printed, `npm:zod@3.22.0` | that coordinate, verbatim | `agent-reference.json` |
| a git URL or `owner/repo` | that, verbatim | `agent-reference.json` |
| a git URL naming one package inside a monorepo | that, with `directory` set to the subtree | `agent-reference.json` |
| a relative path inside the repo | `./the/path` | `agent-reference.json` |
| an absolute or `~/` path | the path as given | `agent-reference.local.json`, always |
| a checkout on this machine | the path as given, which is read live | `agent-reference.local.json`, always |

`agent-reference.local.json` is gitignored and overrides same-named entries; machine paths and private references live there and never reach a commit. `validate` enforces that mechanically: a machine path in the committed file is an error whichever entry holds it, whether a path source, a `file://` repository, or `cacheDir`, and so is `agent-reference.local.json` itself being tracked by git. `status` reports the same path leaks as warnings, so the config gets checked on a command you already run.

A local checkout is read where it lives, so it stays current and you see uncommitted work. A `file://` URL with an absolute path clones it into the store at a commit instead, which is a snapshot and goes stale; reach for it only when you need a fixed point.

A path may name a file as easily as a folder: one note out of a vault, a checklist, a spec. The config declares the path and nothing more, so `status` reports whether it is a `file` or a `folder` from what it finds on disk, and a folder that later becomes a file needs no config change.

A useful pattern for links, issues, and gathered research: create a folder, save the fetched material into it, and declare it as a path reference with a description. The user may ask you to maintain such a folder over time.

## Setting a project up

`agent-reference init` prints a numbered brief to carry out, computed against this project: what it already declares, whether the local config is really gitignored or has already been committed, which instruction file the agent here reads, whether the skill is installed, and where this machine keeps agent transcripts. Run it when the user asks to set up, initialize, or adopt agent-reference here, then do what it says. It reads and prints; every write is yours.

The brief tells you to mine recent sessions for references this project already needs. Grep and rank in the shell rather than reading transcripts into context, and put anything you find in `agent-reference.local.json` first regardless of its path shape: it came out of the user's own session history, so promoting it to the committed file is their call.
