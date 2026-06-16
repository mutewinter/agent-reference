import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import { cloneReferences } from '../src/core.ts';
import type { AgentReferenceManifest } from '../src/types.ts';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(import.meta.dirname, '..');

test('clones a selected dependency into a project worktree using local metadata', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-reference-test-'));
  const projectRoot = await copyFixtureProject(tempDir);
  const sourceRepo = await createSourceRepo(tempDir, 'tiny-invariant-source', 'index.js', 'export const ok = true;\n');

  const result = await cloneReferences(path.join(projectRoot, 'package.json'), {
    packages: ['tiny-invariant'],
    metadataMap: {
      'tiny-invariant@1.3.3': {
        name: 'tiny-invariant',
        version: '1.3.3',
        repository: {
          type: 'git',
          url: sourceRepo.path
        },
        gitHead: sourceRepo.commit
      }
    },
    bareStoreDir: path.join(tempDir, 'store'),
    worktreeRoot: path.join(tempDir, 'worktrees')
  });

  assert.equal(result.cloned.length, 1);
  assert.equal(result.cloned[0]?.checkoutSha, sourceRepo.commit);
  assert.equal(await fs.readFile(path.join(result.cloned[0]?.worktreePath ?? '', 'index.js'), 'utf8'), 'export const ok = true;\n');
  assert.equal(result.skipped.length, 0);
});

test('clones packages selected by agent-reference.json', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-reference-config-test-'));
  const projectRoot = await copyFixtureProject(tempDir);
  const sourceRepo = await createSourceRepo(tempDir, 'tiny-invariant-source', 'index.js', 'export const fromConfig = true;\n');

  const result = await cloneReferences(path.join(projectRoot, 'package.json'), {
    metadataMap: {
      'tiny-invariant@1.3.3': {
        name: 'tiny-invariant',
        version: '1.3.3',
        repository: {
          type: 'git',
          url: sourceRepo.path
        },
        gitHead: sourceRepo.commit
      }
    },
    bareStoreDir: path.join(tempDir, 'store'),
    worktreeRoot: path.join(tempDir, 'worktrees')
  });

  assert.deepEqual(result.selected.map((dependency) => dependency.name), ['tiny-invariant']);
  assert.equal(result.cloned[0]?.checkoutSha, sourceRepo.commit);
});

test('clones config-declared packages that are not in package.json', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-reference-extra-config-test-'));
  const projectRoot = await copyFixtureProject(tempDir);
  await fs.writeFile(path.join(projectRoot, 'agent-reference.json'), JSON.stringify({
    packages: {
      'tiny-warning': '1.0.3'
    }
  }, null, 2));

  const sourceRepo = await createSourceRepo(tempDir, 'tiny-warning-source', 'index.js', 'export const extra = true;\n');

  const result = await cloneReferences(path.join(projectRoot, 'package.json'), {
    metadataMap: {
      'tiny-warning@1.0.3': {
        name: 'tiny-warning',
        version: '1.0.3',
        repository: {
          type: 'git',
          url: sourceRepo.path
        },
        gitHead: sourceRepo.commit
      }
    },
    bareStoreDir: path.join(tempDir, 'store'),
    worktreeRoot: path.join(tempDir, 'worktrees')
  });

  assert.deepEqual(result.selected.map((dependency) => `${dependency.name}@${dependency.version}`), [
    'tiny-warning@1.0.3'
  ]);
  assert.equal(result.cloned[0]?.checkoutSha, sourceRepo.commit);
});

test('clones configured git references', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-reference-git-config-test-'));
  const projectRoot = await copyFixtureProject(tempDir);
  const sourceRepo = await createSourceRepo(tempDir, 'tooling-source', 'tool.js', 'export const tool = true;\n');
  const relativeSourceRepo = path.relative(projectRoot, sourceRepo.path);

  await fs.writeFile(path.join(projectRoot, 'agent-reference.json'), JSON.stringify({
    git: {
      tooling: `file:${relativeSourceRepo}#${sourceRepo.commit}`
    }
  }, null, 2));

  const result = await cloneReferences(path.join(projectRoot, 'package.json'), {
    bareStoreDir: path.join(tempDir, 'store')
  });

  assert.equal(result.cloned.length, 0);
  assert.equal(result.clonedGit.length, 1);
  assert.equal(result.clonedGit[0]?.checkoutSha, sourceRepo.commit);
  assert.equal(await fs.readFile(path.join(result.clonedGit[0]?.worktreePath ?? '', 'tool.js'), 'utf8'), 'export const tool = true;\n');
});

test('preserves existing manifest references after a partial clone', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-reference-manifest-merge-test-'));
  const projectRoot = await copyFixtureProject(tempDir);
  const packageRepo = await createSourceRepo(tempDir, 'tiny-invariant-source', 'index.js', 'export const packageSource = true;\n');

  await cloneReferences(path.join(projectRoot, 'package.json'), {
    metadataMap: {
      'tiny-invariant@1.3.3': {
        name: 'tiny-invariant',
        version: '1.3.3',
        repository: {
          type: 'git',
          url: packageRepo.path
        },
        gitHead: packageRepo.commit
      }
    },
    bareStoreDir: path.join(tempDir, 'store')
  });

  const gitRepo = await createSourceRepo(tempDir, 'tooling-source', 'tool.js', 'export const tool = true;\n');

  await fs.writeFile(path.join(projectRoot, 'agent-reference.json'), JSON.stringify({
    git: {
      tooling: `file:${path.relative(projectRoot, gitRepo.path)}#${gitRepo.commit}`
    }
  }, null, 2));

  await cloneReferences(path.join(projectRoot, 'package.json'), {
    bareStoreDir: path.join(tempDir, 'store')
  });

  const manifest = JSON.parse(
    await fs.readFile(path.join(projectRoot, '.agent-reference', 'manifest.json'), 'utf8')
  ) as AgentReferenceManifest;

  assert.equal(manifest.references.some((reference) => reference.kind === 'package' && reference.name === 'tiny-invariant'), true);
  assert.equal(manifest.references.some((reference) => reference.kind === 'git' && reference.name === 'tooling'), true);
});

async function copyFixtureProject(tempDir: string): Promise<string> {
  const projectRoot = path.join(tempDir, 'project');
  await fs.cp(path.join(repoRoot, 'fixtures/pnpm-basic'), projectRoot, { recursive: true });
  await fs.rm(path.join(projectRoot, '.agent-reference'), { recursive: true, force: true });
  return projectRoot;
}

async function createSourceRepo(
  parentDir: string,
  name: string,
  fileName: string,
  content: string
): Promise<{ path: string; commit: string }> {
  const repoPath = path.join(parentDir, name);
  await fs.mkdir(repoPath);
  await git(['init'], repoPath);
  await git(['config', 'user.email', 'agent-reference@example.test'], repoPath);
  await git(['config', 'user.name', 'agent-reference Test'], repoPath);
  await fs.writeFile(path.join(repoPath, fileName), content);
  await git(['add', fileName], repoPath);
  await git(['commit', '-m', 'initial'], repoPath);
  return {
    path: repoPath,
    commit: (await git(['rev-parse', 'HEAD'], repoPath)).trim()
  };
}

async function git(args: string[], cwd: string): Promise<string> {
  const result = await execFileAsync('git', args, { cwd, encoding: 'utf8' });
  return result.stdout.trim();
}
