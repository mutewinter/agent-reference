# One references map, and a set is a reference that resolves to several paths

## Context

The config had four top-level keys: `packages`, `paths`, `git`, and a `sets` array carrying three more member arrays with three more entry schemas inside it. `get` had one grammar that accepted every source shape in a single argument. The guide's seven-row routing table existed only to translate between the two, and an agent had to classify a source before it could declare one.

Two rounds of evidence said the split was not earning that. All four `packages` entries in the dogfood corpus on this machine supplied `ref`, `directory`, or both by hand, which is the resolution machinery that distinguishes a package entry from a git one, switched off. That follows from [packages-as-exceptions](2026-08-19-packages-as-exceptions.md) rather than contradicting it: an entry exists because something was wrong, so the entries that survive in a config are the ones whose distinguishing behavior did not work. One reference was declared as `git` with a `ref` in one session and as `packages` with a `directory` four hours later, with a paragraph of permanent config prose justifying each direction, and both resolved to the same commit.

[The ecosystem decision](2026-08-24-the-ecosystem-belongs-to-the-coordinate.md) rejected renaming `packages` to `npm` because each further ecosystem would add a top-level key, a `sets` member array, and a duplicated entry schema. That argument already applied to the three keys that existed.

## Decision

**One `references` map, from the name an agent asks for to where that source comes from.** The value is a source string, an array, or an object; an object holding `source` is a reference and one holding `references` is a set. That is the only rule a writer carries.

**The kind is read out of the source, never declared**, which is [a path is a path](2026-08-20-a-path-is-a-path.md) applied one level up: a path's file-or-folder shape was already derived, and so is whether a source is a path, a repository, or a package. `src/source.ts` is the single classifier, called by the config parser and by `get`, so a spelling that works in one works in the other by construction rather than by convention. A path source has to be rooted, because `docs/decisions` is also a valid `owner/repo` shorthand; `validate` warns when a shorthand names a folder that is also in the project, which is the one question only the disk can answer and parsing stays pure so it answers the same everywhere.

**A set is a reference that resolves to several paths.** Its key is its name, exactly as a single reference's key is, so `get harnesses` materializes every member and `status harnesses` reports the group. `--set` is gone from every verb, and so are the `package:` / `path:` / `git:` selector prefixes: names are one namespace, so nothing needs qualifying and two entries cannot share a name. A set holds references, never other sets, which keeps the one level of grouping [sets-replace-groups](2026-08-19-sets-replace-groups.md) intended. Members are still declared inline, and one array now holds every kind, so a set can mix a package, a repository and a folder.

**A package reference is keyed by its package name.** It resolves through a registry and is audited against a lockfile, and both key on the package's own name; letting the handle differ would mean carrying two names for one entry. The error names the fix, and points at a repository source for a handle of your own.

**A local checkout is read where it lives, and `file:` with one slash is refused.** Under one map, `"api": "../api"` and `"api": "file:../api"` sat beside each other meaning live tree versus frozen clone, which is the least discoverable place to put that distinction. A `file://` URL is a git URL like any other and still clones, which is what the offline test suite uses; the relative form is a parse error naming the path to write instead. Nothing is lost: a checkout read live carries its own history, so `git log` answers from it without cloning anything.

## Consequences

- Every existing config fails to parse until it is rewritten. Each of the five old keys is a hard error naming where its entries go, following the `folders` to `paths` precedent. The configs on this machine are countable and the package is pre-launch.
- Two namespaces hid a collision that one namespace has to name: a set and a member deriving the same basename. One of the six dogfood configs had two.
- Six near-duplicate parsers become two, six key lists become two, and the three-way merge becomes one. `ConfiguredReference` keeps its three variants, so everything below the parser is untouched, including all of the registry, lockfile and git resolution.
- `configKey` is gone. The key is the name, so a generated config patch edits the entry that is there without a second field to disagree with it.
- The version lives inside the source, so a drift patch replaces the whole coordinate rather than a `version` field that could disagree with the key beside it.
- `status` prints a set's name in the handle column with the description beneath it. It previously printed only the description, so the word to pass to `--set` was discoverable in `--json` and nowhere else.
- A source containing a slash that is neither a repository shorthand nor a scoped package name is refused, naming both readings. It used to reach the registry as a package name and come back a 404, which blamed npm for a host written without its scheme.
