/**
 * Builds a synthetic world for the `resolve` eval: a pnpm workspace whose dependencies all
 * fail resolution in a different way, served by a local registry and local git repositories
 * so a run never touches the network.
 *
 * Every failure here is drawn from something observed in the wild, and every one of them is
 * survivable. The point of the eval is not whether the tool wins on its own, which it cannot
 * for several of these, but whether what it prints is enough for an agent to iterate to a
 * correct checkout without reading the tool's source.
 */
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * What a correct run ends with. `reach` is the checkout the agent has to land on; `via` names
 * the config key or coordinate that gets it there, and is what the tool's own output has to
 * be pointing at. The grader reads this, so the world and the scoring cannot drift apart.
 */
export const EXPECTED = {
  cases: [
    {
      name: 'plainpkg',
      failure: 'none',
      reach: 'a checkout at 1.4.0, the version apps/studio installs',
      via: 'nothing: `get plainpkg` should just work from the repository root',
      confidence: 'verified'
    },
    {
      name: 'splitpkg',
      failure: 'installed at two versions in two workspace packages',
      reach: 'a checkout at one of 2.0.0 or 1.0.0, chosen deliberately',
      via: 'an explicit coordinate, splitpkg@2.0.0 or splitpkg@1.0.0',
      confidence: 'verified'
    },
    {
      name: 'shellpkg',
      failure: 'the repository root manifest has another name, and a decoy subdirectory claims this one',
      reach: 'the repository root at the 3.1.0 tag, not the decoy directory',
      via: 'nothing, or packages.shellpkg.directory to say so explicitly',
      confidence: 'unverified'
    },
    {
      name: 'oddpkg',
      failure: 'releases are tagged by date, so no tag mentions the version at all',
      reach: 'the commit tagged release-20260410, which really is oddpkg@1.2.3',
      via: 'packages.oddpkg.ref, found by listing tags in the mirror the failure names',
      confidence: 'pinned'
    },
    {
      name: 'movedpkg',
      failure: 'registry metadata points at a repository that does not exist',
      reach: 'the repository that does exist, at 5.0.0',
      via: 'packages.movedpkg.repository',
      confidence: 'verified'
    },
    {
      name: '@acme/internal',
      failure: 'a workspace package, already in the repository',
      reach: 'nothing fetched; the agent should say it is already on disk at packages/internal',
      via: 'no config at all',
      confidence: null
    }
  ]
};

export async function buildWorld(runDir) {
  const home = path.join(runDir, 'home');
  const projectRoot = path.join(home, 'code', 'acme', 'studio');
  const upstream = path.join(runDir, 'upstream');
  await fs.mkdir(upstream, { recursive: true });

  const repos = {
    plainpkg: await plainRepo(upstream, 'plainpkg', '1.4.0'),
    splitpkg: await twoVersionRepo(upstream, 'splitpkg'),
    shellpkg: await shellRepo(upstream, 'shellpkg', '3.1.0'),
    oddpkg: await oddTagRepo(upstream, 'oddpkg', '1.2.3'),
    movedpkg: await plainRepo(upstream, 'movedpkg', '5.0.0')
  };

  await writeProject(projectRoot);
  return { home, projectRoot, upstream, repos };
}

/**
 * A registry that answers only what the real one would, from local git repositories. It is
 * deliberately faithful about being wrong: movedpkg's repository field points somewhere that
 * does not exist, which is the failure that had no usable error message.
 */
export async function startRegistry(repos) {
  const manifests = {
    plainpkg: { '1.4.0': { repository: { type: 'git', url: repos.plainpkg.path } } },
    splitpkg: {
      '2.0.0': { repository: { type: 'git', url: repos.splitpkg.path } },
      '1.0.0': { repository: { type: 'git', url: repos.splitpkg.path } }
    },
    shellpkg: { '3.1.0': { repository: { type: 'git', url: repos.shellpkg.path } } },
    oddpkg: { '1.2.3': { repository: { type: 'git', url: repos.oddpkg.path } } },
    movedpkg: { '5.0.0': { repository: { type: 'git', url: `${repos.movedpkg.path}-renamed-and-gone` } } }
  };

  const server = http.createServer((request, response) => {
    const [, rawName, rawVersion] = decodeURIComponent(request.url ?? '').split('/');
    const name = rawName ?? '';
    const versions = manifests[name];

    if (!versions) {
      response.writeHead(404, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    const body = rawVersion
      ? { name, version: rawVersion, ...(versions[rawVersion] ?? {}) }
      : { name, versions: Object.fromEntries(Object.keys(versions).map((v) => [v, {}])), 'dist-tags': { latest: Object.keys(versions)[0] } };

    response.writeHead(rawVersion && !versions[rawVersion] ? 404 : 200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(body));
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}

async function writeProject(projectRoot) {
  await fs.mkdir(path.join(projectRoot, 'apps/studio'), { recursive: true });
  await fs.mkdir(path.join(projectRoot, 'apps/legacy'), { recursive: true });
  await fs.mkdir(path.join(projectRoot, 'packages/internal'), { recursive: true });

  await write(projectRoot, 'package.json', {
    name: 'acme-studio-workspace',
    private: true,
    devDependencies: { typescript: '5.9.2' }
  });
  await write(projectRoot, 'apps/studio/package.json', {
    name: '@acme/studio',
    dependencies: {
      plainpkg: '^1.4.0',
      splitpkg: '^2.0.0',
      shellpkg: '^3.1.0',
      oddpkg: '1.2.3',
      movedpkg: '^5.0.0',
      '@acme/internal': 'workspace:*'
    }
  });
  await write(projectRoot, 'apps/legacy/package.json', {
    name: '@acme/legacy',
    dependencies: { splitpkg: '^1.0.0' }
  });
  await write(projectRoot, 'packages/internal/package.json', { name: '@acme/internal', version: '0.0.0' });

  await fs.writeFile(path.join(projectRoot, 'pnpm-workspace.yaml'), 'packages:\n  - apps/*\n  - packages/*\n');
  await fs.writeFile(path.join(projectRoot, 'pnpm-lock.yaml'), LOCKFILE);
  await fs.writeFile(
    path.join(projectRoot, 'AGENTS.md'),
    '# acme studio\n\nA pnpm workspace. The desktop app is apps/studio; apps/legacy is the old build.\n'
  );
  await fs.writeFile(path.join(projectRoot, '.gitignore'), 'node_modules\nagent-reference.local.json\n');
}

const LOCKFILE = `lockfileVersion: '9.0'

importers:
  .:
    devDependencies:
      typescript:
        specifier: 5.9.2
        version: 5.9.2
  apps/studio:
    dependencies:
      '@acme/internal':
        specifier: workspace:*
        version: link:../../packages/internal
      plainpkg:
        specifier: ^1.4.0
        version: 1.4.0
      splitpkg:
        specifier: ^2.0.0
        version: 2.0.0
      shellpkg:
        specifier: ^3.1.0
        version: 3.1.0
      oddpkg:
        specifier: 1.2.3
        version: 1.2.3
      movedpkg:
        specifier: ^5.0.0
        version: 5.0.0
  apps/legacy:
    dependencies:
      splitpkg:
        specifier: ^1.0.0
        version: 1.0.0
  packages/internal: {}

packages:
  typescript@5.9.2:
    resolution: {integrity: sha512-ts}
  plainpkg@1.4.0:
    resolution: {integrity: sha512-plain}
  splitpkg@2.0.0:
    resolution: {integrity: sha512-split2}
  splitpkg@1.0.0:
    resolution: {integrity: sha512-split1}
  shellpkg@3.1.0:
    resolution: {integrity: sha512-shell}
  oddpkg@1.2.3:
    resolution: {integrity: sha512-odd}
  movedpkg@5.0.0:
    resolution: {integrity: sha512-moved}
`;

/** The ordinary case: one package, tagged the way most of npm tags. */
async function plainRepo(parent, name, version) {
  const repoPath = await initRepo(parent, name);
  await writeFiles(repoPath, {
    'package.json': JSON.stringify({ name, version }),
    'src/index.js': `export const ${name.replace(/\W/g, '')} = ${JSON.stringify(version)};\n`,
    'test/index.test.js': `// the tests that never ship to node_modules\n`
  });
  await commit(repoPath, `${name} ${version}`);
  await tag(repoPath, `v${version}`);
  return { path: repoPath };
}

/** Two releases, so the workspace can install two versions of one name. */
async function twoVersionRepo(parent, name) {
  const repoPath = await initRepo(parent, name);
  for (const version of ['1.0.0', '2.0.0']) {
    await writeFiles(repoPath, {
      'package.json': JSON.stringify({ name, version }),
      'src/index.js': `export const version = ${JSON.stringify(version)};\n`
    });
    await commit(repoPath, `${name} ${version}`);
    await tag(repoPath, `v${version}`);
  }
  return { path: repoPath };
}

/** Electron's shape: the root manifest is the release setup, and a bundled app claims the name. */
async function shellRepo(parent, name, version) {
  const repoPath = await initRepo(parent, name);
  await writeFiles(repoPath, {
    'package.json': JSON.stringify({ name: '@shellpkg-ci/dev-root', version: '0.0.0-development' }),
    'docs/api/window.md': '# Window\n\nThe API reference that is the reason to read this repo.\n',
    'lib/browser/init.js': '// the real implementation\n',
    'spec/window-spec.js': "// the maintainers' tests\n",
    'default_app/package.json': JSON.stringify({ name, main: 'main.js' }),
    'default_app/main.js': '// a two-file splash screen, not the package\n'
  });
  await commit(repoPath, `${name} ${version}`);
  await tag(repoPath, `v${version}`);
  return { path: repoPath };
}

/**
 * Releases tagged by date. No tag contains the version, so every heuristic in the funnel
 * misses and the default branch is checked out instead: the case `ref` exists for, and the
 * one where the failure message has to name the mirror so the tags can be listed by hand.
 */
async function oddTagRepo(parent, name, version) {
  const repoPath = await initRepo(parent, name);
  await writeFiles(repoPath, { 'package.json': JSON.stringify({ name, version: '0.9.0' }), 'src/index.js': '// old\n' });
  await commit(repoPath, `${name} 0.9.0`);
  await tag(repoPath, 'release-20251117');

  await writeFiles(repoPath, { 'package.json': JSON.stringify({ name, version }), 'src/index.js': '// the release\n' });
  await commit(repoPath, `${name} ${version}`);
  await tag(repoPath, 'release-20260410');

  // The default branch moves past the release, so a fallback checkout is visibly not it.
  await writeFiles(repoPath, { 'package.json': JSON.stringify({ name, version: '1.3.0-dev' }), 'src/index.js': '// unreleased\n' });
  await commit(repoPath, `${name} back to development`);
  return { path: repoPath };
}

async function initRepo(parent, name) {
  const repoPath = path.join(parent, `${name}.git-source`);
  await fs.mkdir(repoPath, { recursive: true });
  await git(['init', '-b', 'main'], repoPath);
  await git(['config', 'user.email', 'upstream@example.test'], repoPath);
  await git(['config', 'user.name', 'Upstream'], repoPath);
  await git(['config', 'commit.gpgSign', 'false'], repoPath);
  await git(['config', 'tag.gpgSign', 'false'], repoPath);
  return repoPath;
}

async function writeFiles(repoPath, files) {
  for (const [relative, contents] of Object.entries(files)) {
    const target = path.join(repoPath, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, contents);
  }
}

async function write(root, relative, value) {
  const target = path.join(root, relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `${JSON.stringify(value, null, 2)}\n`);
}

async function commit(repoPath, message) {
  await git(['add', '-A'], repoPath);
  await git(['commit', '-m', message], repoPath);
}

async function tag(repoPath, name) {
  await git(['tag', name], repoPath);
}

async function git(args, cwd) {
  const result = await execFileAsync('git', args, { cwd, encoding: 'utf8' });
  return result.stdout.trim();
}
