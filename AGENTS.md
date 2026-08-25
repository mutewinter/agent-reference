# agent-reference

A CLI that materializes readable upstream source for coding agents: dependencies at their exact installed version, git repositories, and local files and folders, all by name.

`docs/README.md` maps the knowledge base. `docs/decisions/` records why the design is what it is; read the relevant one before treating a design as a bug, particularly before adding CLI commands that edit config (deliberately absent) or making anything eager (nothing is fetched until asked for).

## Never commit machine-specific content

No machine paths (`/Users/...`, `~/...`, `C:\...`), no names of local checkouts or sibling repositories, in code, tests, fixtures, docs, commit messages, or PR text. It is not reproducible anywhere else, and this repo ships publicly. Fixtures use invented names (`acme/chess-engine`, `~/code/company-ui`). The tool's `validate` enforces this rule for its users; the repo holds itself to it everywhere.

## Gotchas

- Source imports carry `.ts` extensions and run under `--experimental-strip-types`, so tests need no build step. Do not "fix" them to `.js`.
- `tsconfig.json` is the build and emits `dist/` from `src/` alone. `tsconfig.check.json` is what checks everything else, so `pnpm run check-types` rather than `pnpm run build` is what tells you the tests and scripts typecheck.
- The one remaining JavaScript file outside `evals/` is `site/cli-deps.mjs`, and it stays JavaScript because it is the only one that runs on the deploy path, under Cloudflare's Node rather than the pinned one.
- Tests stay offline and out of the real store: fixture lockfiles, git repositories created in a temp dir, and an explicit `storeDir`. A test that reaches npm or GitHub, or writes to the default `~/.agent-reference`, is a bug.
- Output is read by agents as much as humans. `--json` is the machine contract; the human formatter lives in `src/status-format.ts` and colors only on a TTY.

## Conventions

- `pnpm check` before handing work back: turbo runs every gate in this repository in one pass, the root's and the site's alike, and caches each one so a second run redoes only what changed. The individual scripts still exist and still work on their own. `lint:fix` and `format:fix` write; the bare names check, which is the form CI runs.
- Dev servers are named after what they serve: `pnpm site:dev`, `pnpm talk:dev`, and `pnpm dev:all` for both at once. `pnpm dev` remains the CLI run from source.
- Commit subjects: `scope: description`, lowercase, imperative.

## Turborepo

[turbo.json](turbo.json) runs the tasks, in single-package mode: three projects live here, and each one keeps its own `node_modules` and its own lockfile, so there is no pnpm workspace for turbo to walk. Every task is a script in the root `package.json`, and the `site:` and `talk:` ones shell into the other two projects with `pnpm --dir`. See [the decision](docs/decisions/2026-08-25-one-command-three-installs.md) before reaching for a workspace; the cost is not the config, it is what a root install then has to pull down.

A task that reads another project's files says so in its `inputs`, which is how `test` and `check-types` know about `site/cli-reference.ts`: the README test renders it. A new task without `inputs` is hashed against the whole repository and will almost never hit its cache.

## The Node version

[.node-version](.node-version) is the one place it is written down. Cloudflare Workers Builds reads it when it builds the site, CI's single-version jobs read it through `node-version-file`, and the test matrix stays explicit because testing more than one runtime is its whole job. The value is deliberately the version Workers Builds defaults to, so the pin describes what already happens rather than changing it.

It is not the tool's floor. The published package ships compiled JavaScript and `engines` says Node 20. This is the version that develops, tests, and deploys, and it has to be recent enough to run `.ts` files directly: type stripping is on by default from 22.18.

## Linting

Two oxlint configs, one per project. `.oxlintrc.json` at the root turns on `correctness` and `perf` and then names every other rule individually, because `pedantic` and `style` report thousands of things here and most of them are house style rather than a defect. A rule that is off has the reason next to it; add to that list rather than flipping a category. `--type-aware` is on, which is why the lint script needs a real install.

`site/.oxlintrc.json` adds React and `oxlint-tailwindcss`, pointed at `src/styles.css`. That makes the stylesheet the design system: every class is resolved against the tokens declared in `@theme`, `no-arbitrary-value` rejects a size or a color written into a class instead, and a typo is an unknown class rather than a rule that silently does nothing. A new size belongs in `@theme` under a name.
