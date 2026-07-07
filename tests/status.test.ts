import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { getStatusReport } from '../src/status.ts';
import type { AgentReferenceManifest } from '../src/types.ts';

const repoRoot = path.resolve(import.meta.dirname, '..');

test('reports configured dependencies missing from local worktrees', async () => {
  const projectRoot = await copyFixtureProject();
  const report = await getStatusReport(path.join(projectRoot, 'package.json'));

  assert.equal(report.references.length, 1);
  assert.equal(report.references[0]?.kind, 'package');
  assert.equal(report.references[0]?.name, 'tiny-invariant');
  assert.equal(report.references[0]?.currentVersion, '1.3.3');
  assert.equal(report.references[0]?.status, 'missing');
});

test('reports ready dependencies with local worktree paths', async () => {
  const projectRoot = await copyFixtureProject();
  const worktreePath = path.join(projectRoot, '.agent-reference', 'packages', 'tiny-invariant', '1.3.3');
  await fs.mkdir(worktreePath, { recursive: true });
  await writeManifest(projectRoot, worktreePath, '1.3.3');

  const report = await getStatusReport(path.join(projectRoot, 'package.json'));

  assert.equal(report.references[0]?.status, 'ready');
  assert.equal(report.references[0]?.path, worktreePath);
  assert.equal(report.references[0]?.checkoutSha, 'abc123');
});

test('reports stale dependencies when cloned version differs from lockfile', async () => {
  const projectRoot = await copyFixtureProject();
  const worktreePath = path.join(projectRoot, '.agent-reference', 'packages', 'tiny-invariant', '1.2.0');
  await fs.mkdir(worktreePath, { recursive: true });
  await writeManifest(projectRoot, worktreePath, '1.2.0');

  const report = await getStatusReport(path.join(projectRoot, 'package.json'));

  assert.equal(report.references[0]?.status, 'stale');
  assert.equal(report.references[0]?.currentVersion, '1.3.3');
  assert.equal(report.references[0]?.clonedVersion, '1.2.0');
});

test('reports config-only packages as configured references', async () => {
  const projectRoot = await copyFixtureProject();
  await fs.writeFile(path.join(projectRoot, 'agent-reference.json'), JSON.stringify({
    packages: {
      'tiny-warning': '1.0.3'
    }
  }, null, 2));

  const report = await getStatusReport(path.join(projectRoot, 'package.json'));

  assert.equal(report.references.length, 1);
  assert.equal(report.references[0]?.kind, 'package');
  assert.equal(report.references[0]?.name, 'tiny-warning');
  assert.equal(report.references[0]?.packageManager, 'config');
  assert.equal(report.references[0]?.currentVersion, '1.0.3');
  assert.equal(report.references[0]?.status, 'missing');
});

test('reports local folder references with absolute paths', async () => {
  const projectRoot = await copyFixtureProject();
  const folderPath = path.join(projectRoot, 'references', 'design-notes');
  await fs.mkdir(folderPath, { recursive: true });
  await fs.writeFile(path.join(projectRoot, 'agent-reference.json'), '{}\n');
  await fs.writeFile(path.join(projectRoot, 'agent-reference.local.json'), JSON.stringify({
    folders: {
      'design-notes': './references/design-notes'
    }
  }, null, 2));

  const report = await getStatusReport(path.join(projectRoot, 'package.json'));

  assert.equal(report.references.length, 1);
  assert.equal(report.references[0]?.kind, 'folder');
  assert.equal(report.references[0]?.name, 'design-notes');
  assert.equal(report.references[0]?.status, 'ready');
  assert.equal(report.references[0]?.path, folderPath);
});

test('reports stale git references when configured spec changes', async () => {
  const projectRoot = await copyFixtureProject();
  const worktreePath = path.join(projectRoot, '.agent-reference', 'git', 'tooling', 'old');
  await fs.mkdir(worktreePath, { recursive: true });
  await fs.writeFile(path.join(projectRoot, 'agent-reference.json'), JSON.stringify({
    git: {
      tooling: 'github:example/tooling#main'
    }
  }, null, 2));
  await writeManifest(projectRoot, worktreePath, '1.3.3', [
    {
      kind: 'git',
      name: 'tooling',
      requested: 'github:example/tooling#old',
      repositoryUrl: 'https://github.com/example/tooling.git',
      bareRepositoryPath: path.join(projectRoot, '.agent-reference', 'bare.git'),
      path: worktreePath,
      checkoutRef: 'old',
      checkoutSha: 'abc123',
      refSource: 'configured'
    }
  ]);

  const report = await getStatusReport(path.join(projectRoot, 'package.json'));

  assert.equal(report.references.length, 1);
  assert.equal(report.references[0]?.kind, 'git');
  assert.equal(report.references[0]?.name, 'tooling');
  assert.equal(report.references[0]?.status, 'stale');
  assert.equal(report.references[0]?.path, worktreePath);
});

async function copyFixtureProject(): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-reference-status-test-'));
  await fs.cp(path.join(repoRoot, 'fixtures/pnpm-basic'), tempDir, { recursive: true });
  await fs.rm(path.join(tempDir, '.agent-reference.json'), { force: true });
  return tempDir;
}

async function writeManifest(
  projectRoot: string,
  worktreePath: string,
  version: string,
  extraReferences: AgentReferenceManifest['references'] = []
): Promise<void> {
  const manifest: AgentReferenceManifest = {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    projectRoot,
    references: [
      {
        kind: 'package',
        name: 'tiny-invariant',
        version,
        packageManager: 'pnpm',
        repositoryUrl: 'https://github.com/alexreardon/tiny-invariant.git',
        repositoryDirectory: null,
        gitHead: 'abc123',
        bareRepositoryPath: path.join(projectRoot, '.agent-reference', 'bare.git'),
        path: worktreePath,
        checkoutRef: 'abc123',
        checkoutSha: 'abc123',
        refSource: 'gitHead'
      },
      ...extraReferences
    ]
  };

  await fs.writeFile(path.join(projectRoot, '.agent-reference.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}
