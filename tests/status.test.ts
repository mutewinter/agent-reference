import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { getStatusReport } from '../src/status.ts';
import type { DepCloneManifest } from '../src/types.ts';

const repoRoot = path.resolve(import.meta.dirname, '..');

test('reports configured dependencies missing from local worktrees', async () => {
  const projectRoot = await copyFixtureProject();
  const report = await getStatusReport(path.join(projectRoot, 'package.json'));

  assert.equal(report.entries.length, 1);
  assert.equal(report.entries[0]?.name, 'tiny-invariant');
  assert.equal(report.entries[0]?.currentVersion, '1.3.3');
  assert.equal(report.entries[0]?.status, 'missing');
});

test('reports ready dependencies with local worktree paths', async () => {
  const projectRoot = await copyFixtureProject();
  const worktreePath = path.join(projectRoot, '.depclone', 'dependencies', 'tiny-invariant', '1.3.3');
  await fs.mkdir(worktreePath, { recursive: true });
  await writeManifest(projectRoot, worktreePath, '1.3.3');

  const report = await getStatusReport(path.join(projectRoot, 'package.json'));

  assert.equal(report.entries[0]?.status, 'ready');
  assert.equal(report.entries[0]?.worktreePath, worktreePath);
  assert.equal(report.entries[0]?.checkoutSha, 'abc123');
});

test('reports stale dependencies when cloned version differs from lockfile', async () => {
  const projectRoot = await copyFixtureProject();
  const worktreePath = path.join(projectRoot, '.depclone', 'dependencies', 'tiny-invariant', '1.2.0');
  await fs.mkdir(worktreePath, { recursive: true });
  await writeManifest(projectRoot, worktreePath, '1.2.0');

  const report = await getStatusReport(path.join(projectRoot, 'package.json'));

  assert.equal(report.entries[0]?.status, 'stale');
  assert.equal(report.entries[0]?.currentVersion, '1.3.3');
  assert.equal(report.entries[0]?.clonedVersion, '1.2.0');
});

test('reports config-only dependencies as configured references', async () => {
  const projectRoot = await copyFixtureProject();
  await fs.writeFile(path.join(projectRoot, 'depclone.config.json'), JSON.stringify({
    schemaVersion: 1,
    dependencies: {
      'tiny-warning': '1.0.3'
    }
  }, null, 2));

  const report = await getStatusReport(path.join(projectRoot, 'package.json'));

  assert.equal(report.entries.length, 1);
  assert.equal(report.entries[0]?.name, 'tiny-warning');
  assert.equal(report.entries[0]?.packageManager, 'config');
  assert.equal(report.entries[0]?.currentVersion, '1.0.3');
  assert.equal(report.entries[0]?.status, 'missing');
});

async function copyFixtureProject(): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'depclone-status-test-'));
  await fs.cp(path.join(repoRoot, 'fixtures/pnpm-basic'), tempDir, { recursive: true });
  await fs.rm(path.join(tempDir, '.depclone'), { recursive: true, force: true });
  return tempDir;
}

async function writeManifest(projectRoot: string, worktreePath: string, version: string): Promise<void> {
  const manifest: DepCloneManifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    projectRoot,
    dependencies: [
      {
        name: 'tiny-invariant',
        version,
        packageManager: 'pnpm',
        importers: ['.'],
        dependencyTypes: ['dependencies'],
        repositoryUrl: 'https://github.com/alexreardon/tiny-invariant.git',
        repositoryDirectory: null,
        gitHead: 'abc123',
        bareRepositoryPath: path.join(projectRoot, '.depclone', 'bare.git'),
        worktreePath,
        checkoutRef: 'abc123',
        checkoutSha: 'abc123',
        refSource: 'gitHead'
      }
    ]
  };

  await fs.mkdir(path.join(projectRoot, '.depclone'), { recursive: true });
  await fs.writeFile(path.join(projectRoot, '.depclone', 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}
