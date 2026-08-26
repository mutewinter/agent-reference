import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import { cloneReferences } from '../src/core.ts';
import { stateFilePath } from '../src/manifest.ts';
import type { AgentReferenceManifest } from '../src/types.ts';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(import.meta.dirname, '..');

test('clones a selected dependency into a project worktree using local metadata', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-reference-test-'));
  const projectRoot = await copyFixtureProject(tempDir);
  const sourceRepo = await createSourceRepo(
    tempDir,
    'tiny-invariant-source',
    'index.js',
    'export const ok = true;\n',
  );

  const result = await cloneReferences(path.join(projectRoot, 'package.json'), {
    references: ['tiny-invariant'],
    metadataMap: {
      'tiny-invariant@1.3.3': {
        name: 'tiny-invariant',
        version: '1.3.3',
        repository: {
          type: 'git',
          url: sourceRepo.path,
        },
        gitHead: sourceRepo.commit,
      },
    },
    storeDir: path.join(tempDir, 'store'),
  });

  assert.equal(result.cloned.length, 1);
  assert.equal(result.cloned[0]?.checkoutSha, sourceRepo.commit);
  assert.equal(
    await fs.readFile(path.join(result.cloned[0]?.worktreePath ?? '', 'index.js'), 'utf8'),
    'export const ok = true;\n',
  );
  assert.equal(result.skipped.length, 0);
});

test('clones packages selected by agent-reference.json', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-reference-config-test-'));
  const projectRoot = await copyFixtureProject(tempDir);
  const sourceRepo = await createSourceRepo(
    tempDir,
    'tiny-invariant-source',
    'index.js',
    'export const fromConfig = true;\n',
  );

  const result = await cloneReferences(path.join(projectRoot, 'package.json'), {
    metadataMap: {
      'tiny-invariant@1.3.3': {
        name: 'tiny-invariant',
        version: '1.3.3',
        repository: {
          type: 'git',
          url: sourceRepo.path,
        },
        gitHead: sourceRepo.commit,
      },
    },
    storeDir: path.join(tempDir, 'store'),
  });

  assert.deepEqual(
    result.cloned.map((clone) => clone.dependency.name),
    ['tiny-invariant'],
  );
  assert.equal(result.cloned[0]?.checkoutSha, sourceRepo.commit);
});

test('clones config-declared packages that are not in package.json', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-reference-extra-config-test-'));
  const projectRoot = await copyFixtureProject(tempDir);
  await fs.writeFile(
    path.join(projectRoot, 'agent-reference.json'),
    JSON.stringify(
      {
        references: {
          'tiny-warning': {
            source: 'npm:tiny-warning@1.0.3',
            description: 'The dependency this project pins',
          },
        },
      },
      null,
      2,
    ),
  );

  const sourceRepo = await createSourceRepo(
    tempDir,
    'tiny-warning-source',
    'index.js',
    'export const extra = true;\n',
  );

  const result = await cloneReferences(path.join(projectRoot, 'package.json'), {
    metadataMap: {
      'tiny-warning@1.0.3': {
        name: 'tiny-warning',
        version: '1.0.3',
        repository: {
          type: 'git',
          url: sourceRepo.path,
        },
        gitHead: sourceRepo.commit,
      },
    },
    storeDir: path.join(tempDir, 'store'),
  });

  assert.deepEqual(
    result.cloned.map((clone) => `${clone.dependency.name}@${clone.dependency.version}`),
    ['tiny-warning@1.0.3'],
  );
  assert.equal(result.cloned[0]?.checkoutSha, sourceRepo.commit);
});

test('clones configured git references', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-reference-git-config-test-'));
  const projectRoot = await copyFixtureProject(tempDir);
  const sourceRepo = await createSourceRepo(
    tempDir,
    'tooling-source',
    'tool.js',
    'export const tool = true;\n',
  );

  await fs.writeFile(
    path.join(projectRoot, 'agent-reference.json'),
    JSON.stringify(
      {
        references: {
          tooling: {
            source: `file://${sourceRepo.path}#${sourceRepo.commit}`,
            description: 'The build tooling this project clones',
          },
        },
      },
      null,
      2,
    ),
  );

  const result = await cloneReferences(path.join(projectRoot, 'package.json'), {
    storeDir: path.join(tempDir, 'store'),
  });

  assert.equal(result.cloned.length, 0);
  assert.equal(result.clonedGit.length, 1);
  assert.equal(result.clonedGit[0]?.checkoutSha, sourceRepo.commit);
  assert.equal(
    await fs.readFile(path.join(result.clonedGit[0]?.worktreePath ?? '', 'tool.js'), 'utf8'),
    'export const tool = true;\n',
  );
});

test('preserves existing manifest references after a partial clone', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-reference-manifest-merge-test-'));
  const projectRoot = await copyFixtureProject(tempDir);
  const packageRepo = await createSourceRepo(
    tempDir,
    'tiny-invariant-source',
    'index.js',
    'export const packageSource = true;\n',
  );

  await cloneReferences(path.join(projectRoot, 'package.json'), {
    metadataMap: {
      'tiny-invariant@1.3.3': {
        name: 'tiny-invariant',
        version: '1.3.3',
        repository: {
          type: 'git',
          url: packageRepo.path,
        },
        gitHead: packageRepo.commit,
      },
    },
    storeDir: path.join(tempDir, 'store'),
  });

  const gitRepo = await createSourceRepo(
    tempDir,
    'tooling-source',
    'tool.js',
    'export const tool = true;\n',
  );

  await fs.writeFile(
    path.join(projectRoot, 'agent-reference.json'),
    JSON.stringify(
      {
        references: {
          tooling: {
            source: `file://${gitRepo.path}#${gitRepo.commit}`,
            description: 'The build tooling this project clones',
          },
        },
      },
      null,
      2,
    ),
  );

  await cloneReferences(path.join(projectRoot, 'package.json'), {
    storeDir: path.join(tempDir, 'store'),
  });

  const manifest = JSON.parse(
    await fs.readFile(stateFilePath(path.join(tempDir, 'store'), projectRoot), 'utf8'),
  ) as AgentReferenceManifest;

  assert.equal(
    manifest.references.some(
      (reference) => reference.kind === 'package' && reference.name === 'tiny-invariant',
    ),
    true,
  );
  assert.equal(
    manifest.references.some(
      (reference) => reference.kind === 'git' && reference.name === 'tooling',
    ),
    true,
  );
});

test('replaces the manifest entry on upgrade and leaves shared worktrees in place', async () => {
  const { projectRoot, tempDir, metadataFor, configFor, firstCommit, secondCommit } =
    await createUpgradeScenario('prune');

  await configFor('1.0.3');
  const first = await cloneReferences(path.join(projectRoot, 'package.json'), {
    metadataMap: metadataFor('1.0.3', firstCommit),
    storeDir: path.join(tempDir, 'store'),
  });

  await configFor('1.0.4');
  const second = await cloneReferences(path.join(projectRoot, 'package.json'), {
    metadataMap: metadataFor('1.0.4', secondCommit),
    storeDir: path.join(tempDir, 'store'),
  });

  assert.deepEqual(await manifestVersions(path.join(tempDir, 'store'), projectRoot), ['1.0.4']);
  assert.match(second.cloned[0]?.worktreePath ?? '', /[\\/]store[\\/]src[\\/]/);
  // Store worktrees are shared across projects, so the old version stays on disk.
  assert.equal(await pathExists(first.cloned[0]?.worktreePath ?? ''), true);
  assert.equal(await pathExists(second.cloned[0]?.worktreePath ?? ''), true);
});

async function createUpgradeScenario(label: string): Promise<{
  projectRoot: string;
  tempDir: string;
  firstCommit: string;
  secondCommit: string;
  metadataFor: (version: string, commit: string) => Record<string, object>;
  configFor: (version: string) => Promise<void>;
}> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), `agent-reference-${label}-test-`));
  const projectRoot = await copyFixtureProject(tempDir);
  const sourceRepo = await createSourceRepo(
    tempDir,
    'tiny-warning-source',
    'index.js',
    'export const v1 = true;\n',
  );
  await fs.writeFile(path.join(sourceRepo.path, 'index.js'), 'export const v2 = true;\n');
  await git(['commit', '-am', 'second'], sourceRepo.path);
  const secondCommit = await git(['rev-parse', 'HEAD'], sourceRepo.path);

  return {
    projectRoot,
    tempDir,
    firstCommit: sourceRepo.commit,
    secondCommit,
    metadataFor: (version, commit) => ({
      [`tiny-warning@${version}`]: {
        name: 'tiny-warning',
        version,
        repository: { type: 'git', url: sourceRepo.path },
        gitHead: commit,
      },
    }),
    configFor: async (version) => {
      await fs.writeFile(
        path.join(projectRoot, 'agent-reference.json'),
        JSON.stringify({
          references: {
            'tiny-warning': {
              source: `npm:tiny-warning@${version}`,
              description: 'The dependency this project pins',
            },
          },
        }),
      );
    },
  };
}

async function manifestVersions(storeDir: string, projectRoot: string): Promise<string[]> {
  const manifest = JSON.parse(
    await fs.readFile(stateFilePath(storeDir, projectRoot), 'utf8'),
  ) as AgentReferenceManifest;
  return manifest.references.flatMap((reference) =>
    reference.kind === 'package' && reference.name === 'tiny-warning' ? [reference.version] : [],
  );
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function copyFixtureProject(tempDir: string): Promise<string> {
  const projectRoot = path.join(tempDir, 'project');
  await fs.cp(path.join(repoRoot, 'fixtures/pnpm-basic'), projectRoot, { recursive: true });
  return projectRoot;
}

async function createSourceRepo(
  parentDir: string,
  name: string,
  fileName: string,
  content: string,
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
    commit: (await git(['rev-parse', 'HEAD'], repoPath)).trim(),
  };
}

async function git(args: string[], cwd: string): Promise<string> {
  const result = await execFileAsync('git', args, { cwd, encoding: 'utf8' });
  return result.stdout.trim();
}
