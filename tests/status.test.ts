import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { manifestReferencePath } from '../src/git.ts';
import { stateFilePath } from '../src/manifest.ts';
import { getStatusReport } from '../src/status.ts';
import type { AgentReferenceManifest, AgentReferenceManifestReference } from '../src/types.ts';

const repoRoot = path.resolve(import.meta.dirname, '..');
const STORE_DIR = '/tmp/agent-reference-status-test-store';

test('reports never-materialized dependencies as declared, not as a problem', async () => {
  const projectRoot = await copyFixtureProject();
  const report = await getStatusReport(path.join(projectRoot, 'package.json'), { storeDir: STORE_DIR });

  assert.equal(report.references.length, 1);
  assert.equal(report.references[0]?.kind, 'package');
  assert.equal(report.references[0]?.name, 'tiny-invariant');
  assert.equal(report.references[0]?.currentVersion, '1.3.3');
  assert.equal(report.references[0]?.status, 'declared');
  assert.match(report.references[0]?.action ?? '', /agent-reference get tiny-invariant/);
  assert.equal(report.problems.length, 0);
  assert.deepEqual(report.nextSteps, []);
});

test('reports ready dependencies with store worktree paths', async () => {
  const projectRoot = await copyFixtureProject();
  await useConfig(projectRoot);
  const [reference] = await writeManifest(projectRoot, '1.3.3');
  const worktreePath = manifestReferencePath(STORE_DIR, reference!);
  await fs.mkdir(worktreePath, { recursive: true });

  const report = await getStatusReport(path.join(projectRoot, 'package.json'), { storeDir: STORE_DIR });

  assert.equal(report.references[0]?.status, 'ready');
  assert.equal(report.references[0]?.path, worktreePath);
  assert.equal(report.references[0]?.checkoutSha, 'abc123');
});

test('reports stale dependencies when cloned version differs from lockfile', async () => {
  const projectRoot = await copyFixtureProject();
  await useConfig(projectRoot);
  await writeManifest(projectRoot, '1.2.0');

  const report = await getStatusReport(path.join(projectRoot, 'package.json'), { storeDir: STORE_DIR });

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

  const report = await getStatusReport(path.join(projectRoot, 'package.json'), { storeDir: STORE_DIR });

  assert.equal(report.references.length, 1);
  assert.equal(report.references[0]?.kind, 'package');
  assert.equal(report.references[0]?.name, 'tiny-warning');
  assert.equal(report.references[0]?.packageManager, 'config');
  assert.equal(report.references[0]?.currentVersion, '1.0.3');
  assert.equal(report.references[0]?.status, 'declared');
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

  const report = await getStatusReport(path.join(projectRoot, 'package.json'), { storeDir: STORE_DIR });

  assert.equal(report.references.length, 1);
  assert.equal(report.references[0]?.kind, 'folder');
  assert.equal(report.references[0]?.name, 'design-notes');
  assert.equal(report.references[0]?.status, 'ready');
  assert.equal(report.references[0]?.scope, 'local');
  assert.equal(report.references[0]?.path, folderPath);
});

test('reports stale git references when configured spec changes', async () => {
  const projectRoot = await copyFixtureProject();
  await fs.writeFile(path.join(projectRoot, 'agent-reference.json'), JSON.stringify({
    git: {
      tooling: 'github:example/tooling#main'
    }
  }, null, 2));
  const gitReference: AgentReferenceManifestReference = {
    kind: 'git',
    name: 'tooling',
    requested: 'github:example/tooling#old',
    repositoryUrl: 'https://github.com/example/tooling.git',
    checkoutRef: 'old',
    checkoutSha: 'abc123',
    refSource: 'configured'
  };
  await writeManifest(projectRoot, '1.3.3', [gitReference]);

  const report = await getStatusReport(path.join(projectRoot, 'package.json'), { storeDir: STORE_DIR });

  assert.equal(report.references.length, 1);
  assert.equal(report.references[0]?.kind, 'git');
  assert.equal(report.references[0]?.name, 'tooling');
  assert.equal(report.references[0]?.status, 'stale');
  assert.equal(report.references[0]?.path, manifestReferencePath(STORE_DIR, gitReference));
});

async function copyFixtureProject(): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-reference-status-test-'));
  await fs.cp(path.join(repoRoot, 'fixtures/pnpm-basic'), tempDir, { recursive: true });
  return tempDir;
}

async function useConfig(projectRoot: string): Promise<void> {
  await fs.writeFile(path.join(projectRoot, 'agent-reference.json'), JSON.stringify({
    packages: { 'tiny-invariant': 'installed' }
  }, null, 2));
}

async function writeManifest(
  projectRoot: string,
  version: string,
  extraReferences: AgentReferenceManifest['references'] = []
): Promise<AgentReferenceManifest['references']> {
  const manifest: AgentReferenceManifest = {
    schemaVersion: 6,
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
        checkoutRef: 'abc123',
        checkoutSha: 'abc123',
        refSource: 'gitHead',
        confidence: 'verified',
        pinnedRef: null
      },
      ...extraReferences
    ]
  };

  const statePath = stateFilePath(STORE_DIR, projectRoot);
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  await fs.writeFile(statePath, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest.references;
}
