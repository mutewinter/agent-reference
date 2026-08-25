import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import { getReferences } from '../src/get.ts';
import { stateFilePath } from '../src/manifest.ts';
import { getStatusReport } from '../src/status.ts';
import type { AgentReferenceManifest } from '../src/types.ts';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(import.meta.dirname, '..');

test('materializes a lockfile dependency with no config entry at all', async () => {
  const { projectRoot, storeDir, tempDir } = await scenario('zero-config');
  await fs.rm(path.join(projectRoot, 'agent-reference.json'), { force: true });
  const source = await createSourceRepo(tempDir, 'tiny-invariant', '1.3.3');

  const [result] = await getReferences(path.join(projectRoot, 'package.json'), ['tiny-invariant'], {
    metadataMap: metadataFor(source, 'tiny-invariant', '1.3.3'),
    storeDir,
  });

  assert.equal(result?.kind, 'package');
  assert.equal(result?.version, '1.3.3');
  assert.equal(result?.confidence, 'verified');
  assert.equal(result?.recorded, true);
  const manifest = JSON.parse(
    await fs.readFile(path.join(result?.path ?? '', 'package.json'), 'utf8'),
  ) as {
    version: string;
  };
  assert.equal(manifest.version, '1.3.3');
});

test('records a canonical materialization so status reports it ready', async () => {
  const { projectRoot, storeDir, tempDir } = await scenario('recorded');
  const source = await createSourceRepo(tempDir, 'tiny-invariant', '1.3.3');

  await getReferences(path.join(projectRoot, 'package.json'), ['tiny-invariant'], {
    metadataMap: metadataFor(source, 'tiny-invariant', '1.3.3'),
    storeDir,
  });

  const state = JSON.parse(
    await fs.readFile(stateFilePath(storeDir, projectRoot), 'utf8'),
  ) as AgentReferenceManifest;
  assert.equal(state.references[0]?.name, 'tiny-invariant');

  const report = await getStatusReport(path.join(projectRoot, 'package.json'), { storeDir });
  assert.equal(report.references[0]?.status, 'ready');
});

test('an explicit historical version is a one-off: materialized but not recorded', async () => {
  const { projectRoot, storeDir, tempDir } = await scenario('historical');
  const source = await createSourceRepo(tempDir, 'tiny-invariant', '1.2.0');

  const [result] = await getReferences(
    path.join(projectRoot, 'package.json'),
    ['tiny-invariant@1.2.0'],
    {
      metadataMap: metadataFor(source, 'tiny-invariant', '1.2.0'),
      storeDir,
    },
  );

  assert.equal(result?.version, '1.2.0');
  assert.equal(result?.recorded, false);
  await assert.rejects(fs.access(stateFilePath(storeDir, projectRoot)));
});

test('materializes an ad hoc git spec without touching project state', async () => {
  const { projectRoot, storeDir, tempDir } = await scenario('ad-hoc-git');
  const source = await createSourceRepo(tempDir, 'scratch-tool', '0.0.1');

  const [result] = await getReferences(
    path.join(projectRoot, 'package.json'),
    [`file://${source.path}#${source.commit}`],
    { storeDir },
  );

  assert.equal(result?.kind, 'git');
  assert.equal(result?.checkoutSha, source.commit);
  assert.equal(result?.recorded, false);
  await assert.rejects(fs.access(stateFilePath(storeDir, projectRoot)));
});

test('resolves a configured folder reference to its absolute path', async () => {
  const { projectRoot, storeDir } = await scenario('folder');
  const folderPath = path.join(projectRoot, 'notes');
  await fs.mkdir(folderPath, { recursive: true });
  await fs.writeFile(
    path.join(projectRoot, 'agent-reference.json'),
    JSON.stringify({ references: { notes: './notes' } }),
  );

  const [result] = await getReferences(path.join(projectRoot, 'package.json'), ['notes'], {
    storeDir,
  });

  assert.equal(result?.kind, 'path');
  assert.equal(result?.path, folderPath);
  assert.equal(result?.recorded, false);
});

test('materializes configured references in a directory that is not a Node project', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-reference-get-no-node-test-'));
  const projectRoot = path.join(tempDir, 'writing');
  const folderPath = path.join(projectRoot, 'notes');
  await fs.mkdir(folderPath, { recursive: true });
  const source = await createSourceRepo(tempDir, 'scratch-tool', '0.0.1');
  await fs.writeFile(
    path.join(projectRoot, 'agent-reference.json'),
    JSON.stringify(
      {
        references: {
          notes: './notes',
          tooling: `file://${source.path}#${source.commit}`,
        },
      },
      null,
      2,
    ),
  );

  const results = await getReferences(projectRoot, ['notes', 'tooling'], {
    storeDir: path.join(tempDir, 'store'),
  });

  assert.equal(results[0]?.path, folderPath);
  assert.equal(results[1]?.checkoutSha, source.commit);
  assert.equal(results[1]?.recorded, true);
});

test('one name means one thing, so nothing has to be qualified', async () => {
  const { projectRoot, storeDir } = await scenario('one-namespace');
  await fs.mkdir(path.join(projectRoot, 'tooling'), { recursive: true });
  // Two kinds sharing a name used to be legal and needed a `path:`/`git:` prefix at every
  // lookup. One map refuses it once, where it is written.
  await fs.writeFile(
    path.join(projectRoot, 'agent-reference.json'),
    JSON.stringify({
      references: { tooling: './tooling', 'tooling-upstream': 'github:example/tooling' },
    }),
  );

  const [result] = await getReferences(path.join(projectRoot, 'package.json'), ['tooling'], {
    storeDir,
  });
  assert.equal(result?.kind, 'path');
});

test('a set is a name that resolves to every reference in it', async () => {
  const { projectRoot, storeDir, tempDir } = await scenario('set-expansion');
  const first = await createSourceRepo(tempDir, 'first-tool', '0.0.1');
  const second = await createSourceRepo(tempDir, 'second-tool', '0.0.1');
  await fs.mkdir(path.join(projectRoot, 'notes'), { recursive: true });
  await fs.writeFile(
    path.join(projectRoot, 'agent-reference.json'),
    JSON.stringify({
      references: {
        notes: './notes',
        harnesses: {
          description: 'Two little repositories',
          references: [
            { source: `file://${first.path}`, name: 'first' },
            { source: `file://${second.path}`, name: 'second' },
          ],
        },
      },
    }),
  );

  const results = await getReferences(path.join(projectRoot, 'package.json'), ['harnesses'], {
    storeDir,
  });
  assert.deepEqual(
    results.map((entry) => entry.name),
    ['first', 'second'],
  );

  // A set and a plain reference sit in one namespace, so one call takes both.
  const mixed = await getReferences(
    path.join(projectRoot, 'package.json'),
    ['harnesses', 'notes'],
    {
      storeDir,
    },
  );
  assert.deepEqual(
    mixed.map((entry) => entry.name),
    ['first', 'second', 'notes'],
  );
});

test('a package source carries its ecosystem, and the entry answers to the package name', async () => {
  const { projectRoot, storeDir, tempDir } = await scenario('prefixed-key');
  const source = await createSourceRepo(tempDir, 'tiny-invariant', '1.3.3');
  // The spelling `get` prints back as canonical. It is now what the config stores, so the
  // pin below is reachable rather than silently inert.
  await fs.writeFile(
    path.join(projectRoot, 'agent-reference.json'),
    JSON.stringify({
      references: {
        'tiny-invariant': {
          source: 'npm:tiny-invariant@1.3.3',
          repository: `file://${source.path}`,
          ref: source.commit,
        },
      },
    }),
  );

  const [result] = await getReferences(path.join(projectRoot, 'package.json'), ['tiny-invariant'], {
    storeDir,
  });
  assert.equal(result?.name, 'tiny-invariant');
  assert.equal(result?.confidence, 'pinned');
  assert.equal(result?.checkoutSha, source.commit);
});

test('a path spec nothing declares resolves where it points', async () => {
  const { projectRoot, storeDir } = await scenario('ad-hoc-path');
  const folderPath = path.join(projectRoot, 'notes');
  await fs.mkdir(folderPath, { recursive: true });

  // One grammar: a source the config would accept is a spec `get` accepts, declared or not.
  const [result] = await getReferences(path.join(projectRoot, 'package.json'), ['./notes'], {
    storeDir,
  });
  assert.equal(result?.kind, 'path');
  assert.equal(result?.path, folderPath);
  assert.equal(result?.recorded, false);

  await assert.rejects(
    getReferences(path.join(projectRoot, 'package.json'), ['./nowhere'], { storeDir }),
    /which does not exist/,
  );
});

async function scenario(
  label: string,
): Promise<{ projectRoot: string; storeDir: string; tempDir: string }> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), `agent-reference-get-${label}-test-`));
  const projectRoot = path.join(tempDir, 'project');
  await fs.cp(path.join(repoRoot, 'fixtures/pnpm-basic'), projectRoot, { recursive: true });
  return { projectRoot, storeDir: path.join(tempDir, 'store'), tempDir };
}

function metadataFor(
  source: { path: string; commit: string },
  name: string,
  version: string,
): Record<string, object> {
  return {
    [`${name}@${version}`]: {
      name,
      version,
      repository: { type: 'git', url: source.path },
      gitHead: source.commit,
    },
  };
}

async function createSourceRepo(
  parentDir: string,
  name: string,
  version: string,
): Promise<{ path: string; commit: string }> {
  const repoPath = path.join(parentDir, `${name}-source`);
  await fs.mkdir(repoPath, { recursive: true });
  await git(['init', '-b', 'main'], repoPath);
  await git(['config', 'user.email', 'agent-reference@example.test'], repoPath);
  await git(['config', 'user.name', 'agent-reference Test'], repoPath);
  await git(['config', 'commit.gpgSign', 'false'], repoPath);
  await fs.writeFile(path.join(repoPath, 'package.json'), JSON.stringify({ name, version }));
  await git(['add', '-A'], repoPath);
  await git(['commit', '-m', `${name} ${version}`], repoPath);
  return { path: repoPath, commit: await git(['rev-parse', 'HEAD'], repoPath) };
}

async function git(args: string[], cwd: string): Promise<string> {
  const result = await execFileAsync('git', args, { cwd, encoding: 'utf8' });
  return result.stdout.trim();
}
