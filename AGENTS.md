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

- `npm test` and `npm run build` before handing work back.
- Commit subjects: `scope: description`, lowercase, imperative.
