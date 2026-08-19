# Working in this repository

## System-agnostic content only

Everything committed here must make sense on any machine. Never commit machine-local
paths (`/Users/...`, `~/...`, `C:\...`), the names of local checkouts or sibling
repositories, or anything else tied to one system: it is not reproducible or useful
anywhere else. This applies to code, tests, fixtures, docs, commit messages, and PR text.
Test fixtures use invented names (`acme/chess-engine`, `~/code/company-ui`). The tool's
own `validate` command enforces the same rule for its users' committed config; this repo
holds itself to it everywhere.

## Knowledge base

Versioned docs are the system of record; prefer them over chat history. `docs/README.md`
is the map: `docs/architecture/` for how the system works today (corrected in place),
`docs/decisions/` for why it is this way (one dated file per decision, superseded rather
than edited), `docs/plans/` for work not yet landed (`Status:` line first, moved to
`completed/` when it lands). `docs/visual-explanations/` is gitignored scratch for a
human reading now, not history.

## Conventions

- `npm test` and `npm run build` before handing work back.
- Direct JSON editing plus `agent-reference validate` is the config interface; there are
  deliberately no add/remove commands.
- Commit subjects: `scope: description`, lowercase, imperative.
