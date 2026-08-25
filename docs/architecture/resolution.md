# Resolution

Resolution turns a package name into a verified commit. It runs at `get` time, reading the lockfile as it is right now, so what gets checked out cannot drift from what is installed. The funnel, top to bottom:

1. The coordinate gives `name@version`, either written out or taken from the lockfile (four formats: PNPM, npm, Bun text, Yarn). A PNPM lockfile is read across every workspace importer, and the importer the command ran in wins when several install the same name; anything still ambiguous is reported rather than picked. The other three read the one importer the command ran in, so a dependency a sibling workspace package holds is reached by running there.
2. The registry manifest for that exact version gives the repository URL and, when present, the publish commit (`gitHead`).
3. Known tag shapes are tried: `@scope/pkg@1.2.3`, `pkg@1.2.3`, `v1.2.3`, `1.2.3`.
4. The tag list is searched for anything containing the version.
5. The verify gate, applied to each candidate rather than after them all: `package.json` at that commit must state the same name and version. This is where the monorepo trap dies, where a `v1.2.3` tag belongs to an unrelated package's release. A candidate with no manifest to check is held aside and used only when nothing verifies.

The gate also decides the path. A package subdirectory is handed back only when a manifest there confirms name and version together; a directory carrying the right name and no version is a bundled demo app often enough that guessing it is worse than not answering. Unconfirmed, the path is the repository root. A `directory` in the config skips the question entirely.

A checkout carries a confidence: `verified` (the gate passed), `unverified` (plausible ref, no manifest to confirm), or `fallback` (the default branch, not the published version). `pinned` sits above them all: a ref chosen by hand in the config wins over every guess, no questions asked. When nothing resolves there is no checkout to label at all, and the failure is what gets recorded; `status` renders that as `unresolvable`.

## Division of labor

The agent decides when: whether upstream source would help, which version matters, and, when the funnel fails, which commit to pin (with a description saying why). Finding out which version matters is something an agent can do with a grep, so `versions` only has to do it faster and say where the number came from; it never decides anything.

The tool computes what: the funnel is deterministic, cheap in code, and identical on every run, where an unaided agent guessing tags is expensive in tokens and wrong in exactly the monorepo cases the gate exists for.

Failures are recorded in the store's state file for this project, with the overrides that were in effect, so `status` can explain the failure and its fix without repeating network work, and so it knows an unchanged retry would fail identically. Editing the failed overrides makes the reference worth trying again.
