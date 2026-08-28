import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { formatVersionsReport, getVersionsReport } from '../src/versions.ts';
import { scanProject } from '../src/scanner.ts';
import { getStatusReport } from '../src/status.ts';

const repoRoot = path.resolve(import.meta.dirname, '..');

test('scans exact dependency versions from npm package-lock.json', async () => {
  const dependencies = await scanProject(path.join(repoRoot, 'fixtures/npm-basic/package.json'));

  assert.deepEqual(
    dependencies.map((dependency) => `${dependency.name}@${dependency.version}`),
    ['react@18.2.0'],
  );
  assert.equal(dependencies[0]?.packageManager, 'npm');
});

test('scans exact dependency versions from Bun text lockfile', async () => {
  const dependencies = await scanProject(path.join(repoRoot, 'fixtures/bun-basic/package.json'));

  assert.deepEqual(
    dependencies.map((dependency) => `${dependency.name}@${dependency.version}`),
    ['react@18.2.0'],
  );
  assert.equal(dependencies[0]?.packageManager, 'bun');
});

test('scans exact dependency versions from Yarn lockfile', async () => {
  const dependencies = await scanProject(path.join(repoRoot, 'fixtures/yarn-classic/package.json'));

  assert.deepEqual(
    dependencies.map((dependency) => `${dependency.name}@${dependency.version}`),
    ['react@18.2.0', 'typescript@5.9.2', 'zod@4.0.17'],
  );
  assert.equal(dependencies[0]?.packageManager, 'yarn');
});

test('a Bun lockfile survives comments and JSON-ish characters inside its strings', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-reference-bun-jsonc-test-'));
  await fs.writeFile(
    path.join(tempDir, 'package.json'),
    JSON.stringify({ name: 'p', dependencies: { react: '^18.2.0' } }),
  );
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
      '}',
    ].join('\n'),
  );

  const dependencies = await scanProject(path.join(tempDir, 'package.json'));
  assert.deepEqual(
    dependencies.map((dependency) => `${dependency.name}@${dependency.version}`),
    ['react@18.2.0'],
  );
});

test('an npm workspace member stays visible instead of looking uninstalled', async () => {
  const web = path.join(repoRoot, 'fixtures/npm-workspace/apps/web/package.json');
  const dependencies = await scanProject(web);

  // A link carries no version, so it used to be filtered out entirely. That made an in-repo
  // package look like one nothing installs, and asking for it fetched an unrelated upstream.
  assert.deepEqual(
    dependencies.map((dependency) => `${dependency.name}@${dependency.version}`),
    ['@mono/shared@link:../../packages/shared', 'react@18.2.0'],
  );

  // The link is written relative to the importer that declared it, so it resolves to the
  // directory on disk rather than to somewhere under apps/web.
  const report = await getVersionsReport(web, '@mono/shared');
  assert.equal(report.versions[0]?.workspace, true);
  assert.equal(
    report.versions[0]?.path,
    path.join(repoRoot, 'fixtures/npm-workspace/packages/shared'),
  );
});

// bun.lockb threw out of the scanner, and the throw escaped every command that loads a
// project context: `get github:owner/repo` and `status` both died on a lockfile neither of
// them needed. A lockfile this tool cannot read answers the same as no lockfile at all, so
// it is a fact to report rather than a failure.
test('a binary Bun lockfile reports why it read nothing instead of failing', async () => {
  const project = path.join(repoRoot, 'fixtures/bun-binary/package.json');

  const dependencies = await scanProject(project);
  assert.deepEqual(dependencies, []);

  const report = await getVersionsReport(project, 'react');
  assert.deepEqual(report.versions, []);
  assert.match(report.lockfileUnreadable ?? '', /bun\.lockb is binary/);
  // Never "nothing installs react": that is a claim about a file that was never opened.
  const text = formatVersionsReport(report);
  assert.match(text, /bun\.lockb is binary/);
  assert.doesNotMatch(text, /Nothing in bun\.lockb installs/);
});

test('a git reference works in a project whose lockfile cannot be read', async () => {
  const status = await getStatusReport(path.join(repoRoot, 'fixtures/bun-binary'), {
    storeDir: path.join(os.tmpdir(), 'agent-reference-bun-binary-store'),
  });

  assert.equal(status.packageManager, 'bun');
  assert.match(status.lockfileUnreadable ?? '', /bun\.lockb is binary/);
  // Reported as a fact about the project, so the note telling a reader not to delete a
  // reference stays off: there is no reference to keep.
  const [first] = status.problems;
  assert.equal(first?.about, 'project');
  assert.equal(first?.severity, 'warning');
});
