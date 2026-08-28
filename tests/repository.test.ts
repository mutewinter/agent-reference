import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  normalizeConfiguredRepository,
  normalizeGitRepositoryUrl,
  repositoryCacheParts,
  repositoryUrlFromManifestRepository,
} from '../src/repository.ts';

test('normalizes npm repository URL shapes to cloneable git URLs', () => {
  assert.equal(
    normalizeGitRepositoryUrl('git+https://github.com/facebook/react.git'),
    'https://github.com/facebook/react.git',
  );
  assert.equal(
    normalizeGitRepositoryUrl('git@github.com:colinhacks/zod.git'),
    'https://github.com/colinhacks/zod.git',
  );
  // ssh: and git: are non-special schemes, so they cannot be rewritten by assigning protocol.
  assert.equal(
    normalizeGitRepositoryUrl('git+ssh://git@github.com/stevemao/left-pad.git'),
    'https://github.com/stevemao/left-pad.git',
  );
  assert.equal(normalizeGitRepositoryUrl('ssh://git@github.com/a/b'), 'https://github.com/a/b.git');
  assert.equal(normalizeGitRepositoryUrl('git://github.com/a/b.git'), 'https://github.com/a/b.git');
  assert.equal(
    normalizeGitRepositoryUrl('https://gitlab.com:8443/a/b.git'),
    'https://gitlab.com:8443/a/b.git',
  );
  assert.equal(
    repositoryUrlFromManifestRepository('github:preactjs/preact'),
    'https://github.com/preactjs/preact.git',
  );
  assert.equal(
    repositoryUrlFromManifestRepository({
      type: 'git',
      url: 'https://github.com/vitest-dev/vitest',
    }),
    'https://github.com/vitest-dev/vitest.git',
  );
});

test('builds stable bare repository cache paths', () => {
  assert.deepEqual(repositoryCacheParts('https://github.com/facebook/react.git'), [
    'github.com',
    'facebook',
    'react.git',
  ]);
});

// `file:///C:/src` sliced down to `///C:/src` resolves against the current drive and comes
// back `C:\C:\src`, which git cannot clone. POSIX collapses the slashes and reports nothing,
// so this asserts the round trip rather than a spelling and fails on whichever host is wrong.
test('a file URL repository resolves to the path it names, separators and all', () => {
  const target = path.join(path.resolve('.'), 'checkouts', 'company-ui');
  assert.equal(
    normalizeConfiguredRepository(pathToFileURL(target).href, path.resolve('.')),
    target,
  );
});

test('a relative file: repository still resolves against the project', () => {
  assert.equal(
    normalizeConfiguredRepository('file:checkouts/company-ui', path.resolve('.')),
    path.join(path.resolve('.'), 'checkouts', 'company-ui'),
  );
});

// `git@host:path` is what `git remote -v` prints and what a user pastes out of it. It was
// accepted by the classifier and the config parser, then refused at materialization as an
// unusable URL, so `validate` called a config ok that `get` could not use. The ssh form is
// what git treats it as, and keeps the credentials that are the reason for writing it.
test('an scp-style remote resolves to the ssh URL git reads it as', () => {
  assert.equal(
    normalizeConfiguredRepository('git@github.com:acme/company-ui.git', path.resolve('.')),
    'ssh://git@github.com/acme/company-ui.git',
  );
  assert.equal(
    normalizeConfiguredRepository('deploy@git.acme.dev:ui.git', path.resolve('.')),
    'ssh://deploy@git.acme.dev/ui.git',
  );
  // A user is optional, and a path may be several segments deep.
  assert.equal(
    normalizeConfiguredRepository('git.acme.dev:team/ui.git', path.resolve('.')),
    'ssh://git.acme.dev/team/ui.git',
  );
  assert.equal(
    normalizeConfiguredRepository('git@ssh.dev.azure.com:v3/acme/proj/ui', path.resolve('.')),
    'ssh://git@ssh.dev.azure.com/v3/acme/proj/ui',
  );
});

// Both halves of one repository, spelled two ways, share a mirror rather than cloning twice.
test('an scp-style remote caches beside the https spelling of the same repository', () => {
  assert.deepEqual(
    repositoryCacheParts(
      normalizeConfiguredRepository('git@github.com:acme/ui.git', path.resolve('.')) ?? '',
    ),
    repositoryCacheParts('https://github.com/acme/ui.git'),
  );
});

// The rewrite must never manufacture a URL the transport check would otherwise have refused.
// `ext::sh -c whoami` is git's remote-helper form and runs an arbitrary command; read as a
// host it becomes a valid ssh URL and sails straight past `assertSafeRepositoryUrl`.
test('a transport that is not a host is left for the transport check to refuse', () => {
  for (const hostile of ['ext::sh -c whoami', 'ext::whoami', 'fd::7,8', 'evil:sh -c whoami']) {
    assert.equal(normalizeConfiguredRepository(hostile, path.resolve('.')), hostile);
  }
  // A Windows path is a path, not a host named `C`, whichever separator it uses.
  for (const windows of ['C:\\src\\repo', 'C:/src/repo', 'C:repo']) {
    assert.equal(normalizeConfiguredRepository(windows, path.resolve('.')), windows);
  }
});
