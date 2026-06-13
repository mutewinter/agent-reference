import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';

import { scanProject } from '../src/scanner.ts';

const repoRoot = path.resolve(import.meta.dirname, '..');

test('scans exact dependency versions from a PNPM lockfile importer', async () => {
  const dependencies = await scanProject(path.join(repoRoot, 'fixtures/pnpm-basic/package.json'));
  const versions = new Map(dependencies.map((dependency) => [dependency.name, dependency.version]));

  assert.equal(versions.get('react'), '18.2.0');
  assert.equal(versions.get('tiny-invariant'), '1.3.3');
  assert.equal(versions.get('typescript'), '5.9.2');
  assert.equal(versions.get('fsevents'), '2.3.3');
});

test('resolves nested PNPM workspace importer from package.json path', async () => {
  const dependencies = await scanProject(path.join(repoRoot, 'fixtures/pnpm-workspace/packages/app/package.json'));

  assert.deepEqual(
    dependencies.map((dependency) => `${dependency.name}@${dependency.version}`),
    ['zod@4.0.17']
  );
  assert.deepEqual(dependencies[0]?.importers, ['packages/app']);
});
