# agent-reference

A CLI that materializes readable upstream source for coding agents: dependencies at their
exact installed version, git repositories, and local folders, all by name.

`docs/README.md` maps the knowledge base. `docs/decisions/` records why the design is what
it is; read the relevant one before treating a design as a bug, particularly before adding
CLI commands that edit config (deliberately absent) or making anything eager (nothing is
fetched until asked for).

## Never commit machine-specific content

No machine paths (`/Users/...`, `~/...`, `C:\...`), no names of local checkouts or sibling
repositories, in code, tests, fixtures, docs, commit messages, or PR text. It is not
reproducible anywhere else, and this repo ships publicly. Fixtures use invented names
(`acme/chess-engine`, `~/code/company-ui`). The tool's `validate` enforces this rule for
its users; the repo holds itself to it everywhere.

## Gotchas

- Source imports carry `.ts` extensions and run under `--experimental-strip-types`, so
  tests need no build step. Do not "fix" them to `.js`.
- Tests stay offline and out of the real store: fixture lockfiles, git repositories
  created in a temp dir, and an explicit `storeDir`. A test that reaches npm or GitHub, or
  writes to the default `~/.agent-reference`, is a bug.
- Output is read by agents as much as humans. `--json` is the machine contract; the human
  formatter lives in `src/status-format.ts` and colors only on a TTY.

## Conventions

- `pnpm test`, `pnpm run build`, and `pnpm run lint` before handing work back. The site is
  its own project: `pnpm --dir site run lint` and `pnpm --dir site run check-types`.
- Commit subjects: `scope: description`, lowercase, imperative.

## The Node version

[.node-version](.node-version) is the one place it is written down. Cloudflare Workers Builds
reads it when it builds the site, CI's single-version jobs read it through `node-version-file`,
and the test matrix stays explicit because testing more than one runtime is its whole job. The
value is deliberately the version Workers Builds defaults to, so the pin describes what already
happens rather than changing it.

It is not the tool's floor. The published package ships compiled JavaScript and `engines` says
Node 20. This is the version that develops, tests, and deploys, and it has to be recent enough
to run `.ts` files directly: type stripping is on by default from 22.18.

## Linting

Two oxlint configs, one per project. `.oxlintrc.json` at the root turns on `correctness`
and `perf` and then names every other rule individually, because `pedantic` and `style`
report thousands of things here and most of them are house style rather than a defect. A
rule that is off has the reason next to it; add to that list rather than flipping a
category. `--type-aware` is on, which is why the lint script needs a real install.

`site/.oxlintrc.json` adds React and `oxlint-tailwindcss`, pointed at `src/styles.css`.
That makes the stylesheet the design system: every class is resolved against the tokens
declared in `@theme`, `no-arbitrary-value` rejects a size or a color written into a class
instead, and a typo is an unknown class rather than a rule that silently does nothing. A
new size belongs in `@theme` under a name.
