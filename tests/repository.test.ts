import assert from 'node:assert/strict';
import test from 'node:test';

import {
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
