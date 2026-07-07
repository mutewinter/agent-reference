# agent-reference

`agent-reference` is a TypeScript CLI/library for materializing local reference source for coding agents.

It can track:

- `packages`: npm ecosystem packages, resolved from the current lockfile or an explicit registry version.
- `git`: arbitrary git repositories.
- `folders`: local folders that should appear in agent-readable status output.

The key agent command is:

```sh
agent-reference status
```

That output contains absolute paths for every ready reference. Agents should use those paths instead of inferring locations from config files or `node_modules`. Use `--json` only when a script needs structured output.

## Usage

```sh
agent-reference list ./package.json
agent-reference status ./package.json
agent-reference init ./package.json --package react --package zod
agent-reference clone ./package.json --package react
agent-reference clone ./package.json --non-interactive
agent-reference clone ./package.json --all --non-interactive
```

For local development before building:

```sh
npm run dev -- list fixtures/pnpm-basic/package.json
npm run dev -- clone fixtures/pnpm-basic/package.json --package react
```

## Config

Commit `agent-reference.json` when a repo should have shared references:

```json
{
  "packages": {
    "react": "installed",
    "prettier": "3.6.2"
  },
  "folders": {
    "design-notes": "./references/design-notes"
  },
  "git": {
    "typescript": "github:microsoft/TypeScript#main"
  },
  "allImporters": false
}
```

Use `agent-reference.local.json` for personal machine paths that should not be committed:

```json
{
  "folders": {
    "company-ui": "../company-ui",
    "notes": "~/notes/frontend"
  }
}
```

`packages` values can be:

- `"installed"` to use the exact version in the active lockfile.
- An exact version, range, or dist-tag resolved through the npm registry.

`git` values can be `github:owner/repo#ref`, `file:../repo#ref`, or a git URL with an optional `#ref`.

`allPackages: true` can be used to keep every discovered direct dependency cloned. CLI flags override config values.

Add `.agent-reference.json` to `.gitignore`. It is generated machine state with machine-specific absolute paths. The config says what should exist; the manifest says what was materialized on this computer.

## Agent Workflow

Agents should start with:

```sh
agent-reference status
```

Status reports configured references, current lockfile versions, cloned versions, status, and absolute paths when a reference is locally available. For programmatic integrations, `agent-reference status --json` returns the same information with `references[].path`, checkout SHAs, and action strings.

If a package or git reference is `missing`, `stale`, or `missing-worktree`, run:

```sh
agent-reference clone --non-interactive
```

Then run status again and use the reported absolute paths. Re-cloning replaces superseded manifest entries, so each project always points at exactly one copy per reference; shared store worktrees are left in place for other projects, while project-local worktrees are deleted. Folder references are never cloned; fix the configured path if a folder is missing.

## Layout

Everything heavy lives in one machine-wide store, shared across every project and git worktree — like the pnpm store:

- Store root: `$AGENT_REFERENCE_STORE_DIR`, `$XDG_CACHE_HOME/agent-reference`, or the OS cache directory (`~/Library/Caches/agent-reference` on macOS, `~/.cache/agent-reference` elsewhere).
- Bare repositories: `<store>/repositories/<host>/<owner>/<repo>.git`.
- Shared worktrees: `<store>/worktrees/<host>/<owner>/<repo>/<commit>` — keyed by commit, so two projects on the same version (or two packages from the same monorepo commit) share one checkout.
- Inside each project there is exactly one generated file: the `.agent-reference.json` manifest at the root, next to `agent-reference.json`. No folder, no dependency source.
- Set `worktreeDir` in config (or `--worktree-dir`) to keep worktrees inside the project instead; those are pruned when superseded.

The store is a cache: delete it any time and `agent-reference clone --non-interactive` rebuilds it.

## Resolution Model

`agent-reference` uses the lockfile for installed package versions, not `package.json` ranges. Current package manager support covers PNPM, npm, Bun text lockfiles, and Yarn lockfiles.

For each selected `name@version`, it fetches the npm package manifest from the registry. The manifest's `repository` field gives the git remote, and `gitHead` is used when available to check out the publish commit. If `gitHead` is absent, `agent-reference` tries common tags such as `pkg@1.2.3`, `v1.2.3`, and `1.2.3`, then falls back to the repository default branch.

This matches the common npm ecosystem path without depending on a registry API beyond package manifests.

## Development

```sh
npm test
npm run build
```

Tests use fixture lockfiles and local git repositories. They do not call npm or GitHub.

## Status

Supported now:

- PNPM direct dependency scanning from `pnpm-lock.yaml`.
- npm direct dependency scanning from `package-lock.json`.
- Bun direct dependency scanning from text `bun.lock`.
- Yarn direct dependency scanning from `yarn.lock`.
- Workspace importer resolution when pointed at a nested `package.json`.
- Interactive and non-interactive package selection.
- `agent-reference.json` desired-state config for shared references.
- `agent-reference.local.json` for local folder references and overrides.
- `agent-reference status` for agent-readable absolute path and drift reporting.
- Machine-wide store of bare repositories and shared, commit-keyed worktrees.
- A bundled `skills/agent-reference/SKILL.md` for agent awareness.

Not supported yet:

- Binary `bun.lockb` inspection. Generate a text `bun.lock` first.
- Full all-workspaces scanning for npm, Bun, and Yarn. Point `agent-reference` at the specific workspace package for now.
