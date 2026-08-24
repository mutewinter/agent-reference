import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import { getReferences } from '../src/get.ts';
import { parseConfig } from '../src/config.ts';
import { gitArgv } from '../src/git.ts';
import { getStatusReport } from '../src/status.ts';
import { formatVersionsReport, getVersionsReport } from '../src/versions.ts';
import { workspaceVersionDirectory } from '../src/pnpm-lock.ts';
import { sanitizeRelayed, sanitizeRelayedLine } from '../src/text-utils.ts';

const execFileAsync = promisify(execFile);

test('a dependency held by a workspace package resolves from the repository root', async () => {
  const { projectRoot, storeDir, tempDir } = await workspace('root');
  const source = await sourceRepo(tempDir, 'tiny-invariant', '1.3.1');

  const [result] = await getReferences(projectRoot, ['tiny-invariant'], {
    metadataMap: metadataFor(source, 'tiny-invariant', '1.3.1'),
    storeDir
  });

  // Reading only the importer nearest the working directory made this resolve as though the
  // package were not installed, which fell through to the registry's latest without saying so.
  assert.equal(result?.version, '1.3.1');
  assert.equal(result?.versionSource, 'lockfile');
  assert.equal(result?.problem, null);
});

test('two importers at different versions is reported, never guessed', async () => {
  const { projectRoot, storeDir, tempDir } = await workspace('ambiguous', { legacyVersion: '1.2.0' });
  const source = await sourceRepo(tempDir, 'tiny-invariant', '1.3.1');

  await assert.rejects(
    getReferences(projectRoot, ['tiny-invariant'], {
      metadataMap: metadataFor(source, 'tiny-invariant', '1.3.1'),
      storeDir
    }),
    (error: Error) => {
      assert.match(error.message, /installed at 2 versions/);
      // Both coordinates and both importers, so the next command is a copy of a printed line.
      assert.match(error.message, /1\.3\.1\s+apps\/web/);
      assert.match(error.message, /1\.2\.0\s+apps\/legacy/);
      assert.match(error.message, /agent-reference get tiny-invariant@/);
      return true;
    }
  );
});

test('running inside a workspace package picks that package version', async () => {
  const { projectRoot, storeDir, tempDir } = await workspace('local-wins', { legacyVersion: '1.2.0' });
  const source = await sourceRepo(tempDir, 'tiny-invariant', '1.3.1');

  const [result] = await getReferences(path.join(projectRoot, 'apps/web'), ['tiny-invariant'], {
    metadataMap: metadataFor(source, 'tiny-invariant', '1.3.1'),
    storeDir
  });

  assert.equal(result?.version, '1.3.1');
});

test('a package this project does not install says the version came from the registry', async () => {
  const { projectRoot, storeDir, tempDir } = await workspace('adopt');
  const source = await sourceRepo(tempDir, 'tiny-warning', '1.0.3');

  const [result] = await getReferences(projectRoot, ['tiny-warning@1.0.3'], {
    metadataMap: metadataFor(source, 'tiny-warning', '1.0.3'),
    storeDir
  });

  // Looking at a library before adopting it is a supported use, so this is a note rather
  // than a failure. It just must not read as the version this repository depends on.
  assert.equal(result?.version, '1.0.3');
  assert.equal(result?.versionSource, 'explicit');
  assert.equal(result?.recorded, false);
});

test('status reports a pin that no longer matches what the project installs', async () => {
  const { projectRoot, storeDir } = await workspace('drift');
  await fs.writeFile(
    path.join(projectRoot, 'agent-reference.json'),
    JSON.stringify({ packages: { 'tiny-invariant': '1.2.0' } })
  );

  const report = await getStatusReport(projectRoot, { storeDir });
  const problem = report.problems.find((candidate) => candidate.reference === 'package:tiny-invariant');

  // A report, never a correction: somebody pinned 1.2.0 on purpose, and the fix names both
  // ways out rather than assuming the newer number is the wanted one.
  assert.equal(problem?.severity, 'warning');
  assert.match(problem?.summary ?? '', /pinned to 1\.2\.0/);
  assert.match(problem?.summary ?? '', /installs 1\.3\.1/);
  assert.match(problem?.summary ?? '', /apps\/web/);
  assert.match(problem?.fix ?? '', /description/);
});

test('a pin that still matches the lockfile is not reported as drift', async () => {
  const { projectRoot, storeDir } = await workspace('no-drift');
  await fs.writeFile(
    path.join(projectRoot, 'agent-reference.json'),
    JSON.stringify({ packages: { 'tiny-invariant': '1.3.1' } })
  );

  const report = await getStatusReport(projectRoot, { storeDir });
  assert.equal(report.problems.length, 0);
});

test('versions still answers when the config it would have loaded is unusable', async () => {
  const { projectRoot } = await workspace('versions-broken-config');
  await fs.writeFile(
    path.join(projectRoot, 'agent-reference.json'),
    JSON.stringify({ packages: { 'tiny-invariant': 'installed' } })
  );

  // The error for an unusable version points at this command, so a broken config must not
  // take it down: that would leave an agent with advice it cannot follow.
  const report = await getVersionsReport(projectRoot, 'tiny-invariant');
  assert.deepEqual(
    report.versions.map((entry) => entry.version),
    ['1.3.1']
  );
});

test('a config version that is not an exact coordinate is refused with the way out', () => {
  for (const version of ['installed', '^1.3.0', 'latest']) {
    assert.throws(
      () => parseConfig({ packages: { 'tiny-invariant': version } }, 'agent-reference.json'),
      /not an exact version[\s\S]*agent-reference versions/
    );
  }
});

test('a decoy directory never outranks the repository root', async () => {
  const { projectRoot, storeDir, tempDir } = await workspace('directory-pin');
  // Shaped like electron: the root manifest is named for the release setup, and the only
  // thing in the tree carrying the package name is a small bundled app.
  const source = await decoyRepo(tempDir, 'fakepkg', '1.0.0');

  // No gitHead, so resolution goes through the tag shapes the way electron's does.
  const metadataMap = { 'fakepkg@1.0.0': { name: 'fakepkg', version: '1.0.0', repository: { type: 'git', url: source.path } } };

  const [loose] = await getReferences(projectRoot, ['fakepkg@1.0.0'], { metadataMap, storeDir });
  // default_app is named fakepkg and carries no version, so it identifies itself as the
  // package without ever confirming it. The whole repository is the honest answer.
  assert.equal(loose?.path, loose?.repositoryPath);
  assert.notEqual(path.basename(loose?.path ?? ''), 'default_app');
  assert.equal(loose?.confidence, 'unverified');
  assert.match(loose?.problem?.summary ?? '', /repository root/);

  await fs.writeFile(
    path.join(projectRoot, 'agent-reference.json'),
    JSON.stringify({ packages: { fakepkg: { version: '1.0.0', repository: `file:${source.path}`, directory: '.' } } })
  );
  const [pinned] = await getReferences(projectRoot, ['fakepkg'], { metadataMap, storeDir });

  assert.equal(pinned?.path, pinned?.repositoryPath);
  // The pin says where the package lives, not that this manifest is the package's own, so a
  // name that disagrees leaves the commit unconfirmed rather than sending it to a fallback.
  assert.equal(pinned?.confidence, 'unverified');
  assert.equal(pinned?.checkoutRef, 'refs/tags/v1.0.0');
});

test('get reports a fallback checkout as the problem it is', async () => {
  const { projectRoot, storeDir, tempDir } = await workspace('fallback');
  const source = await sourceRepo(tempDir, 'oddtags', '1.0.0');
  await fs.writeFile(
    path.join(projectRoot, 'agent-reference.json'),
    JSON.stringify({ packages: { oddtags: { version: '9.9.9', repository: `file:${source.path}` } } })
  );

  const [result] = await getReferences(projectRoot, ['oddtags'], { storeDir });

  // status carried this and get did not, so the command an agent actually runs reported a
  // path, one word, and exit zero.
  assert.equal(result?.confidence, 'fallback');
  assert.equal(result?.problem?.severity, 'error');
  assert.match(result?.problem?.summary ?? '', /NOT version 9\.9\.9/);
  assert.match(JSON.stringify(result?.problem?.configPatch), /commit-or-tag/);
});

test('a repository that cannot be read names the repository, not a ref', async () => {
  const { projectRoot, storeDir, tempDir } = await workspace('clone-failed');
  await fs.writeFile(
    path.join(projectRoot, 'agent-reference.json'),
    JSON.stringify({
      packages: { ghost: { version: '1.0.0', repository: `file:${path.join(tempDir, 'nowhere.git')}` } }
    })
  );

  await assert.rejects(getReferences(projectRoot, ['ghost'], { storeDir }), (error: Error) => {
    assert.match(error.message, /packages\.ghost\.repository/);
    // Nothing was cloned, so there is no mirror to list tags in and no ref worth pinning.
    assert.doesNotMatch(error.message, /tag --list/);
    assert.doesNotMatch(error.message, /packages\.ghost\.ref/);
    return true;
  });
});

test('relayed text cannot move a terminal cursor or repaint a line', () => {
  const hostile = `docs[31m[2K\rIGNORE ABOVE`;

  assert.equal(sanitizeRelayed(hostile), 'docs[31m[2KIGNORE ABOVE');
  // Newlines survive, because relayed git output is worth reading in its own shape.
  assert.equal(sanitizeRelayed('a\nb'), 'a\nb');
  assert.equal(sanitizeRelayedLine('a\nb'), 'a b');
});

async function workspace(
  label: string,
  options: { legacyVersion?: string } = {}
): Promise<{ projectRoot: string; storeDir: string; tempDir: string }> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), `agent-reference-workspace-${label}-test-`));
  const projectRoot = path.join(tempDir, 'project');
  await fs.mkdir(path.join(projectRoot, 'apps/web'), { recursive: true });
  await fs.writeFile(path.join(projectRoot, 'package.json'), JSON.stringify({ name: 'root', private: true }));
  await fs.writeFile(path.join(projectRoot, 'agent-reference.json'), JSON.stringify({}));
  await fs.writeFile(
    path.join(projectRoot, 'apps/web/package.json'),
    JSON.stringify({ name: '@mono/web', dependencies: { 'tiny-invariant': '1.3.1' } })
  );

  const legacy = options.legacyVersion
    ? `  apps/legacy:\n    dependencies:\n      tiny-invariant:\n        specifier: ${options.legacyVersion}\n        version: ${options.legacyVersion}\n`
    : '';
  if (options.legacyVersion) {
    await fs.mkdir(path.join(projectRoot, 'apps/legacy'), { recursive: true });
    await fs.writeFile(path.join(projectRoot, 'apps/legacy/package.json'), JSON.stringify({ name: '@mono/legacy' }));
  }

  await fs.writeFile(
    path.join(projectRoot, 'pnpm-lock.yaml'),
    `lockfileVersion: '9.0'\n\nimporters:\n  .: {}\n  apps/web:\n    dependencies:\n      tiny-invariant:\n        specifier: 1.3.1\n        version: 1.3.1\n${legacy}\npackages:\n  tiny-invariant@1.3.1:\n    resolution: {integrity: sha512-a}\n`
  );

  return { projectRoot, storeDir: path.join(tempDir, 'store'), tempDir };
}

function metadataFor(
  source: { path: string; commit: string },
  name: string,
  version: string
): Record<string, object> {
  return {
    [`${name}@${version}`]: {
      name,
      version,
      repository: { type: 'git', url: source.path },
      gitHead: source.commit
    }
  };
}

async function sourceRepo(
  parentDir: string,
  name: string,
  version: string
): Promise<{ path: string; commit: string }> {
  const repoPath = await initRepo(parentDir, name);
  await fs.writeFile(path.join(repoPath, 'package.json'), JSON.stringify({ name, version }));
  await git(['add', '-A'], repoPath);
  await git(['commit', '-m', `${name} ${version}`], repoPath);
  return { path: repoPath, commit: await git(['rev-parse', 'HEAD'], repoPath) };
}

async function decoyRepo(
  parentDir: string,
  name: string,
  version: string
): Promise<{ path: string; commit: string }> {
  const repoPath = await initRepo(parentDir, name);
  await fs.mkdir(path.join(repoPath, 'default_app'), { recursive: true });
  await fs.writeFile(path.join(repoPath, 'package.json'), JSON.stringify({ name: '@fake-ci/dev-root', version: '0.0.0' }));
  await fs.writeFile(path.join(repoPath, 'default_app/package.json'), JSON.stringify({ name }));
  await git(['add', '-A'], repoPath);
  await git(['commit', '-m', `${name} ${version}`], repoPath);
  await git(['tag', `v${version}`], repoPath);
  return { path: repoPath, commit: await git(['rev-parse', 'HEAD'], repoPath) };
}

async function initRepo(parentDir: string, name: string): Promise<string> {
  const repoPath = path.join(parentDir, `${name}-source`);
  await fs.mkdir(repoPath, { recursive: true });
  await git(['init', '-b', 'main'], repoPath);
  await git(['config', 'user.email', 'agent-reference@example.test'], repoPath);
  await git(['config', 'user.name', 'agent-reference Test'], repoPath);
  await git(['config', 'commit.gpgSign', 'false'], repoPath);
  return repoPath;
}

async function git(args: string[], cwd: string): Promise<string> {
  const result = await execFileAsync('git', args, { cwd, encoding: 'utf8' });
  return result.stdout.trim();
}

test('a value git would read as an option never reaches git', async () => {
  const { projectRoot, storeDir, tempDir } = await workspace('argv-injection');
  const source = await sourceRepo(tempDir, 'victimpkg', '1.0.0');
  const marker = path.join(tempDir, 'EXECUTED');
  await fs.writeFile(
    path.join(projectRoot, 'agent-reference.json'),
    JSON.stringify({
      packages: {
        victimpkg: {
          version: '1.0.0',
          repository: `file:${source.path}`,
          // git parses options positioned after `origin`, so this is code execution rather
          // than a ref, and a shared config file is how it would travel.
          ref: `--upload-pack=touch ${marker};true`
        }
      }
    })
  );

  await assert.rejects(getReferences(projectRoot, ['victimpkg'], { storeDir }), (error: Error) => {
    assert.match(error.message, /may not begin with "-"/);
    // The fix has to name the real problem, not send the agent looking for a missing tag.
    assert.match(error.message, /refused this value/);
    return true;
  });
  assert.equal(await fs.stat(marker).then(() => true).catch(() => false), false);
});

test('a transport git should not be asked to speak is refused', async () => {
  const { projectRoot, storeDir } = await workspace('ext-transport');
  await fs.writeFile(
    path.join(projectRoot, 'agent-reference.json'),
    JSON.stringify({
      packages: { victimpkg: { version: '1.0.0', repository: 'ext::sh -c whoami', ref: 'main' } }
    })
  );

  await assert.rejects(getReferences(projectRoot, ['victimpkg'], { storeDir }), (error: Error) => {
    assert.match(error.message, /ext: transport/);
    return true;
  });
});

test('a repository that is not a URL is refused, not reported as a failed clone', async () => {
  const { projectRoot, storeDir } = await workspace('bad-url');
  await fs.writeFile(
    path.join(projectRoot, 'agent-reference.json'),
    // A scheme left off, which is a typo rather than an attack. Deriving the store path
    // parses the URL, so this used to surface as `TypeError: Invalid URL` from inside path
    // construction, and then as a clone failure blaming the network.
    JSON.stringify({ git: { internal: 'forge.example/team/repo' } })
  );

  await assert.rejects(getReferences(projectRoot, ['internal'], { storeDir }), (error: Error) => {
    assert.match(error.message, /not a usable git URL/);
    assert.doesNotMatch(error.message, /Invalid URL/);
    return true;
  });
});

test('the transport policy rides on the argv, not on how git is started', async () => {
  // A clone with a human watching is spawned rather than exec'd so git can draw its own
  // progress. That is a display choice, and it once silently dropped the policy below.
  const argv = gitArgv(['clone', '--bare', 'https://example.invalid/repo.git']);

  assert.deepEqual(argv.slice(0, 4), [
    '-c',
    'protocol.ext.allow=never',
    '-c',
    'protocol.file.allow=user'
  ]);
  assert.deepEqual(argv.slice(4), ['clone', '--bare', 'https://example.invalid/repo.git']);
});

test('a package directory cannot climb out of the checkout', async () => {
  const { projectRoot, storeDir, tempDir } = await workspace('directory-escape');
  const source = await sourceRepo(tempDir, 'tiny-invariant', '1.3.1');

  // Registry metadata is attacker-controlled for any package a project references, and this
  // field is joined onto the checkout to produce the path handed back as upstream source.
  const [result] = await getReferences(projectRoot, ['tiny-invariant'], {
    metadataMap: {
      'tiny-invariant@1.3.1': {
        name: 'tiny-invariant',
        version: '1.3.1',
        repository: { type: 'git', url: source.path, directory: '../../../../../../etc' }
      }
    },
    storeDir
  });

  assert.equal(result?.path, result?.repositoryPath);
  assert.ok(result?.path.startsWith(storeDir), `${result?.path} escaped the store`);
});

test('one workspace package linked from two importers is one place, stated once', async () => {
  const { projectRoot } = await linkedWorkspace('links');

  const report = await getVersionsReport(projectRoot, '@mono/shared');

  // apps/web writes link:../../packages/shared and packages/tools writes link:../shared for
  // the same directory, so keying on the lockfile string reported the package twice, each
  // time with a path that resolves from neither the caller's directory nor the other's.
  assert.equal(report.versions.length, 1);
  assert.equal(report.versions[0]?.workspace, true);
  assert.equal(report.versions[0]?.path, path.join(projectRoot, 'packages', 'shared'));
  assert.deepEqual(report.versions[0]?.importers.sort(), ['apps/web', 'packages/tools']);

  const text = formatVersionsReport(report);
  assert.equal(text.match(/is a workspace package/g)?.length, 1);
  assert.doesNotMatch(text, /\.\.\//);
});

test('get sends an agent to a workspace package by a path it can open', async () => {
  const { projectRoot, storeDir } = await linkedWorkspace('links-get');

  await assert.rejects(getReferences(projectRoot, ['@mono/shared'], { storeDir }), (error: Error) => {
    assert.match(error.message, new RegExp(escapeRegExp(path.join(projectRoot, 'packages', 'shared'))));
    return true;
  });
});

test('a workspace range names the package as local without inventing a path', async () => {
  assert.equal(workspaceVersionDirectory('/repo', 'apps/web', 'workspace:*'), null);
  assert.equal(workspaceVersionDirectory('/repo', 'apps/web', 'workspace:^1.2.0'), null);
  assert.equal(workspaceVersionDirectory('/repo', 'apps/web', 'link:../../packages/shared'), '/repo/packages/shared');
  assert.equal(workspaceVersionDirectory('/repo', '.', 'file:./vendor/thing'), '/repo/vendor/thing');
});

/** Two importers depending on one in-repo package, each by its own relative link. */
async function linkedWorkspace(label: string): Promise<{ projectRoot: string; storeDir: string }> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), `agent-reference-${label}-test-`));
  const projectRoot = path.join(tempDir, 'project');

  for (const [dir, name] of [
    ['apps/web', '@mono/web'],
    ['packages/tools', '@mono/tools'],
    ['packages/shared', '@mono/shared']
  ]) {
    await fs.mkdir(path.join(projectRoot, dir!), { recursive: true });
    await fs.writeFile(path.join(projectRoot, dir!, 'package.json'), JSON.stringify({ name }));
  }

  await fs.writeFile(path.join(projectRoot, 'package.json'), JSON.stringify({ name: 'root', private: true }));
  await fs.writeFile(path.join(projectRoot, 'agent-reference.json'), JSON.stringify({}));
  await fs.writeFile(
    path.join(projectRoot, 'pnpm-lock.yaml'),
    [
      "lockfileVersion: '9.0'",
      '',
      'importers:',
      '  .: {}',
      '  apps/web:',
      '    dependencies:',
      "      '@mono/shared':",
      '        specifier: workspace:*',
      '        version: link:../../packages/shared',
      '  packages/tools:',
      '    dependencies:',
      "      '@mono/shared':",
      '        specifier: workspace:*',
      '        version: link:../shared',
      '',
      'packages: {}',
      ''
    ].join('\n')
  );

  return { projectRoot, storeDir: path.join(tempDir, 'store') };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
