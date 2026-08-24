import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { loadAgentReferenceConfig, parseConfig } from '../src/config.ts';
import { runGit } from '../src/git.ts';
import { resolveSets, selectionFilter } from '../src/sets.ts';
import { validateConfig } from '../src/validate.ts';

test('accepts shorthand strings and longhand objects for every reference kind', () => {
  const config = parseConfig(
    {
      packages: {
        react: '18.2.0',
        zod: { version: '3.25.0', description: 'Schema shapes' }
      },
      folders: {
        notes: './notes',
        'api-docs': { path: '../platform/docs', description: 'Endpoint contracts' }
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
    version: '18.2.0',
    ref: null,
    repository: null,
    directory: null,
    description: null,
    sets: []
  });
  assert.equal(config.packages[1]?.description, 'Schema shapes');
  assert.equal(config.folders[1]?.path, '../platform/docs');
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
    () => parseConfig({ package: { react: '18.2.0' } }, 'agent-reference.json'),
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
  assert.throws(
    () => parseConfig({ sets: [{ folders: ['./notes'] }] }, 'agent-reference.json'),
    /sets\[0\]\.description is required/
  );
});

test('a set is a labeled list: description first, members inline, names derived', () => {
  const config = parseConfig(
    {
      sets: [
        {
          description: 'Documentation sources to read before writing docs',
          folders: ['./docs/design-notes', { path: '../platform/docs', name: 'api-docs', description: 'Endpoint contracts' }],
          git: ['github:acme/design-system#v4'],
          packages: ['zod@3.25.0']
        }
      ]
    },
    'agent-reference.json'
  );

  const sets = resolveSets(config);
  assert.equal(sets.length, 1);
  assert.equal(sets[0]?.description, 'Documentation sources to read before writing docs');
  assert.deepEqual(sets[0]?.members.map((member) => `${member.kind}:${member.name}`), [
    'package:zod',
    'folder:design-notes',
    'folder:api-docs',
    'git:design-system'
  ]);
  assert.equal(config.git[0]?.ref, 'v4');
  assert.equal(config.packages[0]?.version, '3.25.0');
});

test('the same reference in two sets merges into one with both labels', () => {
  const config = parseConfig(
    {
      sets: [
        { name: 'engines', description: 'Engines we study', git: ['github:acme/chess-engine'] },
        { description: 'Everything to read before a rewrite', git: ['github:acme/chess-engine'] }
      ]
    },
    'agent-reference.json'
  );

  assert.equal(config.git.length, 1);
  assert.deepEqual(config.git[0]?.sets, ['engines', 'Everything to read before a rewrite']);
});

test('two declarations disagreeing about a name is a conflict, not repetition', () => {
  assert.throws(
    () =>
      parseConfig(
        {
          folders: { notes: './notes' },
          sets: [{ description: 'Other notes', folders: ['../elsewhere/notes'] }]
        },
        'agent-reference.json'
      ),
    /folder "notes" is declared more than once with different targets/
  );
});

test('selects references by set name, description substring, and qualified name', () => {
  const config = parseConfig(
    {
      packages: { react: '18.2.0' },
      folders: { react: './react-notes' },
      sets: [{ name: 'docs', description: 'Documentation sources', folders: ['./notes'] }]
    },
    'agent-reference.json'
  );

  const byName = selectionFilter(config, { sets: ['docs'] });
  assert.equal(byName?.('folder', 'notes'), true);
  assert.equal(byName?.('package', 'react'), false);

  const bySubstring = selectionFilter(config, { sets: ['documentation'] });
  assert.equal(bySubstring?.('folder', 'notes'), true);

  const byQualifiedName = selectionFilter(config, { references: ['folder:react'] });
  assert.equal(byQualifiedName?.('folder', 'react'), true);
  assert.equal(byQualifiedName?.('package', 'react'), false);

  assert.equal(selectionFilter(config, {}), null);
  assert.throws(() => selectionFilter(config, { sets: ['nope'] }), /No set matches "nope"/);
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
    JSON.stringify({ folders: { notes: './missing' }, sets: [{ description: 'nothing here yet' }] })
  );

  const report = await validateConfig(projectRoot);

  assert.equal(report.valid, true);
  assert.equal(report.references.length, 1);
  assert.match(report.warnings.join('\n'), /folders\.notes points at .*missing, which does not exist/);
  assert.match(report.warnings.join('\n'), /Set "nothing here yet" has no members/);

  await fs.writeFile(path.join(projectRoot, 'agent-reference.json'), '{ not json');
  const broken = await validateConfig(projectRoot);

  assert.equal(broken.valid, false);
  assert.match(broken.errors.join('\n'), /is not valid JSON/);
});

test('the printed schema and the parser accept the same top-level keys', async () => {
  const schema = JSON.parse(
    await readFile(new URL('../schema/agent-reference.schema.json', import.meta.url), 'utf8')
  ) as { properties: Record<string, unknown> };

  // `schema` is what an agent reads to learn the format, so a key here that the parser
  // rejects is a config that fails on its first run.
  for (const key of Object.keys(schema.properties)) {
    assert.doesNotThrow(() => parseConfig({ [key]: undefined }, 'agent-reference.json'), `schema key ${key}`);
  }
});

test('a local repository in the committed config leaks a machine path the same way a folder does', async () => {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-reference-git-leak-test-'));
  await fs.writeFile(
    path.join(projectRoot, 'agent-reference.json'),
    JSON.stringify({
      git: {
        secret: 'file:/opt/checkouts/secret',
        sibling: 'file:../company-ui',
        upstream: 'github:acme/chess-engine'
      }
    })
  );

  const report = await validateConfig(projectRoot);

  assert.equal(report.valid, false);
  assert.match(report.errors.join('\n'), /git\.secret points at the machine path file:\/opt\/checkouts\/secret/);
  assert.match(report.warnings.join('\n'), /git\.sibling escapes the repo \(file:\.\.\/company-ui\)/);
  // A remote is portable by construction and has no business in either list.
  assert.doesNotMatch([...report.errors, ...report.warnings].join('\n'), /git\.upstream/);
});

test('cacheDir is a leak in the committed file and unremarkable in the local one', async () => {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-reference-cachedir-test-'));
  const committed = path.join(projectRoot, 'agent-reference.json');
  await fs.writeFile(committed, JSON.stringify({ cacheDir: '/opt/people/someone/.agent-reference' }));

  const shared = await validateConfig(projectRoot);
  assert.equal(shared.valid, false);
  assert.match(shared.errors.join('\n'), /cacheDir puts the machine path \/opt\/people\/someone/);

  await fs.writeFile(committed, JSON.stringify({}));
  await fs.writeFile(
    path.join(projectRoot, 'agent-reference.local.json'),
    JSON.stringify({ cacheDir: '/opt/people/someone/.agent-reference' })
  );

  const local = await validateConfig(projectRoot);
  assert.equal(local.valid, true);
  assert.doesNotMatch(local.errors.join('\n'), /cacheDir/);
});

test('a committed local config is reported as tracked, because .gitignore cannot undo that', async () => {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-reference-tracked-test-'));
  await fs.writeFile(path.join(projectRoot, 'agent-reference.json'), JSON.stringify({}));
  await fs.writeFile(path.join(projectRoot, 'agent-reference.local.json'), JSON.stringify({}));

  const clean = await validateConfig(projectRoot);
  assert.equal(clean.localConfigTracked, false);
  assert.equal(clean.valid, true);

  await runGit(['init', '-q', projectRoot]);
  await runGit(['-C', projectRoot, 'add', 'agent-reference.local.json']);
  // Ignoring it afterwards is exactly the move that looks like a fix and is not one.
  await fs.writeFile(path.join(projectRoot, '.gitignore'), 'agent-reference.local.json\n');

  const tracked = await validateConfig(projectRoot);
  assert.equal(tracked.localConfigTracked, true);
  assert.equal(tracked.valid, false);
  assert.match(tracked.errors.join('\n'), /git rm --cached agent-reference\.local\.json/);
});
