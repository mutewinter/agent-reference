# The ecosystem belongs to the coordinate; the package manager belongs to the output

## Context

Two questions hide inside "what package is this", and the config answered neither.

The first is which registry a name lives in. `requests` is a PyPI package and `request` is an
npm one, which is why [a config entry being a coordinate](2026-08-20-coordinates-not-queries.md)
introduced an ecosystem prefix, and why `get` prints `npm:zod@3.22.0` back as the canonical
spelling with a comment saying an agent should pick up the unambiguous form. That decision
gave committed configs as its reason. The config was then the one surface that could not hold
one.

The consequence was not cosmetic. A key of `npm:zod` parsed into a reference literally named
`npm:zod`, while every lookup asked for `zod`, so an entry written in the spelling the tool
had just printed was unreachable: its `ref`, `repository`, and `directory` did nothing, `get`
resolved the package as though nothing were declared, and `validate` reported the file as ok.
The tool taught a spelling its own config silently misread.

The second question is which package manager installed the package here. That one was
answered correctly and then thrown away. `ProjectContext`, `PackageReference`,
`AgentReferenceStatusEntry`, and `VersionsReport` all carried it; no human formatter printed
it. `versions` exists, in its own words, so the tool can "say where the number came from",
and its output named neither the lockfile nor the format. A `PackageManager` union carrying
`'config'` alongside `pnpm` and `npm` was the same confusion in the types: `config` is not a
package manager, and `PackageVersionSource` already existed to say where a version came from.

## Decision

The two questions separate by whether the answer is a fact about the reference or a fact
about the machine.

**The ecosystem is part of the coordinate, so it is declared.** A `packages` key is the
coordinate `get` prints with the version left out, because the value holds it. `zod` and
`npm:zod` are two spellings of one reference: the name is stored bare so every lookup finds
it, the ecosystem is stored beside it, and the key exactly as written is stored too, because
a generated config patch has to edit the entry that is there rather than adding a second one
that disagrees with it. Duplicate detection keys on ecosystem and name together, so a future
`pypi:zod` is a second reference rather than a conflict.

A prefix is validated rather than absorbed. An ecosystem this build cannot resolve fails at
parse time naming `git` as the way to reach that source, and a prefix that is not an
ecosystem at all fails naming the ones that are. Silently treating `nmp:zod` as a package
name is the failure this decision exists to end, so nothing about a prefixed key is
best-effort. A version in the key fails too, naming the shape that works.

The prefix is not renamed into the key. `packages` could have become `npm`, which reads well
beside `git` and `paths`, but every further ecosystem would then add a top-level key, a
`sets` member array, and a duplicated entry schema, to buy what the prefix gives for free.
The ecosystem is data about one entry, not a section of the file.

**The package manager is a fact about this checkout, so it is reported and never declared.**
Declaring it would be a config that can be wrong about the disk, which is the thing
coordinates-not-queries bans. It is now printed instead:

- `status` names the lockfile once, after the references rather than on every package line,
  because it is one fact about the project and not a property of each entry. The absent case
  is the one that earns the words: with no lockfile there is nothing installed for a pin to
  be checked against, and a bare `get <name>` answers from the registry instead.
- `versions` leads with the lockfile, labels the importer column, and suggests the canonical
  coordinate.
- `PackageManager` loses `'config'` and means only which lockfile format this project uses.

**Every status line says where its reference comes from.** The kind column renders a package
as its ecosystem, so the column reads `npm`, `git`, `file`, `folder`. `package` was the least
informative word available, since everything in the file is a package in some sense, and it
was also the one column that answered a different question from its neighbors.

## Consequences

- Nothing breaks. A bare key still means npm, which is what every key written before the
  prefix existed already meant, so no config needs rewriting and no migration is shipped.
- `status` output changes shape for anything parsing it positionally. `--json` is the machine
  contract and gained fields rather than changing any; the human column is the one that moved.
- The `registry` key still holds one npm URL and becomes ambiguous the day a second ecosystem
  resolves. Left alone deliberately: nothing can name a second registry yet, and a key that
  quietly changed meaning is the failure above.
- The examples the site and README render are now checked against the parser by a test. One
  of them, the complex example, had never parsed: a set member and a top-level entry named
  the same repository at different refs, which is a hard error. A sample that does not parse
  is a copy-paste trap on the front page, and nothing had been asking.
- The flagship `packages` example was an enumerated list of installed dependencies with no
  pin, description, or set, which is the inventory
  [packages-as-exceptions](2026-08-19-packages-as-exceptions.md) exists to prevent and the
  routing table in the guide tells agents not to write. It now shows an entry with a reason
  to exist, and the terminal beside it shows a dependency that needs no entry at all.
