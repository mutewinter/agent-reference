import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { scanProject } from '../src/scanner.ts';

const repoRoot = path.resolve(import.meta.dirname, '..');

test('scans exact dependency versions from npm package-lock.json', async () => {
  const dependencies = await scanProject(path.join(repoRoot, 'fixtures/npm-basic/package.json'));

  assert.deepEqual(
    dependencies.map((dependency) => `${dependency.name}@${dependency.version}`),
    ['react@18.2.0']
  );
  assert.equal(dependencies[0]?.packageManager, 'npm');
});

test('scans exact dependency versions from Bun text lockfile', async () => {
  const dependencies = await scanProject(path.join(repoRoot, 'fixtures/bun-basic/package.json'));

  assert.deepEqual(
    dependencies.map((dependency) => `${dependency.name}@${dependency.version}`),
    ['react@18.2.0']
  );
  assert.equal(dependencies[0]?.packageManager, 'bun');
});

test('scans exact dependency versions from Yarn lockfile', async () => {
  const dependencies = await scanProject(path.join(repoRoot, 'fixtures/yarn-classic/package.json'));

  assert.deepEqual(
    dependencies.map((dependency) => `${dependency.name}@${dependency.version}`),
    ['react@18.2.0', 'typescript@5.9.2', 'zod@4.0.17']
  );
  assert.equal(dependencies[0]?.packageManager, 'yarn');
});
