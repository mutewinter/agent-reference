import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { loadAgentReferenceConfig, parseConfig } from '../src/config.ts';
import { resolveReferenceGroups, selectionFilter } from '../src/groups.ts';
import { validateConfig } from '../src/validate.ts';

test('accepts shorthand strings and longhand objects for every reference kind', () => {
  const config = parseConfig(
    {
      packages: {
        react: 'installed',
        zod: { version: '3.25.0', description: 'Schema shapes', groups: ['validation'] }
      },
      folders: {
        notes: './notes',
        'api-docs': { path: '../platform/docs', description: 'Endpoint contracts', groups: 'documentation' }
      },
      git: {
        typescript: 'github:microsoft/TypeScript#main',
        tooling: { repository: 'github:acme/tooling', ref: 'v4', description: 'Build tooling' }
      }
    },
    'agent-reference.json'
  );

  assert.deepEqual(config.packages[0], {
    kind: 'package',
    name: 'react',
    scope: 'shared',
    version: 'installed',
    ref: null,
    repository: null,
    directory: null,
    description: null,
    groups: []
  });
  assert.equal(config.packages[1]?.description, 'Schema shapes');
  assert.deepEqual(config.packages[1]?.groups, ['validation']);
  assert.equal(config.folders[1]?.path, '../platform/docs');
  assert.deepEqual(config.folders[1]?.groups, ['documentation']);
  assert.deepEqual(
    config.git.map((entry) => [entry.repository, entry.ref, entry.spec]),
    [
      ['github:microsoft/TypeScript', 'main', 'github:microsoft/TypeScript#main'],
      ['github:acme/tooling', 'v4', 'github:acme/tooling#v4']
    ]
  );
});

test('rejects malformed config with a located, actionable message', () => {
  assert.throws(
    () => parseConfig({ package: { react: 'installed' } }, 'agent-reference.json'),
    /unknown key package\. Did you mean "packages"\?/
  );
  assert.throws(
    () => parseConfig({ packages: { react: { descripton: 'typo' } } }, 'agent-reference.json'),
    /unknown key packages\.react\.descripton\. Did you mean "description"\?/
  );
  assert.throws(
    () => parseConfig({ packages: { react: {} } }, 'agent-reference.json'),
    /packages\.react\.version is required/
  );
  assert.throws(
    () => parseConfig({ folders: { notes: 42 } }, 'agent-reference.json'),
    /folders\.notes must be a path string or an object/
  );
  assert.throws(
    () => parseConfig({ git: { tooling: { repository: 'github:a/b#main', ref: 'v4' } } }, 'agent-reference.json'),
    /sets ref "v4" but repository already pins "#main"/
  );
});

test('unions group membership declared on references and on the group', () => {
  const config = parseConfig(
    {
      folders: {
        'api-docs': { path: './docs/api', groups: ['documentation'] },
        'design-notes': './docs/design',
        internal: './docs/internal'
      },
      groups: {
        documentation: { description: 'Read before writing docs', references: ['design-notes', 'folder:internal'] }
      }
    },
    'agent-reference.json'
  );

  const groups = resolveReferenceGroups(config);
  assert.equal(groups.length, 1);
  assert.equal(groups[0]?.description, 'Read before writing docs');
  assert.deepEqual(groups[0]?.members.map((member) => member.name), ['api-docs', 'design-notes', 'internal']);
});

test('rejects group membership that names an unknown reference', () => {
  const config = parseConfig(
    { folders: { notes: './notes' }, groups: { docs: { references: ['nope'] } } },
    'agent-reference.json'
  );

  assert.throws(() => resolveReferenceGroups(config), /lists "nope", which is not a configured reference/);
});

test('selects references by group name and by qualified reference name', () => {
  const config = parseConfig(
    {
      packages: { react: 'installed' },
      folders: { notes: { path: './notes', groups: ['documentation'] }, react: './react-notes' }
    },
    'agent-reference.json'
  );

  const byGroup = selectionFilter(config, { groups: ['documentation'] });
  assert.equal(byGroup?.('folder', 'notes'), true);
  assert.equal(byGroup?.('package', 'react'), false);

  const byQualifiedName = selectionFilter(config, { references: ['folder:react'] });
  assert.equal(byQualifiedName?.('folder', 'react'), true);
  assert.equal(byQualifiedName?.('package', 'react'), false);

  assert.equal(selectionFilter(config, {}), null);
  assert.throws(() => selectionFilter(config, { groups: ['nope'] }), /Unknown group "nope"/);
});

test('local config overrides shared entries by name', async () => {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-reference-config-test-'));
  await fs.writeFile(
    path.join(projectRoot, 'agent-reference.json'),
    JSON.stringify({ folders: { 'company-ui': './vendor/company-ui', notes: './notes' } })
  );
  await fs.writeFile(
    path.join(projectRoot, 'agent-reference.local.json'),
    JSON.stringify({ folders: { 'company-ui': { path: '~/code/company-ui', description: 'Local checkout' } } })
  );

  const loaded = await loadAgentReferenceConfig(projectRoot);

  assert.deepEqual(
    loaded?.config.folders.map((folder) => [folder.name, folder.path, folder.description]),
    [
      ['company-ui', '~/code/company-ui', 'Local checkout'],
      ['notes', './notes', null]
    ]
  );
});

test('validate reports errors and warnings without needing a lockfile', async () => {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-reference-validate-test-'));
  await fs.writeFile(
    path.join(projectRoot, 'agent-reference.json'),
    JSON.stringify({ folders: { notes: './missing' }, groups: { empty: 'nothing here yet' } })
  );

  const report = await validateConfig(projectRoot);

  assert.equal(report.valid, true);
  assert.equal(report.references.length, 1);
  assert.match(report.warnings.join('\n'), /folders\.notes points at .*missing, which does not exist/);
  assert.match(report.warnings.join('\n'), /Group "empty" has no members/);

  await fs.writeFile(path.join(projectRoot, 'agent-reference.json'), '{ not json');
  const broken = await validateConfig(projectRoot);

  assert.equal(broken.valid, false);
  assert.match(broken.errors.join('\n'), /is not valid JSON/);
});
