import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { displayPath } from '../src/fs-utils.ts';
import { defaultStoreDir } from '../src/git.ts';
import { resolveProjectStoreDir } from '../src/reference-context.ts';
import { formatBytes, inspectStore } from '../src/store.ts';

const DAY_MS = 24 * 60 * 60 * 1000;

test('the store lives in one short home directory on every platform', () => {
  assert.equal(defaultStoreDir(), path.join(os.homedir(), '.agent-reference'));

  process.env.AGENT_REFERENCE_STORE_DIR = '/tmp/somewhere-else';
  try {
    assert.equal(defaultStoreDir(), '/tmp/somewhere-else');
  } finally {
    delete process.env.AGENT_REFERENCE_STORE_DIR;
  }
});

test('reports each repository with its size and checkout count', async () => {
  const storeDir = await buildStore({
    zod: ['aaaaaaaaaaaa', 'bbbbbbbbbbbb'],
    table: ['cccccccccccc'],
  });

  const report = await inspectStore({ storeDir });

  assert.deepEqual(
    report.repositories.map((repository) => [repository.name, repository.checkouts.length]),
    [
      ['github.com/acme/zod', 2],
      ['github.com/acme/table', 1],
    ],
  );
  assert.equal(report.totalBytes > 0, true);
  assert.equal(
    report.totalBytes,
    report.repositories.reduce((total, repository) => total + repository.totalBytes, 0),
  );
  assert.deepEqual(report.removed, []);
});

test('prune drops old checkouts and the mirror once nothing is checked out', async () => {
  const storeDir = await buildStore({
    zod: ['aaaaaaaaaaaa', 'bbbbbbbbbbbb'],
    table: ['cccccccccccc'],
  });
  const fresh = path.join(storeDir, 'src', 'github.com', 'acme', 'zod', 'bbbbbbbbbbbb');
  const now = Date.now() + 40 * DAY_MS;
  // Keep one checkout inside the window; everything else ages past it.
  await fs.utimes(fresh, new Date(now), new Date(now));

  const report = await inspectStore({ storeDir, prune: true, days: 30, now });

  assert.equal(await exists(fresh), true);
  assert.equal(
    await exists(path.join(storeDir, 'src', 'github.com', 'acme', 'zod', 'aaaaaaaaaaaa')),
    false,
  );
  // zod still has a live checkout, so its mirror stays.
  assert.equal(await exists(path.join(storeDir, 'git', 'github.com', 'acme', 'zod.git')), true);
  // table has none left, so the expensive part goes too.
  assert.equal(
    await exists(path.join(storeDir, 'src', 'github.com', 'acme', 'table', 'cccccccccccc')),
    false,
  );
  assert.equal(await exists(path.join(storeDir, 'git', 'github.com', 'acme', 'table.git')), false);
  assert.equal(report.reclaimedBytes > 0, true);
});

test('a repository under a subgroup is one repository, not two', async () => {
  // GitLab subgroups and self-hosted forges nest one level deeper than github does. Counting
  // levels split this into a phantom repository plus a mirror that looked unused, and prune
  // then deleted a live mirror whatever the age threshold said.
  const storeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-reference-nested-test-'));
  const checkout = path.join(
    storeDir,
    'src',
    'forge.example',
    'group',
    'sub',
    'repo',
    'aaaaaaaaaaaa',
  );
  const bare = path.join(storeDir, 'git', 'forge.example', 'group', 'sub', 'repo.git');
  await fs.mkdir(checkout, { recursive: true });
  await fs.mkdir(bare, { recursive: true });
  await fs.writeFile(path.join(checkout, 'index.js'), 'y'.repeat(1024));
  await fs.writeFile(path.join(bare, 'packed-refs'), 'x'.repeat(2048));

  const report = await inspectStore({ storeDir });
  const [repository, ...rest] = report.repositories;

  assert.deepEqual(rest, []);
  assert.equal(repository?.name, 'forge.example/group/sub/repo');
  assert.equal(repository?.bareRepositoryPath, bare);
  assert.deepEqual(
    repository?.checkouts.map((entry) => entry.commit),
    ['aaaaaaaaaaaa'],
  );

  const pruned = await inspectStore({ storeDir, prune: true, days: 30 });
  assert.deepEqual(pruned.removed, []);
  assert.equal(await exists(bare), true);
});

test('the store a project configures is the store store reads', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-reference-cachedir-test-'));
  const projectRoot = path.join(tempDir, 'project');
  await fs.mkdir(
    path.join(projectRoot, '.cache', 'src', 'github.com', 'acme', 'zod', 'aaaaaaaaaaaa'),
    {
      recursive: true,
    },
  );
  await fs.writeFile(
    path.join(projectRoot, 'agent-reference.json'),
    JSON.stringify({ cacheDir: './.cache', references: { zod: 'npm:zod@3.22.0' } }),
  );

  // get, clone, and status all honor cacheDir. store reading the default store instead made
  // it report an empty store, and made --prune trim a store nothing here had written.
  const storeDir = await resolveProjectStoreDir(projectRoot, { cwd: projectRoot });
  assert.equal(storeDir, path.join(projectRoot, '.cache'));

  const report = await inspectStore({ storeDir });
  assert.deepEqual(
    report.repositories.map((repository) => repository.name),
    ['github.com/acme/zod'],
  );
});

test('formats byte counts for humans', () => {
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(1536), '1.5 KB');
  assert.equal(formatBytes(20 * 1024 * 1024), '20 MB');
});

test('home paths shorten only when a human is watching', () => {
  const home = '/Users/dev';
  const stored = '/Users/dev/.agent-reference/src/github.com/acme/zod/abc123def456';

  assert.equal(
    displayPath(stored, { tilde: true, home }),
    '~/.agent-reference/src/github.com/acme/zod/abc123def456',
  );
  // Piped output feeds agents, which pass the value straight to file APIs.
  assert.equal(displayPath(stored, { tilde: false, home }), stored);
  assert.equal(displayPath('/opt/elsewhere', { tilde: true, home }), '/opt/elsewhere');
  assert.equal(displayPath(null, { tilde: true, home }), '-');
});

async function buildStore(repositories: Record<string, string[]>): Promise<string> {
  const storeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-reference-store-test-'));

  for (const [name, commits] of Object.entries(repositories)) {
    const bare = path.join(storeDir, 'git', 'github.com', 'acme', `${name}.git`);
    await fs.mkdir(bare, { recursive: true });
    await fs.writeFile(path.join(bare, 'packed-refs'), 'x'.repeat(2048));

    for (const commit of commits) {
      const checkout = path.join(storeDir, 'src', 'github.com', 'acme', name, commit);
      await fs.mkdir(checkout, { recursive: true });
      await fs.writeFile(path.join(checkout, 'index.js'), 'y'.repeat(name === 'zod' ? 4096 : 1024));
    }
  }

  return storeDir;
}

async function exists(target: string): Promise<boolean> {
  return Boolean(await fs.stat(target).catch(() => null));
}
