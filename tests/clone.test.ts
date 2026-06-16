import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import { cloneReferences } from '../src/core.ts';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(import.meta.dirname, '..');

test('clones a selected dependency into a project worktree using local metadata', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-reference-test-'));
  const projectRoot = await copyFixtureProject(tempDir);
  const sourceRepo = path.join(tempDir, 'tiny-invariant-source');
  await fs.mkdir(sourceRepo);
  await git(['init'], sourceRepo);
  await git(['config', 'user.email', 'agent-reference@example.test'], sourceRepo);
  await git(['config', 'user.name', 'agent-reference Test'], sourceRepo);
  await fs.writeFile(path.join(sourceRepo, 'index.js'), 'export const ok = true;\n');
  await git(['add', 'index.js'], sourceRepo);
  await git(['commit', '-m', 'initial'], sourceRepo);
  const commit = (await git(['rev-parse', 'HEAD'], sourceRepo)).trim();

  const result = await cloneReferences(path.join(projectRoot, 'package.json'), {
    packages: ['tiny-invariant'],
    metadataMap: {
      'tiny-invariant@1.3.3': {
        name: 'tiny-invariant',
        version: '1.3.3',
        repository: {
          type: 'git',
          url: sourceRepo
        },
        gitHead: commit
      }
    },
    bareStoreDir: path.join(tempDir, 'store'),
    worktreeRoot: path.join(tempDir, 'worktrees')
  });

  assert.equal(result.cloned.length, 1);
  assert.equal(result.cloned[0]?.checkoutSha, commit);
  assert.equal(await fs.readFile(path.join(result.cloned[0]?.worktreePath ?? '', 'index.js'), 'utf8'), 'export const ok = true;\n');
  assert.equal(result.skipped.length, 0);
});

test('clones packages selected by agent-reference.json', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-reference-config-test-'));
  const projectRoot = await copyFixtureProject(tempDir);
  const sourceRepo = path.join(tempDir, 'tiny-invariant-source');
  await fs.mkdir(sourceRepo);
  await git(['init'], sourceRepo);
  await git(['config', 'user.email', 'agent-reference@example.test'], sourceRepo);
  await git(['config', 'user.name', 'agent-reference Test'], sourceRepo);
  await fs.writeFile(path.join(sourceRepo, 'index.js'), 'export const fromConfig = true;\n');
  await git(['add', 'index.js'], sourceRepo);
  await git(['commit', '-m', 'initial'], sourceRepo);
  const commit = (await git(['rev-parse', 'HEAD'], sourceRepo)).trim();

  const result = await cloneReferences(path.join(projectRoot, 'package.json'), {
    metadataMap: {
      'tiny-invariant@1.3.3': {
        name: 'tiny-invariant',
        version: '1.3.3',
        repository: {
          type: 'git',
          url: sourceRepo
        },
        gitHead: commit
      }
    },
    bareStoreDir: path.join(tempDir, 'store'),
    worktreeRoot: path.join(tempDir, 'worktrees')
  });

  assert.deepEqual(result.selected.map((dependency) => dependency.name), ['tiny-invariant']);
  assert.equal(result.cloned[0]?.checkoutSha, commit);
});

test('clones config-declared packages that are not in package.json', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-reference-extra-config-test-'));
  const projectRoot = await copyFixtureProject(tempDir);
  await fs.writeFile(path.join(projectRoot, 'agent-reference.json'), JSON.stringify({
    packages: {
      'tiny-warning': '1.0.3'
    }
  }, null, 2));

  const sourceRepo = path.join(tempDir, 'tiny-warning-source');
  await fs.mkdir(sourceRepo);
  await git(['init'], sourceRepo);
  await git(['config', 'user.email', 'agent-reference@example.test'], sourceRepo);
  await git(['config', 'user.name', 'agent-reference Test'], sourceRepo);
  await fs.writeFile(path.join(sourceRepo, 'index.js'), 'export const extra = true;\n');
  await git(['add', 'index.js'], sourceRepo);
  await git(['commit', '-m', 'initial'], sourceRepo);
  const commit = (await git(['rev-parse', 'HEAD'], sourceRepo)).trim();

  const result = await cloneReferences(path.join(projectRoot, 'package.json'), {
    metadataMap: {
      'tiny-warning@1.0.3': {
        name: 'tiny-warning',
        version: '1.0.3',
        repository: {
          type: 'git',
          url: sourceRepo
        },
        gitHead: commit
      }
    },
    bareStoreDir: path.join(tempDir, 'store'),
    worktreeRoot: path.join(tempDir, 'worktrees')
  });

  assert.deepEqual(result.selected.map((dependency) => `${dependency.name}@${dependency.version}`), [
    'tiny-warning@1.0.3'
  ]);
  assert.equal(result.cloned[0]?.checkoutSha, commit);
});

test('clones configured git references', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-reference-git-config-test-'));
  const projectRoot = await copyFixtureProject(tempDir);
  const sourceRepo = path.join(tempDir, 'tooling-source');
  await fs.mkdir(sourceRepo);
  await git(['init'], sourceRepo);
  await git(['config', 'user.email', 'agent-reference@example.test'], sourceRepo);
  await git(['config', 'user.name', 'agent-reference Test'], sourceRepo);
  await fs.writeFile(path.join(sourceRepo, 'tool.js'), 'export const tool = true;\n');
  await git(['add', 'tool.js'], sourceRepo);
  await git(['commit', '-m', 'initial'], sourceRepo);
  const commit = (await git(['rev-parse', 'HEAD'], sourceRepo)).trim();
  const relativeSourceRepo = path.relative(projectRoot, sourceRepo);

  await fs.writeFile(path.join(projectRoot, 'agent-reference.json'), JSON.stringify({
    git: {
      tooling: `file:${relativeSourceRepo}#${commit}`
    }
  }, null, 2));

  const result = await cloneReferences(path.join(projectRoot, 'package.json'), {
    bareStoreDir: path.join(tempDir, 'store')
  });

  assert.equal(result.cloned.length, 0);
  assert.equal(result.clonedGit.length, 1);
  assert.equal(result.clonedGit[0]?.checkoutSha, commit);
  assert.equal(await fs.readFile(path.join(result.clonedGit[0]?.worktreePath ?? '', 'tool.js'), 'utf8'), 'export const tool = true;\n');
});

async function copyFixtureProject(tempDir: string): Promise<string> {
  const projectRoot = path.join(tempDir, 'project');
  await fs.cp(path.join(repoRoot, 'fixtures/pnpm-basic'), projectRoot, { recursive: true });
  await fs.rm(path.join(projectRoot, '.agent-reference'), { recursive: true, force: true });
  return projectRoot;
}

async function git(args: string[], cwd: string): Promise<string> {
  const result = await execFileAsync('git', args, { cwd, encoding: 'utf8' });
  return result.stdout.trim();
}
