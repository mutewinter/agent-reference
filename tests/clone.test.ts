import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import { cloneDependencies } from '../src/core.ts';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(import.meta.dirname, '..');

test('clones a selected dependency into a project worktree using local metadata', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'depclone-test-'));
  const sourceRepo = path.join(tempDir, 'tiny-invariant-source');
  await fs.mkdir(sourceRepo);
  await git(['init'], sourceRepo);
  await git(['config', 'user.email', 'depclone@example.test'], sourceRepo);
  await git(['config', 'user.name', 'DepClone Test'], sourceRepo);
  await fs.writeFile(path.join(sourceRepo, 'index.js'), 'export const ok = true;\n');
  await git(['add', 'index.js'], sourceRepo);
  await git(['commit', '-m', 'initial'], sourceRepo);
  const commit = (await git(['rev-parse', 'HEAD'], sourceRepo)).trim();

  const result = await cloneDependencies(path.join(repoRoot, 'fixtures/pnpm-basic/package.json'), {
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

test('clones dependencies selected by depclone.config.json', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'depclone-config-test-'));
  const sourceRepo = path.join(tempDir, 'tiny-invariant-source');
  await fs.mkdir(sourceRepo);
  await git(['init'], sourceRepo);
  await git(['config', 'user.email', 'depclone@example.test'], sourceRepo);
  await git(['config', 'user.name', 'DepClone Test'], sourceRepo);
  await fs.writeFile(path.join(sourceRepo, 'index.js'), 'export const fromConfig = true;\n');
  await git(['add', 'index.js'], sourceRepo);
  await git(['commit', '-m', 'initial'], sourceRepo);
  const commit = (await git(['rev-parse', 'HEAD'], sourceRepo)).trim();

  const result = await cloneDependencies(path.join(repoRoot, 'fixtures/pnpm-basic/package.json'), {
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

async function git(args: string[], cwd: string): Promise<string> {
  const result = await execFileAsync('git', args, { cwd, encoding: 'utf8' });
  return result.stdout.trim();
}
