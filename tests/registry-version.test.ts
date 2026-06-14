import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveRegistryVersion } from '../src/registry-version.ts';

test('resolves exact versions without registry access', async () => {
  const version = await resolveRegistryVersion('tiny-warning', '1.0.3', {
    fetchImpl: failFetch
  });

  assert.equal(version, '1.0.3');
});

test('resolves dist-tags and semver ranges from packument data', async () => {
  const fetchImpl = async (): Promise<Response> => {
    return new Response(JSON.stringify({
      'dist-tags': {
        latest: '2.0.0'
      },
      versions: {
        '1.0.0': {},
        '1.2.0': {},
        '2.0.0': {}
      }
    }));
  };

  assert.equal(await resolveRegistryVersion('example', 'latest', { fetchImpl }), '2.0.0');
  assert.equal(await resolveRegistryVersion('example', '^1.0.0', { fetchImpl }), '1.2.0');
});

async function failFetch(): Promise<Response> {
  throw new Error('fetch should not be called');
}
