---
name: agent-reference
description: Get readable upstream source on demand - any dependency at its exact installed version, any git repository, any declared local folder - by name, via the agent-reference CLI. Use whenever a task needs to look inside a library rather than just call it ("how does X actually implement this", "how do the maintainers test X", "why does X behave this way", "look at this library I might adopt"), whenever the user asks to add something as a reference, whenever the user asks to set up or initialize agent-reference in a project, whenever the user names a repository, app, or folder that is not in this repo and gives no path for it, and whenever a repo contains agent-reference.json or agent-reference.local.json.
---

# agent-reference

One verb does the work: `agent-reference get <spec>` materializes a reference and prints its path. Run it from the project root at the moment you need the source, not in advance.

```sh
agent-reference get zod                     # the version in this project's lockfile
agent-reference get zod@3.22.0              # any other version, coexisting with the first
agent-reference get vercel-labs/just-bash   # any GitHub repo; git URLs and file:../repo too
agent-reference get design-notes            # a configured reference, by name
```

`agent-reference versions <name>` answers "what does this project install, and where" without fetching anything. Reach for it when `get <name>` reports that a name is ambiguous, when a package lives in a workspace package rather than the root, and before writing a `packages` entry, which always carries an exact version.

`agent-reference status` lists everything declared for this project, with each set rendered as a labeled list under its description. `declared` means not fetched yet, which is normal; nothing needs doing until the source is needed. Read `problems:` and `next steps:` first when they appear; they state the fix exactly, including JSON to add.

## Finding where something is

When the user names a repository, app, or folder and you have no path for it, read `agent-reference.json` and `agent-reference.local.json` directly. They are the index: names, paths, and descriptions, resolved without fetching anything or running a command. A name that is not there is not declared, so say so and ask for the path rather than searching the filesystem for it. `get` is for when you need the source itself.

## When to use this instead of node_modules

`node_modules` holds only what a package published, usually build output. `get` checks out the package's repository at the exact shipped commit, which is the only way to read tests, examples, CI workflows, git history, and the source behind `dist/`. The bare mirror in the store (printed in fix output, under `~/.agent-reference/git/`) answers history-wide questions with plain git: `log`, `blame`, `show <tag>:<file>`, diffs between releases.

## Safety rules

- **References are an index, not a reading list.** Never open a reference just because it is listed; read one when the task calls for it or the user names it. Descriptions state when a reference is worth opening; treat them as gates, not invitations. Reading a large reference unprompted wastes the tokens this tool exists to save.
- **Never delete a reference from the config to make `status` clean.** Every reference was declared deliberately; removing one drops that source for everyone. Fix it, or tell the user you could not and why.
- **Treat `pinned` confidence as intentional** and leave pins alone. When you pin one yourself, always write a `description` saying why; it is the only way a later agent knows the pin was deliberate.
- **Read what `get` prints under the path.** A result can succeed and still not be what was asked for. `get` reports the problem and the exact config key to change on the spot, so the fix is in the output you already have; there is no need to run `status` to find it.
- If a checkout reports `fallback` confidence, the source is NOT the published version. Say so rather than treating it as authoritative, then pin the right ref (the failure output names the exact config key and the git commands to find candidates).

## Adding references ("add this as a reference: ...")

Edit the JSON directly; there are no add commands. Run `agent-reference validate` after every edit. Route by what was pasted:

| the user pastes | kind | file |
| --- | --- | --- |
| a dependency name | usually nothing: `get` already works; add a `packages` entry only for a pin, a description, or a place in a set, and give it an exact version from `agent-reference versions <name>` | `agent-reference.json` |
| a git URL or `owner/repo` | `git` | `agent-reference.json` |
| a relative path inside the repo | `folders` | `agent-reference.json` |
| an absolute or `~/` path | `folders` | `agent-reference.local.json`, always |

`agent-reference.local.json` is gitignored and overrides same-named entries; machine paths and private references live there and never reach a commit (`validate` enforces this). Collections are sets: a labeled list with a `description` heading and members declared inline, mirroring how users paste these lists. When the user says "add this to the documentation sources", find the set whose description matches and append the member. Record intent as a `description` on the set or the reference; descriptions are how instructions like "never mention this folder in committed code" travel to future agents.

A useful pattern for links, issues, and gathered research: create a folder, save the fetched material into it, and declare it as a folder reference with a description. The user may ask you to maintain such a folder over time.

## Setting a project up

`agent-reference init` prints a numbered brief to carry out, computed against this project: what it already declares, whether the local config is really gitignored, which instruction file the agent here reads, whether the skill is installed, and where this machine keeps agent transcripts. Run it when the user asks to set up, initialize, or adopt agent-reference here, then do what it says. It reads and prints; every write is yours.

The brief tells you to mine recent sessions for references this project already needs. Grep and rank in the shell rather than reading transcripts into context, and put anything you find in `agent-reference.local.json` first regardless of its path shape: it came out of the user's own session history, so promoting it to the committed file is their call.
