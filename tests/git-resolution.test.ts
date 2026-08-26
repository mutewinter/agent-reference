import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import { cloneReferences } from '../src/core.ts';
import { getReferences } from '../src/get.ts';
import { runGit } from '../src/git.ts';
import { getStatusReport } from '../src/status.ts';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(import.meta.dirname, '..');

test('fails with an actionable message when git cannot be run', async () => {
  const { projectRoot, tempDir } = await createMonorepoScenario('missing-git');
  const realPath = process.env.PATH;
  process.env.PATH = path.join(tempDir, 'no-binaries-here');

  try {
    await assert.rejects(
      cloneReferences(path.join(projectRoot, 'package.json'), {
        storeDir: path.join(tempDir, 'store'),
      }),
      /git is required to materialize references.*Install git/s,
    );
  } finally {
    process.env.PATH = realPath;
  }
});

test('checks out the commit whose package.json matches, not a same-numbered monorepo tag', async () => {
  const { projectRoot, tempDir, source } = await createMonorepoScenario('monorepo');

  const result = await cloneReferences(path.join(projectRoot, 'package.json'), {
    metadataMap: {
      '@scope/thing@1.0.0': {
        name: '@scope/thing',
        version: '1.0.0',
        // Deliberately wrong, the way stale npm metadata often is.
        repository: { type: 'git', url: source.path, directory: 'packages/wrong' },
      },
    },
    storeDir: path.join(tempDir, 'store'),
  });

  const cloned = result.cloned[0];
  assert.equal(cloned?.checkoutSha, source.firstCommit);
  assert.notEqual(cloned?.checkoutSha, source.decoyCommit);
  assert.equal(cloned?.confidence, 'verified');
  assert.equal(cloned?.refSource, 'tagSearch');
  assert.equal(cloned?.checkoutRef, 'refs/tags/release-thing-1.0.0');

  // The repository root is checked out, but the useful path is the package directory.
  assert.equal(cloned?.packagePath, path.join(cloned?.worktreePath ?? '', 'packages/thing'));
  const manifest = JSON.parse(
    await fs.readFile(path.join(cloned?.packagePath ?? '', 'package.json'), 'utf8'),
  ) as {
    version: string;
  };
  assert.equal(manifest.version, '1.0.0');

  const report = await getStatusReport(path.join(projectRoot, 'package.json'), {
    storeDir: path.join(tempDir, 'store'),
  });
  const entry = report.references.find((reference) => reference.name === '@scope/thing');
  assert.equal(entry?.status, 'ready');
  assert.equal(entry?.confidence, 'verified');
  assert.equal(entry?.path, cloned?.packagePath);
  assert.equal(entry?.repositoryPath, cloned?.worktreePath);
});

test('falls back to the default branch and flags the checkout as unverified', async () => {
  const { projectRoot, tempDir, source } = await createMonorepoScenario('fallback', '9.9.9');

  const result = await cloneReferences(path.join(projectRoot, 'package.json'), {
    metadataMap: {
      '@scope/thing@9.9.9': {
        name: '@scope/thing',
        version: '9.9.9',
        repository: { type: 'git', url: source.path, directory: 'packages/thing' },
      },
    },
    storeDir: path.join(tempDir, 'store'),
  });

  assert.equal(result.cloned[0]?.refSource, 'defaultBranch');
  assert.equal(result.cloned[0]?.confidence, 'fallback');
});

test('advances cached branch refs when the upstream default branch moves', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-reference-refspec-test-'));
  const projectRoot = await copyFixtureProject(tempDir);
  const source = await initRepo(path.join(tempDir, 'tooling-source'));
  await writeFiles(source, { 'tool.js': 'export const tool = 1;\n' });
  const firstCommit = await commit(source, 'first');

  await fs.writeFile(
    path.join(projectRoot, 'agent-reference.json'),
    JSON.stringify({
      references: {
        tooling: {
          source: `file://${source}`,
          ref: 'main',
          description: 'The build tooling this project clones',
        },
      },
    }),
  );

  const storeDir = path.join(tempDir, 'store');
  const first = await cloneReferences(path.join(projectRoot, 'package.json'), { storeDir });
  assert.equal(first.clonedGit[0]?.checkoutSha, firstCommit);

  await writeFiles(source, { 'tool.js': 'export const tool = 2;\n' });
  const secondCommit = await commit(source, 'second');

  const second = await cloneReferences(path.join(projectRoot, 'package.json'), { storeDir });
  assert.equal(second.clonedGit[0]?.checkoutSha, secondCommit);
});

/**
 * A monorepo whose only tag for thing@1.0.0 is oddly named, plus a later `v1.0.0` tag that a
 * naive `v${version}` guess would pick even though it holds thing@2.0.0.
 */
test('two subtrees of one monorepo are two references into one checkout', async () => {
  const { projectRoot, storeDir, sourcePath } = await createSubtreeScenario('subtrees');
  await declareSubtrees(projectRoot, sourcePath, {
    'design-system': 'packages/design-system',
    'api-client': 'packages/api-client',
  });

  const result = await cloneReferences(path.join(projectRoot, 'package.json'), { storeDir });
  const byName = new Map(result.clonedGit.map((entry) => [entry.name, entry]));
  const design = byName.get('design-system');
  const api = byName.get('api-client');

  // The store keys a checkout on repository and sha, so declaring the subtrees separately
  // costs one clone, not two. That is what makes flat entries the right shape here.
  assert.equal(design?.worktreePath, api?.worktreePath);
  assert.equal(
    design?.referencePath,
    path.join(design?.worktreePath ?? '', 'packages/design-system'),
  );
  assert.equal(api?.referencePath, path.join(api?.worktreePath ?? '', 'packages/api-client'));
  assert.equal(design?.directoryMissing, false);
  assert.deepEqual(result.problems, []);

  const report = await getStatusReport(path.join(projectRoot, 'package.json'), { storeDir });
  const entry = report.references.find((reference) => reference.name === 'design-system');

  assert.equal(entry?.status, 'ready');
  assert.equal(entry?.path, design?.referencePath);
  assert.equal(entry?.repositoryPath, design?.worktreePath);
  assert.equal(entry?.directoryMissing, false);
  assert.deepEqual(report.problems, []);
});

test('a subtree that upstream moved is reported, and the checkout root is still handed back', async () => {
  const { projectRoot, storeDir, sourcePath } = await createSubtreeScenario('moved-subtree');
  await declareSubtrees(projectRoot, sourcePath, { 'design-system': 'packages/design-system' });
  await cloneReferences(path.join(projectRoot, 'package.json'), { storeDir });

  // The checkout is untouched; only the coordinate pointing into it goes wrong, which is what
  // an upstream rename looks like from here.
  await declareSubtrees(projectRoot, sourcePath, { 'design-system': 'packages/renamed-away' });

  const report = await getStatusReport(path.join(projectRoot, 'package.json'), { storeDir });
  const entry = report.references.find((reference) => reference.name === 'design-system');

  assert.equal(entry?.status, 'ready');
  assert.equal(entry?.directoryMissing, true);
  // Never withheld: the checkout is on disk and readable, so the path stands and the problem
  // says it is the whole repository rather than the subtree that was asked for.
  assert.equal(entry?.path, entry?.repositoryPath);

  const problem = report.problems.find((candidate) => candidate.reference === 'git:design-system');
  assert.equal(problem?.severity, 'error');
  assert.match(problem?.summary ?? '', /packages\/renamed-away, which is not in this checkout/);
  assert.match(problem?.summary ?? '', /whole repository rather than that subtree/);
  assert.match(problem?.fix ?? '', /references\.design-system\.directory/);
});

test('a checkout whose mirror is gone is rebuilt, not reported ready', async () => {
  const { projectRoot, storeDir, sourcePath } = await createSubtreeScenario('orphaned-worktree');
  await fs.writeFile(
    path.join(projectRoot, 'agent-reference.local.json'),
    JSON.stringify({
      references: {
        upstream: { source: `file://${sourcePath}`, description: 'The engine this fork tracks' },
      },
    }),
  );

  const [first] = await getReferences(projectRoot, ['upstream'], { storeDir });
  const checkout = first?.path ?? '';
  assert.equal((await runGit(['-C', checkout, 'log', '--oneline'])).exitCode, 0);

  // What a prune that took the mirror with it leaves behind: the files are all
  // still there, and every git command the guide sells against this path fails.
  await fs.rm(path.join(storeDir, 'git'), { recursive: true, force: true });
  assert.notEqual(
    (await runGit(['-C', checkout, 'log', '--oneline'], { allowFailure: true })).exitCode,
    0,
  );

  // Present is not usable. Reusing the directory on sight handed back a green
  // result and a checkout with no history behind it.
  const [second] = await getReferences(projectRoot, ['upstream'], { storeDir });
  assert.equal(second?.path, checkout);
  assert.equal((await runGit(['-C', checkout, 'log', '--oneline'])).exitCode, 0);
});

async function createSubtreeScenario(
  label: string,
): Promise<{ projectRoot: string; storeDir: string; sourcePath: string }> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), `agent-reference-${label}-test-`));
  const projectRoot = await copyFixtureProject(tempDir);
  const sourcePath = await initRepo(path.join(tempDir, 'monorepo-source'));

  await writeFiles(sourcePath, {
    'package.json': JSON.stringify({ name: 'monorepo', version: '0.0.0', private: true }),
    'packages/design-system/tokens.css': ':root { --brand: #0e7869; }\n',
    'packages/api-client/index.js': 'export const client = 1;\n',
  });
  await commit(sourcePath, 'two packages');

  return { projectRoot, storeDir: path.join(tempDir, 'store'), sourcePath };
}

/**
 * Declared in the gitignored file because that is where a checkout on this machine belongs,
 * which is also what keeps the committed-path check quiet.
 */
async function declareSubtrees(
  projectRoot: string,
  sourcePath: string,
  directories: Record<string, string>,
): Promise<void> {
  const references = Object.fromEntries(
    Object.entries(directories).map(([name, directory]) => [
      name,
      { source: `file://${sourcePath}`, directory, description: `The ${name} subtree` },
    ]),
  );
  await fs.writeFile(
    path.join(projectRoot, 'agent-reference.local.json'),
    JSON.stringify({ references }),
  );
}

async function createMonorepoScenario(
  label: string,
  requestedVersion = '1.0.0',
): Promise<{
  projectRoot: string;
  tempDir: string;
  source: { path: string; firstCommit: string; decoyCommit: string };
}> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), `agent-reference-${label}-test-`));
  const projectRoot = await copyFixtureProject(tempDir);
  await fs.writeFile(
    path.join(projectRoot, 'agent-reference.json'),
    JSON.stringify({
      references: {
        '@scope/thing': {
          source: `npm:@scope/thing@${requestedVersion}`,
          description: 'A scoped package',
        },
      },
    }),
  );

  const sourcePath = await initRepo(path.join(tempDir, 'monorepo-source'));
  await writeFiles(sourcePath, {
    'package.json': JSON.stringify({ name: 'monorepo', version: '0.0.0', private: true }),
    'packages/thing/package.json': JSON.stringify({ name: '@scope/thing', version: '1.0.0' }),
    'packages/thing/index.js': 'export const thing = 1;\n',
  });
  const firstCommit = await commit(sourcePath, 'thing 1.0.0');
  await tag(sourcePath, 'release-thing-1.0.0');

  await writeFiles(sourcePath, {
    'packages/thing/package.json': JSON.stringify({ name: '@scope/thing', version: '2.0.0' }),
    'packages/thing/index.js': 'export const thing = 2;\n',
  });
  const decoyCommit = await commit(sourcePath, 'thing 2.0.0');
  await tag(sourcePath, 'v1.0.0');

  return { projectRoot, tempDir, source: { path: sourcePath, firstCommit, decoyCommit } };
}

async function copyFixtureProject(tempDir: string): Promise<string> {
  const projectRoot = path.join(tempDir, 'project');
  await fs.cp(path.join(repoRoot, 'fixtures/pnpm-basic'), projectRoot, { recursive: true });
  return projectRoot;
}

async function initRepo(repoPath: string): Promise<string> {
  await fs.mkdir(repoPath, { recursive: true });
  await git(['init', '-b', 'main'], repoPath);
  await git(['config', 'user.email', 'agent-reference@example.test'], repoPath);
  await git(['config', 'user.name', 'agent-reference Test'], repoPath);
  await git(['config', 'commit.gpgSign', 'false'], repoPath);
  await git(['config', 'tag.gpgSign', 'false'], repoPath);
  return repoPath;
}

async function writeFiles(repoPath: string, files: Record<string, string>): Promise<void> {
  for (const [file, content] of Object.entries(files)) {
    const filePath = path.join(repoPath, file);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content);
  }
}

async function commit(repoPath: string, message: string): Promise<string> {
  await git(['add', '-A'], repoPath);
  await git(['commit', '-m', message], repoPath);
  return git(['rev-parse', 'HEAD'], repoPath);
}

/** Annotated, like real release tags, so the resolver has to peel to a commit. */
async function tag(repoPath: string, name: string): Promise<void> {
  await git(['tag', '-a', name, '-m', name], repoPath);
}

async function git(args: string[], cwd: string): Promise<string> {
  const result = await execFileAsync('git', args, { cwd, encoding: 'utf8' });
  return result.stdout.trim();
}
