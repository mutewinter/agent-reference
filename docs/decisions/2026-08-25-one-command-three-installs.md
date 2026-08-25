# One command, three installs

## Context

Three projects share this git history and nothing else: the CLI at the root, the site under `site/`, and a dated conference deck under `talks/`. Each was given its own lockfile and its own `node_modules` deliberately, and both of their READMEs say so. The reason is the same in each case, and it is about what a root install costs rather than about what a workspace would organize: nothing in either directory reaches the published tarball, so `pnpm install` at the root should not have to pull down a presentation framework and a React build to run the CLI's tests.

The isolation was charged back as ceremony. Handing work back meant seven commands in a fixed order, five at the root and two more with `--dir site`, and CI spelled the same list out again as seven sequential steps. Nothing was cached, so every one of them ran from scratch every time, including the site's typecheck on a commit that touched only `src/`.

## Decision

turbo at the root, in single-package mode.

turbo discovers packages through the package manager's workspace configuration. There is none here, so turbo sees exactly one package. Every task in `turbo.json` is a script in the root `package.json`, and the ones belonging to another project shell into it: `site:lint` is `pnpm --dir site run lint`.

This is not the usual way to point turbo at a repository with more than one project in it, and it gives up the parts of turbo that need a package graph: `--filter`, `^build`, and anything that reasons about one package depending on another. None of those are in play, because these three projects are not each other's dependencies. What is in play is the rest of it, and the rest of it is most of it: one command that runs everything at once, and a content hash per task so the second run skips what did not change.

The bill for staying out of a workspace is that a task has to declare its own `inputs`. Turbo would otherwise hash each one against every tracked file in the repository, which for three projects in one tree means the deck invalidating the CLI's test cache. So the tasks name what they read, and where one project reads another's files it says so: `test` and `check-types` both list `site/cli-reference.ts`, because the README test renders it.

## Consequences

- `pnpm check` is the command before handing work back. The individual scripts are unchanged and still run on their own, which also keeps `prepack` and `prepare` off turbo: a tarball must be buildable by anything that can run `tsc`.
- `.turbo/` is the cache and is gitignored. CI restores it for the lint and site jobs. The test matrix deliberately does not restore it, because that job exists to run the suite on two real runtimes and a replayed log is not a runtime having run it.
- A fourth project under this root is a `pnpm --dir` script and a pair of tasks, not a workspace entry.
- Adopting a real pnpm workspace later stays possible, but it is not a config-only change: three lockfiles become one, a root install starts carrying every project's dependencies, and the site's deploy build, which today installs `site/`'s lockfile and nothing else, would be installing something different.
