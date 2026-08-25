# References map followups

Status: bugs 1 through 7 fixed, the eval harness fixed, three decisions taken. What is left is fixture work and one decision record, marked per item below. Everything here came out of reviewing [the one-references-map change](../../decisions/2026-08-25-one-references-map.md) and running all four eval suites against it. The repo is green as found: 149/149 tests, lint, types, and format all pass, so none of this is caught by an existing gate.

The change itself holds up. An agent handed only the printed brief, the served guide, and the schema wrote a correct one-map config with six references of mixed kinds on the first try. What follows is the residue: patch producers that were not migrated with the rest, one invariant that is enforced in the parser and dropped in the merge, and four eval fixtures that no longer measure what they claim to.

## Bugs

### 1. `get` prints a config patch the parser rejects

[src/get.ts:433](../../../src/get.ts) still emits the pre-change shape:

```json
{ "packages": { "oddtags": { "version": "9.9.9", "ref": "<commit-or-tag>" } } }
```

`formatGetResults` prints it under `add to agent-reference.json:`, so an agent that hits a fallback checkout copies it in and gets `packages was folded into one "references" map`. Confirmed by feeding that literal object to `parseConfig`. Every other producer was migrated: [src/status.ts:212](../../../src/status.ts), [src/problems.ts:94](../../../src/problems.ts), [src/problems.ts:140](../../../src/problems.ts).

The covering test asserts only `/commit-or-tag/` against the stringified patch ([tests/workspace-resolution.test.ts:219](../../../tests/workspace-resolution.test.ts)), which is why the suite is green. The structural fix is a test that round-trips every emitted `configPatch` through `parseConfig`, not just a correction at that line.

### 2. One name means one thing, per file only

`pushReference` and `assertSetNamesAreFree` run inside `parseConfig`. `mergeConfigs` and `mergeByName` ([src/config.ts:405](../../../src/config.ts)) never re-check, and `mergeByName` merges each kind's array separately. Four states, all reproduced, all of which `validate` calls clean:

| committed | local | result |
| --- | --- | --- |
| set `harnesses` | reference `harnesses` | both exist; the set wins every lookup and the reference is unreachable |
| reference `pi` | set `pi` | the local file silently redirects a committed name to a different repository |
| package `zod` | path `zod` | two references, one name; `get` returns the package, `status` prints two rows |
| set member `pi` | reference `pi` | `get pi` gives the local path, `get harnesses` gives the committed repository |

Row three also falsifies a rule stated in three places. [src/status.ts:169](../../../src/status.ts) and [src/get.ts:378](../../../src/get.ts) both say a local entry wins by name, and the guide says the local file overrides same-named entries, but override only happens within a kind.

Fix: run the merged config back through the same conflict checks the parser uses, and report a cross-file collision with both filenames named.

### 3. A set split across both files renders twice

Local extending a committed set parses fine and is a reasonable thing to want. `scopeSection` in [src/status-format.ts](../../../src/status-format.ts) filters members by scope and reprints the heading per section, so a two-member set shows as two blocks, each captioned `set · 1 reference` and each carrying the full description. `--json` reports it correctly as one set with two members.

### 4. The drift patch deletes the entry it is patching

Given an entry carrying `source`, `ref`, `directory`, and a description that explains the pin, `status` emits:

```
fix:   If the pin is deliberate, say so in references.tiny-invariant.description. Otherwise set
       references.tiny-invariant in agent-reference.json to npm:tiny-invariant@1.3.3
patch: {"references":{"tiny-invariant":"npm:tiny-invariant@1.3.3"}}
```

The fix text points at a description the patch beside it would destroy, along with the `ref` and the `directory`. [src/status.ts:161](../../../src/status.ts) comments that everything else about the entry stays as written, which is what the code does not do. The covering test uses a bare-string entry, so it never sees this. Emitting `{ "source": "npm:tiny-invariant@1.3.3" }` survives a shallow merge.

### 5. `missingDirectoryProblem`'s patch has no `source`

`{ "references": { "pi": { "directory": "<path-in-repository>" } } }` does not parse standalone, and the entry it patches is usually a bare string, so there is no key-level merge to perform against it. Only the prose says what to do.

### 6. Six messages still name the old keys

[src/get.ts:174](../../../src/get.ts) says `paths.`, [src/get.ts:226](../../../src/get.ts) and [src/get.ts:447](../../../src/get.ts) say `packages.`, [src/git.ts:700](../../../src/git.ts) says `packages.`, [src/status.ts:468](../../../src/status.ts) says `packages.`, and [src/core.ts:59](../../../src/core.ts) says "Add packages, paths, or git entries to".

[src/get.ts:226](../../../src/get.ts) is also dead. `resolveConfigPackageReferences` maps every `config.packages` entry one to one, so that lookup cannot miss.

### 7. `.` and `..` are not paths

`ROOTED_PATH` in [src/source.ts](../../../src/source.ts) requires a separator, so `"here": "."` classifies as a package and fails with `its source is the package .`. Meanwhile `classifyConfiguredPath` in [src/config-hygiene.ts](../../../src/config-hygiene.ts) already treats `..` as a valid path that escapes the repo. The two files disagree about whether it is a path at all.

## API surface

### Description-substring selection is new, undocumented, and half-wired

`matchDescription` ([src/sets.ts:122](../../../src/sets.ts)) landed in the same commit as the map. A selector that names nothing and describes exactly one thing resolves to it, so `status <word-from-a-description>` works. `get` does not use `selectionFilter` at all: it falls through to `classifySource` and asks the registry for a package by that name. Same word, two behaviors, one of them a network fetch of an unrelated package. It is absent from the guide and from every eval.

Either wire it into `get` and document it, or drop it. Dropping is the recommendation: a fuzzy match sits badly in an API whose pitch is that a name means exactly one thing.

Related, and worth fixing either way: an ambiguous description match returns null, so the caller reports `Nothing matched reference "harness"` when in fact two things matched. The message should name them.

### Smaller ones

- A reference declared twice takes whichever description parses first, silently and by document order, while a differing source is a hard error. Either make it a conflict or make it deterministic.
- An empty `name` on a set member is silently defaulted to the basename; an empty top-level key is an error.
- `github:a/b` and `github:a/b/` are two references and two clones. Nothing normalizes the repository at parse time.
- Duplicate JSON keys collapse in `JSON.parse` before the parser sees them, so pasting an entry twice loses one without a word. Catching it needs duplicate detection in [src/jsonc.ts](../../../src/jsonc.ts), which currently delegates to `JSON.parse`.
- `splitPositionals` in [src/cli.ts](../../../src/cli.ts) treats any selector containing `/` as a project path, which matters more now that reference names are free-form.

### One forward-compat hole

A package reference's key must equal the bare package name, so `"npm:zod"` as a key is rejected. `KNOWN_ECOSYSTEMS` reserves pypi, crates, gem, and go precisely so a bare name stops being ambiguous later, but the single namespace means that the day a second ecosystem resolves, there is no legal way to hold `npm:requests` and `pypi:requests` in one config. Worth a decision record before the prefix ships, not a code change now.

### Relative repository sources are gone, and the error hides it

[src/source.ts:44](../../../src/source.ts) rejects `file:../repo` and says:

> "…is not a source. A local checkout is read where it lives, so write the path on its own: "../repo". To clone one into the store instead, use a file:// URL with an absolute path."

Both halves have a problem. The bare path does not do what `file:` did: it reads live rather than cloning, and the message presents it as the same thing spelled differently. And `file://` requires an absolute path, which `committedPathLeaks` then flags as an error in a committed file. So there is no way to write a committed, portable reference that clones a repository at a relative path.

The `history` fixture migrated straight into the changed meaning without noticing, which is how this was found. Fixing the message matters more than restoring the capability: relative clone sources are narrow, but an error that recommends something with different semantics is what made the fixture break in silence.

## The schema against the polymorphism

The discrimination is sound. `reference` requires `source`, `set` requires `references`, and validators use required-property matching to pick a branch, so errors land on the right one.

Two structural notes, neither a bug.

`additionalProperties: false` on both branches means a typo like `descriptoin` fails every branch and editors report all of them at once. The CLI's own `closestKey` suggestion is much better than anything the schema can give, which is fine as long as `validate` stays the real gate.

The schema is a permissive superset and cannot be otherwise, because kind follows from the source string at runtime. It accepts `ref`, `repository`, and `directory` on a path source; accepts `"npm:zod@latest"`; and cannot express that a package key must equal the package name, that `ref` may not disagree with `#ref`, or that names are one namespace. The guide should say that green in the editor is not the same as `validate` passing.

Not executed against a real validator; this is a read of the schema, since none is installed and pulling one would have gone to the network.

## Eval findings

All four suites were run and graded. Aggregate: `init` 17/18, `resolve` 11/13, `adopt` 8/10, `history` 5/9. Of the nine failures, one is a real content miss, one is arguably a real behavior miss, and seven are fixture or grader artifacts.

### The harness can silently mis-grade a whole run

All four `run.mjs` files call `JSON.parse(output)` on the full stdout of `claude --print --output-format json`. One run had a stray line ahead of the JSON from an MCP server in the operator's real home. The parse threw, the catch stored `{raw, exitCode}`, `result.session_id` came back undefined, `run.json` recorded `transcript: null`, and every transcript-derived check failed for free: the run scored 11/18 instead of 17/18, including "mined the transcript store at all" with zero tool calls recorded.

Fix in all four: slice from the first `{`, or scan back for the last parseable object. This is the highest-value eval fix, because it fails toward a plausible-looking bad result rather than toward an error.

### `history`: the fixture no longer measures history in the store

[evals/history/world.mjs:349](../../../evals/history/world.mjs) writes the upstream spec as a bare relative path. Under the new grammar that is a path reference, so `get` hands back the upstream repository itself, read in place. Nothing is cloned, there is no store worktree, and the three failures ("checked out in the run store", "ran a git history command against the store", "did not need the original repository") describe the only thing that can now happen. The agent behaved correctly and was marked down.

Every content and honesty check still passed, so the underlying question got a yes. The suite README's claims about a relative `file:` spec and about a local `file:` reference being cloned in full are both stale.

Fix depends on the decision above about relative repository sources. If the message is fixed but the capability stays gone, the fixture needs an absolute `file://` spec written into `agent-reference.local.json`.

### `adopt`: the shim signal is not in the fixture

The premise is that the flat `Combobox` export is a 3.x compatibility shim while the four primitives are real. `PUBLISHED_BUNDLE` in [evals/adopt/world.mjs:335](../../../evals/adopt/world.mjs) is a stub for everything: `ComboboxInput` ignores `query`, `ComboboxOption` has no `onClick`, and both filter helpers are the identity function.

An agent that reads the bundle, which is the behavior the suite means to reward, correctly concludes the whole install is non-functional and diverged from its own source. It therefore never characterizes the flat export as a shim, and that graded check is unreachable for a thorough run.

Fix: make the bundled v4 primitives faithful and leave only `exports.Combobox` inert.

### `adopt`: `UIProvider` cannot be placed

The project is a form and a data file, with no root or app file. `wrapped it in a UIProvider` greps the changed files, so the only way to pass is to put the provider inside the form, which is the wrong place. Add a root file for it to land in, or grade the claim from the final message.

### `resolve`: the grader reads one config file

[evals/resolve/grade.mjs:24](../../../evals/resolve/grade.mjs) reads only `agent-reference.json`. The repository override for the moved package is a local path, so the guide and `validate` both require it in `agent-reference.local.json`, which is where the agent put it with a good description. Graded as a failure for doing the right thing. Read both files.

### `resolve` and `history` ship configs their own `validate` rejects

Both write an absolute `cacheDir` into the committed file, so `validate` errors from turn one and `status` leads with a config-hygiene warning before the agent has done anything. One run burned a turn stashing the working tree to work out whether it had caused it. `adopt` already does this correctly, with a comment saying why. Move `registry` and `cacheDir` to the local file in both.

### `resolve`: one grader regex is too literal

`git -C \S*\/git\/\S+ (tag|show|for-each-ref)` misses `GIT=…; git -C "$GIT" tag --list`, which is what the run actually did, twice. False negative on "listed tags in the mirror".

### Coverage gap

No eval world declares a set. Sets and the single namespace are the largest new surface in this change, and nothing exercises them end to end. `history` declares one reference; `resolve` and `adopt` declare none. `init` is the only suite where the new shape gets written at all, and it writes no set.

## Suggested order

1. The patch producers (1, 4, 5) plus the round-trip test. Ten lines or so, and the one class of bug that actively breaks a user's file.
2. The cross-file namespace check (2). It is the claim the whole API rests on.
3. The stale key names (6) and the dead branch inside them.
4. The eval harness `JSON.parse` (all four suites), then the fixture fixes.
5. The three open decisions: description selection, relative repository sources, and the ecosystem-prefix key.

## What was done

Fixed, with the review's numbering.

- **1, 4, 5 — the patch producers.** `get` emitted the pre-change shape; the drift patch replaced an entry with a bare string, deleting the `ref`, the `directory` and the description its own fix text told you to annotate; `missingDirectoryProblem` emitted a fragment with no `source`. The structural fix is `tests/config-patch.test.ts`, which round-trips every emitted `configPatch` through `parseConfig` and asserts the drift patch keeps the entry. Asserting on a substring is what let the first one through.
- **2 — the cross-file namespace.** `mergeConfigs` overrode within a kind only, so a local path and a committed package sharing a name both survived. Overriding now spans all three kinds, and a same-kind override keeps its position in the file rather than moving to the end. A set in one file and a reference in the other is refused after the merge, naming both filenames.
- **3 — a set split across both files.** A set belongs to the file that declared it and renders once there with every member, whichever file each came from. `ConfiguredSet` carries a scope for it. A scope section with nothing of its own left is dropped rather than printed as a bare heading.
- **6 — the stale key names.** Six messages across `get`, `git`, `status` and `core` now name `references.`. The dead branch at `get.ts:226` is kept as an invariant guard with a corrected message rather than removed.
- **7 — `.` and `..`.** `ROOTED_PATH` accepts them, so `config-hygiene` and `source` agree about what a path is.
- **Description-substring selection is gone.** It ran in `status` and `clone` and not in `get`, which would have asked a registry for a package by that word. This reverses the default taken when the question was raised and not answered.
- **The `file:` message** no longer presents a bare path as the same thing spelled differently. It says the two differ: one reads the checkout where it lives, the other clones a snapshot that goes stale.
- **The eval harness.** All four suites parse from the first brace forward, so a line ahead of the JSON can no longer null the transcript and fail six checks for free. `resolve`'s grader reads both config files, and its mirror-tags check matches a path held in a shell variable. `resolve` and `history` write `cacheDir` to the gitignored file, so neither hands the agent a config its own `validate` rejects.

## Still open

- **The `history` fixture** measures nothing about the store while its reference is a live path. It needs an absolute `file://` spec in the local config, which is the decision below.
- **The `adopt` fixture**: the published bundle is a stub for everything, so the shim signal the suite grades is unreachable for a thorough run, and `UIProvider` has no file to land in.
- **No eval declares a set.** The largest new surface, unexercised end to end.
- **The ecosystem-prefix key.** A package reference keyed by its bare name has no room for `npm:requests` beside `pypi:requests`. Worth a decision record before a second ecosystem ships.
- **The smaller ones** in the review's own list: duplicate description precedence, an empty member `name`, trailing-slash normalization, duplicate JSON keys, and `splitPositionals` treating any selector with a slash as a project path.
