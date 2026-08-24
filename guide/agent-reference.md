# agent-reference guide

The instructions the skill on disk is too short to carry, printed by the installed CLI so they always describe the version running on this machine.

## Reading what a project declares

`agent-reference versions <name>` answers "what does this project install, and where" without fetching anything. It names the lockfile the numbers came out of, so a version is never separated from its source. Reach for it when `get <name>` reports that a name is ambiguous, when a package lives in a workspace package rather than the root, and before writing a `packages` entry, which always carries an exact version.

`agent-reference status` lists everything declared for this project, with each set rendered as a labeled list under its description. Every line names where that reference comes from, so the kind column reads `npm`, `git`, `file`, or `folder`, and the lockfile package versions were read from is stated once at the end. `declared` means not fetched yet, which is normal; nothing needs doing until the source is needed. Read `problems:` and `next steps:` first when they appear; they state the fix exactly, including JSON to add.

## When to use this instead of node_modules

`node_modules` holds only what a package published, usually build output. `get` checks out the package's repository at the exact shipped commit, which is the only way to read the full `README`, `docs/`, examples, tests, CI workflows, the changelog and its migration guides, git history, and the source behind `dist/`. That list is why a checkout answers ordinary API questions too, not just archaeology: the published build carries the code and almost none of the prose, and a docs site describes whatever version is current rather than the one this project installs. The path it prints is a git worktree, so the repository's history is already there: `git -C <path> log`, `show <tag>:<file>`, `blame`, and diffs between releases all run against the whole repository rather than the one commit checked out. Mirrors are cloned without file contents, so commit metadata and `--name-only` are free and offline, while `-p`, `--stat`, `blame`, and `-S` fetch what they need the first time they run.

## Adding references ("add this as a reference: ...")

Edit the JSON directly; there are no add commands. Both config files are read as JSON with comments (`//` and `/* */`) and trailing commas, so preserve any note the file already carries rather than reformatting it away, and write one yourself when an entry needs a caveat that is not a `description`. Run `agent-reference validate` after every edit. Route by what was pasted:

| the user pastes | kind | file |
| --- | --- | --- |
| a dependency name | usually nothing: `get` already works; add a `packages` entry only for a pin, a description, or a place in a set, and give it an exact version from `agent-reference versions <name>` | `agent-reference.json` |
| a coordinate `get` printed, `npm:zod@3.22.0` | `packages`, keyed `npm:zod` with the version as the value; the key is the coordinate without its version | `agent-reference.json` |
| a git URL or `owner/repo` | `git` | `agent-reference.json` |
| a git URL naming one package inside a monorepo | `git`, with `directory` set to that subtree | `agent-reference.json` |
| a `file:` path to a checkout on this machine | `git` | `agent-reference.local.json`, always |
| a relative path inside the repo | `paths` | `agent-reference.json` |
| an absolute or `~/` path | `paths` | `agent-reference.local.json`, always |

`agent-reference.local.json` is gitignored and overrides same-named entries; machine paths and private references live there and never reach a commit. `validate` enforces that mechanically: a machine path in the committed file is an error whichever key holds it, whether a `paths` entry, a `file:` repository under `git`, or `cacheDir`, and so is `agent-reference.local.json` itself being tracked by git. `status` reports the same path leaks as warnings, so the config gets checked on a command you already run. Collections are sets: a labeled list with a `description` heading and members declared inline, mirroring how users paste these lists. When the user says "add this to the documentation sources", find the set whose description matches and append the member. Record intent as a `description` on the set or the reference; descriptions are how instructions like "never mention this folder in committed code" travel to future agents.

A `git` reference checks out a whole repository. When only one subtree of it is worth reading, set `directory` to that path and the reference resolves to the subtree while `status` still reports the checkout root alongside it. Several subtrees of one monorepo are several entries with distinct names, not one nested entry: the store keys a checkout on repository and commit, so they share one clone, and each gets its own description and its own `ref`. A `directory` that is not in the checkout is an error naming the path to fix, because upstream reorganizations are the normal cause and a silent fall back to the repository root would hand you the wrong scope.

A `packages` key is a coordinate with the version left out, because the value holds it. `"zod"` and `"npm:zod"` are the same reference; the prefix names the registry the package name lives in, not the tool that installs it, so a pnpm or bun project writes `npm:` like everyone else. Write it either way, but keep one spelling per package: two keys for one package that disagree about the version are refused. Only npm resolves today, and a key naming another ecosystem fails at parse time rather than becoming a reference nothing can materialize.

A `paths` entry may name a file as easily as a folder: one note out of a vault, a checklist, a spec. The config declares the path and nothing more, so `status` reports whether it is a `file` or a `folder` from what it finds on disk, and a folder that later becomes a file needs no config change.

A useful pattern for links, issues, and gathered research: create a folder, save the fetched material into it, and declare it as a path reference with a description. The user may ask you to maintain such a folder over time.

## Setting a project up

`agent-reference init` prints a numbered brief to carry out, computed against this project: what it already declares, whether the local config is really gitignored or has already been committed, which instruction file the agent here reads, whether the skill is installed, and where this machine keeps agent transcripts. Run it when the user asks to set up, initialize, or adopt agent-reference here, then do what it says. It reads and prints; every write is yours.

The brief tells you to mine recent sessions for references this project already needs. Grep and rank in the shell rather than reading transcripts into context, and put anything you find in `agent-reference.local.json` first regardless of its path shape: it came out of the user's own session history, so promoting it to the committed file is their call.
