# DepClone

DepClone is a TypeScript CLI/library for cloning the exact source versions of JavaScript dependencies into agent-readable local worktrees.

Current scope covers PNPM, npm, Bun text lockfiles, and Yarn lockfiles. It reads the lockfile to find exact direct dependency versions, resolves npm registry metadata for repository URLs and `gitHead`, stores one bare git cache per machine, and writes project-local worktrees plus `.depclone/manifest.json`.

## Usage

```sh
depclone list ./package.json
depclone status ./package.json --json
depclone init ./package.json --package react --package zod
depclone clone ./package.json --package react
depclone clone ./package.json --non-interactive
depclone clone ./package.json --all --non-interactive
```

For local development before building:

```sh
npm run dev -- list fixtures/pnpm-basic/package.json
npm run dev -- clone fixtures/pnpm-basic/package.json --package react
```

## Config

Commit `depclone.config.json` when a repo should have shared dependency references:

```json
{
  "schemaVersion": 1,
  "references": ["react", "zod"],
  "dependencies": {
    "prettier": "3.6.2"
  },
  "allImporters": false,
  "worktreeDir": ".depclone/dependencies"
}
```

`references` accepts installed package names or `name@version` selectors from the project lockfile. `dependencies`, `devDependencies`, and `optionalDependencies` use package.json-style maps for extra open source projects that are not in the project dependencies. Exact versions are deterministic; ranges and dist-tags are resolved from the npm registry.

`all: true` can be used to keep every direct project dependency cloned. CLI flags override config values.

Do not commit `.depclone/`. It contains generated machine state, including `manifest.json` and worktrees. The config says what should be cloned; the manifest says what was cloned on this computer.

Agents should run:

```sh
depclone status --json
```

That command reports configured references, current lockfile versions, cloned versions, worktree paths, checkout SHAs, and stale or missing local clones. If any configured entry is `missing`, `stale`, or `missing-worktree`, run `depclone clone --non-interactive` and check status again.

## Layout

- Bare repositories: `$DEPCLONE_STORE_DIR`, `$XDG_CACHE_HOME/depclone/repositories`, or the OS cache directory.
- Project worktrees: `.depclone/dependencies/<package>/<version>`.
- Agent manifest: `.depclone/manifest.json`.

## Resolution Model

DepClone uses the lockfile for installed versions, not `package.json` ranges. For each selected `name@version`, it fetches the npm package manifest from the registry. The manifest's `repository` field gives the git remote, and `gitHead` is used when available to check out the publish commit. If `gitHead` is absent, DepClone tries common tags such as `pkg@1.2.3`, `v1.2.3`, and `1.2.3`, then falls back to the repository default branch.

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
- `depclone.config.json` desired-state config for shared references.
- `depclone status --json` for agent-readable local path and drift reporting.
- Global bare repository cache with project-local worktrees.
- A bundled `skills/depclone/SKILL.md` for agent awareness.

Not supported yet:

- Binary `bun.lockb` inspection. Generate a text `bun.lock` first.
- Full all-workspaces scanning for npm, Bun, and Yarn. Point DepClone at the specific workspace package for now.
