import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import { cloneReferences } from '../src/core.ts';
import { getReferences } from '../src/get.ts';
import { stateFilePath } from '../src/manifest.ts';
import { getStatusReport } from '../src/status.ts';
import type { AgentReferenceManifest } from '../src/types.ts';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(import.meta.dirname, '..');

test('a package with no repository stays unresolvable instead of looping on clone', async () => {
  const { projectRoot, storeDir } = await scenario('no-repository', { packages: { orphan: '1.0.0' } });

  const clone = await cloneReferences(path.join(projectRoot, 'package.json'), {
    metadataMap: { 'orphan@1.0.0': { name: 'orphan', version: '1.0.0' } },
    storeDir
  });

  assert.equal(clone.cloned.length, 0);
  assert.equal(clone.unresolved[0]?.reason, 'no-repository');

  const report = await getStatusReport(path.join(projectRoot, 'package.json'), { storeDir });
  const entry = report.references[0];

  assert.equal(entry?.status, 'unresolvable');
  // Telling the agent to clone again would send it round the same failure.
  assert.deepEqual(report.nextSteps, ['Resolve the errors under problems, then run agent-reference status again.']);

  const problem = report.problems.find((candidate) => candidate.reference === 'package:orphan');
  assert.equal(problem?.severity, 'error');
  assert.match(problem?.fix ?? '', /set packages\.orphan\.repository/);
  assert.deepEqual(problem?.configPatch, {
    packages: { orphan: { version: '1.0.0', repository: '<github:owner/repo>', ref: '<commit-or-tag>' } }
  });
});

test('editing the failed overrides makes the reference worth cloning again', async () => {
  const { projectRoot, storeDir, tempDir } = await scenario('retry', { packages: { orphan: '1.0.0' } });
  const source = await createPackageRepo(tempDir, 'orphan', '1.0.0');

  await cloneReferences(path.join(projectRoot, 'package.json'), {
    metadataMap: { 'orphan@1.0.0': { name: 'orphan', version: '1.0.0' } },
    storeDir
  });

  await writeConfig(projectRoot, {
    packages: { orphan: { version: '1.0.0', repository: `file:${path.relative(projectRoot, source.path)}`, ref: source.commit } }
  });

  const retryReport = await getStatusReport(path.join(projectRoot, 'package.json'), { storeDir });
  assert.equal(retryReport.references[0]?.status, 'declared');
  assert.match(retryReport.references[0]?.action ?? '', /agent-reference get orphan/);

  const clone = await cloneReferences(path.join(projectRoot, 'package.json'), { storeDir });
  assert.equal(clone.cloned[0]?.confidence, 'pinned');
  assert.equal(clone.cloned[0]?.checkoutSha, source.commit);

  const readyReport = await getStatusReport(path.join(projectRoot, 'package.json'), { storeDir });
  assert.equal(readyReport.references[0]?.status, 'ready');
  assert.equal(readyReport.problems.length, 0);

  const manifest = await readManifest(storeDir, projectRoot);
  assert.equal(manifest.unresolved, undefined);
});

test('a pinned ref overrides version resolution and re-pinning marks the checkout stale', async () => {
  const { projectRoot, storeDir, tempDir } = await scenario('pin', {});
  const source = await createPackageRepo(tempDir, 'thing', '1.0.0');
  const repository = `file:${path.relative(projectRoot, source.path)}`;
  const olderCommit = source.commit;
  const newerCommit = await addCommit(source.path, 'thing', '2.0.0');

  // Ask for 2.0.0 but pin the 1.0.0 commit: the pin has to win.
  await writeConfig(projectRoot, {
    packages: { thing: { version: '2.0.0', repository, ref: olderCommit } }
  });
  const pinned = await cloneReferences(path.join(projectRoot, 'package.json'), { storeDir });
  assert.equal(pinned.cloned[0]?.checkoutSha, olderCommit);
  assert.equal(pinned.cloned[0]?.confidence, 'pinned');
  assert.equal(pinned.cloned[0]?.refSource, 'pinned');

  const pinnedReport = await getStatusReport(path.join(projectRoot, 'package.json'), { storeDir });
  assert.equal(pinnedReport.references[0]?.status, 'ready');
  assert.equal(pinnedReport.references[0]?.confidence, 'pinned');

  await writeConfig(projectRoot, {
    packages: { thing: { version: '2.0.0', repository, ref: newerCommit } }
  });
  const repinned = await getStatusReport(path.join(projectRoot, 'package.json'), { storeDir });
  assert.equal(repinned.references[0]?.status, 'stale');
});

test('an unresolvable pin reports the ref that does not exist', async () => {
  const { projectRoot, storeDir, tempDir } = await scenario('bad-pin', {});
  const source = await createPackageRepo(tempDir, 'thing', '1.0.0');

  await writeConfig(projectRoot, {
    packages: {
      thing: { version: '1.0.0', repository: `file:${path.relative(projectRoot, source.path)}`, ref: 'v9.9.9' }
    }
  });

  const clone = await cloneReferences(path.join(projectRoot, 'package.json'), { storeDir });
  assert.equal(clone.unresolved[0]?.reason, 'unresolved-ref');

  const report = await getStatusReport(path.join(projectRoot, 'package.json'), { storeDir });
  const problem = report.problems[0];
  assert.match(problem?.summary ?? '', /is not a commit, tag, or branch/);
  assert.match(problem?.fix ?? '', /pinned packages\.thing\.ref does not exist/);
});

test('one unresolvable reference does not stop the others from cloning', async () => {
  const { projectRoot, storeDir, tempDir } = await scenario('isolation', {});
  const source = await createPackageRepo(tempDir, 'good', '1.0.0');

  await writeConfig(projectRoot, {
    packages: {
      orphan: '1.0.0',
      good: { version: '1.0.0', repository: `file:${path.relative(projectRoot, source.path)}`, ref: source.commit }
    }
  });

  const clone = await cloneReferences(path.join(projectRoot, 'package.json'), {
    metadataMap: { 'orphan@1.0.0': { name: 'orphan', version: '1.0.0' } },
    storeDir
  });

  assert.deepEqual(clone.cloned.map((entry) => entry.dependency.name), ['good']);
  assert.deepEqual(clone.unresolved.map((entry) => entry.name), ['orphan']);
});

test('status reports a default-branch fallback as an error with a pin fix', async () => {
  const { projectRoot, storeDir, tempDir } = await scenario('fallback', { packages: { thing: '9.9.9' } });
  const source = await createPackageRepo(tempDir, 'thing', '1.0.0');

  await cloneReferences(path.join(projectRoot, 'package.json'), {
    metadataMap: {
      'thing@9.9.9': { name: 'thing', version: '9.9.9', repository: { type: 'git', url: source.path } }
    },
    storeDir
  });

  const report = await getStatusReport(path.join(projectRoot, 'package.json'), { storeDir });
  const problem = report.problems[0];

  assert.equal(report.references[0]?.status, 'ready');
  assert.equal(report.references[0]?.confidence, 'fallback');
  assert.equal(problem?.severity, 'error');
  assert.match(problem?.summary ?? '', /is NOT version 9\.9\.9/);
  assert.match(problem?.fix ?? '', /tag --list '\*9\.9\.9\*'/);
});

test('a mirror that could not be updated is said out loud, not blamed on tag naming', async () => {
  const { projectRoot, storeDir, tempDir } = await scenario('stale-mirror', {});
  const source = await createPackageRepo(tempDir, 'tiny-invariant', '1.3.1');
  const metadataMap = {
    'tiny-invariant@2.0.0': {
      name: 'tiny-invariant',
      version: '2.0.0',
      repository: { type: 'git', url: source.path }
    }
  };
  await writeConfig(projectRoot, { packages: { 'tiny-invariant': '2.0.0' } });

  // Fill the mirror while the remote is readable, then take the remote away: a fetch that
  // fails is allowed to fail, so what is left is a mirror that predates the asked-for tag.
  await cloneReferences(projectRoot, { metadataMap, storeDir });
  await fs.rm(source.path, { recursive: true, force: true });

  const [result] = await getReferences(projectRoot, ['tiny-invariant'], { metadataMap, storeDir });

  assert.equal(result?.confidence, 'fallback');
  // Pinning a tag the mirror cannot see is work that cannot succeed, so the retry leads.
  assert.match(result?.problem?.fix ?? '', /mirror could not be updated on this run/);
  assert.match(result?.problem?.fix ?? '', /run agent-reference get tiny-invariant again/);
});

test('a fix names the file the reference was actually declared in', async () => {
  const { projectRoot, storeDir } = await scenario('local-scope', {});
  await fs.rm(path.join(projectRoot, 'agent-reference.json'));
  await fs.writeFile(
    path.join(projectRoot, 'agent-reference.local.json'),
    JSON.stringify({ packages: { orphan: '1.0.0' } })
  );

  const clone = await cloneReferences(projectRoot, {
    metadataMap: { 'orphan@1.0.0': { name: 'orphan', version: '1.0.0' } },
    storeDir
  });

  // Sending the agent to the committed file is a leak and a no-op both: the local entry wins
  // by name, so the edit changes nothing and the problem returns on the next run.
  const problem = clone.problems.find((candidate) => candidate.reference === 'package:orphan');
  assert.match(problem?.fix ?? '', /agent-reference\.local\.json/);
  assert.doesNotMatch(problem?.fix ?? '', /in agent-reference\.json/);

  const report = await getStatusReport(projectRoot, { storeDir });
  const reported = report.problems.find((candidate) => candidate.reference === 'package:orphan');
  assert.match(reported?.fix ?? '', /agent-reference\.local\.json/);
  assert.equal(reported?.configFile, 'agent-reference.local.json');
});

test('one unreachable git reference does not discard the packages that cloned', async () => {
  const { projectRoot, storeDir, tempDir } = await scenario('git-failure', {});
  const source = await createPackageRepo(tempDir, 'tiny-invariant', '1.3.1');
  await writeConfig(projectRoot, {
    packages: { 'tiny-invariant': { version: '1.3.1', repository: `file:${source.path}`, ref: 'main' } },
    git: { gone: `file:${path.join(tempDir, 'no-such-repo')}` }
  });

  const clone = await cloneReferences(projectRoot, { storeDir });

  // The package is on disk, so it has to be in the state file: throwing past writeManifest
  // left the work done and invisible, and the next status called it declared.
  assert.equal(clone.cloned.length, 1);
  assert.deepEqual((await readManifest(storeDir, projectRoot)).references.map((entry) => entry.name), [
    'tiny-invariant'
  ]);

  assert.deepEqual(clone.skipped.map((entry) => entry.name), ['gone']);
  const problem = clone.problems.find((candidate) => candidate.reference === 'git:gone');
  assert.equal(problem?.severity, 'error');
  assert.match(problem?.fix ?? '', /correct git\.gone in agent-reference\.json/);
});

async function scenario(
  label: string,
  config: Record<string, unknown>
): Promise<{ projectRoot: string; storeDir: string; tempDir: string }> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), `agent-reference-${label}-test-`));
  const projectRoot = path.join(tempDir, 'project');
  await fs.cp(path.join(repoRoot, 'fixtures/pnpm-basic'), projectRoot, { recursive: true });
  await writeConfig(projectRoot, config);
  return { projectRoot, storeDir: path.join(tempDir, 'store'), tempDir };
}

async function writeConfig(projectRoot: string, config: Record<string, unknown>): Promise<void> {
  await fs.writeFile(path.join(projectRoot, 'agent-reference.json'), JSON.stringify(config, null, 2));
}

async function readManifest(storeDir: string, projectRoot: string): Promise<AgentReferenceManifest> {
  return JSON.parse(await fs.readFile(stateFilePath(storeDir, projectRoot), 'utf8')) as AgentReferenceManifest;
}

async function createPackageRepo(
  parentDir: string,
  name: string,
  version: string
): Promise<{ path: string; commit: string }> {
  const repoPath = path.join(parentDir, `${name}-source`);
  await fs.mkdir(repoPath, { recursive: true });
  await git(['init', '-b', 'main'], repoPath);
  await git(['config', 'user.email', 'agent-reference@example.test'], repoPath);
  await git(['config', 'user.name', 'agent-reference Test'], repoPath);
  await git(['config', 'commit.gpgSign', 'false'], repoPath);
  const commit = await addCommit(repoPath, name, version);
  return { path: repoPath, commit };
}

async function addCommit(repoPath: string, name: string, version: string): Promise<string> {
  await fs.writeFile(path.join(repoPath, 'package.json'), JSON.stringify({ name, version }));
  await git(['add', '-A'], repoPath);
  await git(['commit', '-m', `${name} ${version}`], repoPath);
  return git(['rev-parse', 'HEAD'], repoPath);
}

async function git(args: string[], cwd: string): Promise<string> {
  const result = await execFileAsync('git', args, { cwd, encoding: 'utf8' });
  return result.stdout.trim();
}
