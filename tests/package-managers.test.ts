import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
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

test('a Bun lockfile survives comments and JSON-ish characters inside its strings', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-reference-bun-jsonc-test-'));
  await fs.writeFile(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'p', dependencies: { react: '^18.2.0' } }));
  // A `//` not preceded by a colon, and a literal `,}`, both inside a string value. A regex
  // stripper cannot tell either from the real thing, and silently mangles the descriptor.
  await fs.writeFile(
    path.join(tempDir, 'bun.lock'),
    [
      '{',
      '  // the resolved tree',
      '  "lockfileVersion": 1,',
      '  "workspaces": { "": { "dependencies": { "react": "^18.2.0" } } },',
      '  /* packages below */',
      '  "packages": {',
      '    "react": ["react@18.2.0", "git+ssh://host/org//react.git#tag,}", {}, "sha512-react"],',
      '  }',
      '}'
    ].join('\n')
  );

  const dependencies = await scanProject(path.join(tempDir, 'package.json'));
  assert.deepEqual(
    dependencies.map((dependency) => `${dependency.name}@${dependency.version}`),
    ['react@18.2.0']
  );
});
