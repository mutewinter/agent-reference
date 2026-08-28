# The parsed config is one list, because the namespace is one namespace

## Context

[One references map](2026-08-25-one-references-map.md) folded four top-level keys into one and stated the rule the whole API rests on: a name means exactly one thing, so nothing needs qualifying. Its own Consequences noted that `ConfiguredReference` kept its three variants and that everything below the parser was untouched. That was true, and it is the part left undone: `AgentReferenceConfig` still held `packages`, `paths`, and `git` as three arrays, so the file was one map and the parse of it was three lists.

Where the two shapes disagreed, the code paid for the difference:

- Looking a name up meant searching three places for something that can only be in one. `configuredReferences` existed to re-concatenate the arrays, at seven call sites, beside five more hand-rolled spreads of the same three.
- `mergeConfigs` could not say "the local file wins by name" directly. Overriding across kinds needed a map of overridden names to kinds and a `kept` filter to drop the committed entry whose kind had changed, then three separate merges. That machinery was itself the fix for a bug where the rule held only within a kind.
- `selectionFilter` could not turn a selector into a name. It generated three keys per selector, one per kind, and `matches` took a kind its callers had to supply, so `status` and `clone` threaded a discriminator through a lookup that could not be ambiguous.
- `status` made three passes and reported the file back grouped by a kind nobody had chosen to group by, with every package first however far down the file it sat.

`AgentReferenceConfig` is exported from the package, so this was also the last release where changing it costs nothing.

## Decision

**`AgentReferenceConfig.references` is one `ConfiguredReference[]`, in the order the file declares them.** The three kind-partitioned arrays are gone. A list rather than a `Map` because the type is published and read back as data; the lookups that want a map are one accessor, not a representation.

**Three accessors in `config.ts` replace every ad-hoc traversal.** `configuredReferences` is the null-safe whole list; `configuredReference(config, kind, name)` is the single lookup, returning the narrowed variant, which is what replaced four locally built `Map`s; `referencesOfKind` serves the callers that genuinely work a kind at a time, which are the lockfile resolution and the two hygiene checks.

**A selector is a name.** `ReferenceSelection.matches` takes a name and nothing else. `setMemberKey` keeps the `kind:name` spelling, because that is report output rather than a lookup.

**`status` reads the config in one pass, in file order.** The order someone wrote is the only order that carries meaning.

## Consequences

- Declaration order is now visible. `status` rows, and a set's members, come back in the order the file declares them rather than packages-then-paths-then-git. This is a change to what the command prints and to `--json` ordering; nothing about which references are reported changes.
- `mergeConfigs` is a `Map` and a loop. `overriddenKind`, `kept`, and `mergeByName` are deleted, and the cross-file override rule is now stated once in the code rather than reconstructed from three merges.
- `sets.ts` is about sets and selection again. `configuredReferences` moved to `config.ts` with the other accessors, and the `KINDS` fan-out is gone.
- `ConfiguredReference` and its three variants are unchanged, so every consumer below the accessors is untouched, including all of the registry, lockfile, and git resolution.
- Adding an ecosystem, or a fourth kind, no longer adds an array to the config type, a branch to `pushReference`, a pass to `status`, and a key to every selector.
- A library consumer reading `config.packages` has to read `referencesOfKind(config, 'package')` instead. Deliberately taken before 1.0.0, where it is a reshape rather than a breaking change to a published type.
