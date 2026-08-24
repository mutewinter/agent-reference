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

test('a path reference may name a file, and status reports which it found', async () => {
  const projectRoot = await copyFixtureProject();
  await fs.mkdir(path.join(projectRoot, 'references'), { recursive: true });
  const notePath = path.join(projectRoot, 'references', 'release-checklist.md');
  await fs.writeFile(notePath, '# Release checklist\n');
  await fs.writeFile(path.join(projectRoot, 'agent-reference.json'), JSON.stringify({
    paths: {
      checklist: './references/release-checklist.md',
      references: './references',
      gone: './references/missing.md'
    }
  }, null, 2));

  const report = await getStatusReport(path.join(projectRoot, 'package.json'), { storeDir: STORE_DIR });
  const byName = new Map(report.references.map((entry) => [entry.name, entry]));

  assert.equal(byName.get('checklist')?.status, 'ready');
  assert.equal(byName.get('checklist')?.pathType, 'file');
  assert.equal(byName.get('checklist')?.path, notePath);
  assert.equal(byName.get('references')?.pathType, 'folder');
  // Nothing is on disk, so there is no shape to report.
  assert.equal(byName.get('gone')?.status, 'missing');
  assert.equal(byName.get('gone')?.pathType, null);
});

test('reports local folder references with absolute paths', async () => {
  const projectRoot = await copyFixtureProject();
  const folderPath = path.join(projectRoot, 'references', 'design-notes');
  await fs.mkdir(folderPath, { recursive: true });
  await fs.writeFile(path.join(projectRoot, 'agent-reference.json'), '{}\n');
  await fs.writeFile(path.join(projectRoot, 'agent-reference.local.json'), JSON.stringify({
    paths: {
      'design-notes': './references/design-notes'
    }
  }, null, 2));

  const report = await getStatusReport(path.join(projectRoot, 'package.json'), { storeDir: STORE_DIR });

  assert.equal(report.references.length, 1);
  assert.equal(report.references[0]?.kind, 'path');
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

test('works in a directory with no package.json or lockfile at all', async () => {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-reference-no-node-test-'));
  const folderPath = path.join(projectRoot, 'notes');
  await fs.mkdir(folderPath, { recursive: true });
  await fs.writeFile(path.join(projectRoot, 'agent-reference.json'), JSON.stringify({
    paths: { notes: './notes' },
    git: { tooling: 'github:example/tooling' }
  }, null, 2));

  const report = await getStatusReport(projectRoot, { storeDir: STORE_DIR });

  assert.deepEqual(report.references.map((entry) => [entry.name, entry.status]), [
    ['notes', 'ready'],
    ['tooling', 'declared']
  ]);
  assert.equal(report.problems.length, 0);
});

test('an empty directory reports no references instead of erroring', async () => {
  const emptyDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-reference-empty-test-'));
  const report = await getStatusReport(emptyDir, { storeDir: STORE_DIR });
  assert.deepEqual(report.references, []);
});

test('finds the nearest config walking up from a subdirectory', async () => {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-reference-walk-up-test-'));
  await fs.mkdir(path.join(projectRoot, 'deep', 'inside'), { recursive: true });
  await fs.writeFile(path.join(projectRoot, 'agent-reference.json'), JSON.stringify({
    git: { tooling: 'github:example/tooling' }
  }, null, 2));

  const report = await getStatusReport(path.join(projectRoot, 'deep', 'inside'), { storeDir: STORE_DIR });

  assert.equal(report.projectRoot, projectRoot);
  assert.equal(report.references[0]?.name, 'tooling');
});

test('a selector that is nobody\'s reference offers the reading that it was a command', async () => {
  const projectRoot = await copyFixtureProject();
  await useConfig(projectRoot);

  // Standing in for whatever the next release adds. A command a newer instruction names is
  // not rejected by an older build: it falls through to the default command and is read as
  // a reference name, so without this the failure blames the config.
  await assert.rejects(getStatusReport(projectRoot, { references: ['explain'], storeDir: STORE_DIR }), (error: Error) => {
    assert.match(error.message, /Nothing matched reference "explain"/);
    assert.match(error.message, /it has get, versions, status/);
    assert.match(error.message, /newer than the CLI/);
    return true;
  });
});

test('one name hitting does not excuse the one beside it that missed', async () => {
  const projectRoot = await copyFixtureProject();
  await useConfig(projectRoot);

  // A run naming several references used to succeed as long as any one of them hit, so a
  // typo was dropped in silence and the reference it meant was quietly never reported.
  await assert.rejects(
    getStatusReport(projectRoot, { references: ['tiny-invariant', 'tiny-invarient'], storeDir: STORE_DIR }),
    (error: Error) => {
      assert.match(error.message, /Nothing matched reference "tiny-invarient"/);
      assert.doesNotMatch(error.message, /reference "tiny-invariant"/);
      return true;
    }
  );
});

test('a miss on a name this build does have as a command reads as an ordinary miss', async () => {
  const projectRoot = await copyFixtureProject();
  await useConfig(projectRoot);

  // `guide` exists here, so nothing about this build is out of date and the hint would be
  // a false lead. It fires on the absence of the command, not on the shape of the word.
  await assert.rejects(getStatusReport(projectRoot, { references: ['guide'], storeDir: STORE_DIR }), (error: Error) => {
    assert.doesNotMatch(error.message, /newer than the CLI/);
    return true;
  });
});

test('a machine path in the committed config is a warning here, not a blocked reference', async () => {
  const projectRoot = await copyFixtureProject();
  await fs.writeFile(path.join(projectRoot, 'agent-reference.json'), JSON.stringify({
    paths: { notes: '~/notes' },
    git: { internal: 'file:/opt/checkouts/internal' }
  }));

  const report = await getStatusReport(path.join(projectRoot, 'package.json'), { storeDir: STORE_DIR });

  assert.deepEqual(
    report.problems.map((problem) => [problem.reference, problem.severity]),
    [
      ['path:notes', 'warning'],
      ['git:internal', 'warning']
    ]
  );
  assert.match(report.problems[0]?.fix ?? '', /Move this entry to agent-reference\.local\.json/);
  // Nothing here is unusable, so status must not tell the agent to stop and resolve errors.
  assert.deepEqual(report.nextSteps, []);
});

async function copyFixtureProject(): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-reference-status-test-'));
  await fs.cp(path.join(repoRoot, 'fixtures/pnpm-basic'), tempDir, { recursive: true });
  return tempDir;
}

async function useConfig(projectRoot: string): Promise<void> {
  await fs.writeFile(path.join(projectRoot, 'agent-reference.json'), JSON.stringify({
    packages: { 'tiny-invariant': '1.3.3' }
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
