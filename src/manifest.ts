import fs from 'node:fs/promises';
import path from 'node:path';

import type { DepCloneManifest, GitWorktreeResult } from './types.ts';

export async function writeManifest(projectRoot: string, results: GitWorktreeResult[]): Promise<string> {
  const depcloneDir = path.join(projectRoot, '.depclone');
  await fs.mkdir(depcloneDir, { recursive: true });

  const manifest: DepCloneManifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    projectRoot,
    dependencies: results.map((result) => ({
      name: result.dependency.name,
      version: result.dependency.version,
      packageManager: result.dependency.packageManager,
      importers: result.dependency.importers,
      dependencyTypes: result.dependency.dependencyTypes,
      repositoryUrl: result.metadata.repositoryUrl,
      repositoryDirectory: result.metadata.repositoryDirectory,
      gitHead: result.metadata.gitHead,
      bareRepositoryPath: result.bareRepositoryPath,
      worktreePath: result.worktreePath,
      checkoutRef: result.checkoutRef,
      checkoutSha: result.checkoutSha,
      refSource: result.refSource
    }))
  };

  const manifestPath = path.join(depcloneDir, 'manifest.json');
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifestPath;
}

export async function writeAgentFiles(projectRoot: string): Promise<string> {
  const depcloneDir = path.join(projectRoot, '.depclone');
  await fs.mkdir(depcloneDir, { recursive: true });

  const guidePath = path.join(depcloneDir, 'README.md');
  await fs.writeFile(
    guidePath,
    [
      '# DepClone Agent Notes',
      '',
      'Dependency source worktrees are stored under `dependencies/`.',
      'Read `manifest.json` first. It maps package names and versions to exact checkout paths and commits.',
      'Prefer the listed worktree path over `node_modules` when inspecting dependency implementation details.',
      ''
    ].join('\n')
  );

  return guidePath;
}
