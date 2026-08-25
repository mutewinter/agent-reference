import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { samples } from '../site/code-samples.ts';
import { loadAgentReferenceConfig, parseConfig } from '../src/config.ts';
import { parseJsonc } from '../src/jsonc.ts';
import { runGit } from '../src/git.ts';
import { missingSelectionMessage, resolveSets, selectionFilter } from '../src/sets.ts';
import { validateConfig } from '../src/validate.ts';

test('accepts shorthand strings and longhand objects for every reference kind', () => {
  const config = parseConfig(
    {
      packages: {
        react: '18.2.0',
        zod: { version: '3.25.0', description: 'Schema shapes' },
      },
      paths: {
        notes: './notes',
        'api-docs': { path: '../platform/docs', description: 'Endpoint contracts' },
      },
      git: {
        typescript: 'github:microsoft/TypeScript#main',
        tooling: { repository: 'github:acme/tooling', ref: 'v4', description: 'Build tooling' },
      },
    },
    'agent-reference.json',
  );

  assert.deepEqual(config.packages[0], {
    kind: 'package',
    name: 'react',
    ecosystem: 'npm',
    configKey: 'react',
    scope: 'shared',
    version: '18.2.0',
    ref: null,
    repository: null,
    directory: null,
    description: null,
    sets: [],
  });
  assert.equal(config.packages[1]?.description, 'Schema shapes');
  assert.equal(config.paths[1]?.path, '../platform/docs');
  assert.deepEqual(
    config.git.map((entry) => [entry.repository, entry.ref, entry.spec]),
    [
      ['github:microsoft/TypeScript', 'main', 'github:microsoft/TypeScript#main'],
      ['github:acme/tooling', 'v4', 'github:acme/tooling#v4'],
    ],
  );
});

test('rejects malformed config with a located, actionable message', () => {
  assert.throws(
    () => parseConfig({ package: { react: '18.2.0' } }, 'agent-reference.json'),
    /unknown key package\. Did you mean "packages"\?/,
  );
  assert.throws(
    () => parseConfig({ packages: { react: { descripton: 'typo' } } }, 'agent-reference.json'),
    /unknown key packages\.react\.descripton\. Did you mean "description"\?/,
  );
  assert.throws(
    () => parseConfig({ packages: { react: {} } }, 'agent-reference.json'),
    /packages\.react\.version is required/,
  );
  assert.throws(
    () => parseConfig({ paths: { notes: 42 } }, 'agent-reference.json'),
    /paths\.notes must be a path string or an object/,
  );
  assert.throws(
    () =>
      parseConfig(
        { git: { tooling: { repository: 'github:a/b#main', ref: 'v4' } } },
        'agent-reference.json',
      ),
    /sets ref "v4" but repository already pins "#main"/,
  );
  assert.throws(
    () => parseConfig({ sets: [{ paths: ['./notes'] }] }, 'agent-reference.json'),
    /sets\[0\]\.description is required/,
  );
});

test('the folders key names its replacement rather than reading as a typo', () => {
  assert.throws(
    () => parseConfig({ folders: { notes: './notes' } }, 'agent-reference.json'),
    /folders was renamed to paths, which holds a folder or a file/,
  );

  assert.throws(
    () =>
      parseConfig(
        { sets: [{ description: 'Notes', folders: ['./notes'] }] },
        'agent-reference.json',
      ),
    /sets\[0\]\.folders was renamed to paths/,
  );
});

test('a set is a labeled list: description first, members inline, names derived', () => {
  const config = parseConfig(
    {
      sets: [
        {
          description: 'Documentation sources to read before writing docs',
          paths: [
            './docs/design-notes',
            { path: '../platform/docs', name: 'api-docs', description: 'Endpoint contracts' },
          ],
          git: ['github:acme/design-system#v4'],
          packages: ['zod@3.25.0'],
        },
      ],
    },
    'agent-reference.json',
  );

  const sets = resolveSets(config);
  assert.equal(sets.length, 1);
  assert.equal(sets[0]?.description, 'Documentation sources to read before writing docs');
  assert.deepEqual(
    sets[0]?.members.map((member) => `${member.kind}:${member.name}`),
    ['package:zod', 'path:design-notes', 'path:api-docs', 'git:design-system'],
  );
  assert.equal(config.git[0]?.ref, 'v4');
  assert.equal(config.packages[0]?.version, '3.25.0');
});

test('the same reference in two sets merges into one with both labels', () => {
  const config = parseConfig(
    {
      sets: [
        { name: 'engines', description: 'Engines we study', git: ['github:acme/chess-engine'] },
        { description: 'Everything to read before a rewrite', git: ['github:acme/chess-engine'] },
      ],
    },
    'agent-reference.json',
  );

  assert.equal(config.git.length, 1);
  assert.deepEqual(config.git[0]?.sets, ['engines', 'Everything to read before a rewrite']);
});

test('two declarations disagreeing about a name is a conflict, not repetition', () => {
  assert.throws(
    () =>
      parseConfig(
        {
          paths: { notes: './notes' },
          sets: [{ description: 'Other notes', paths: ['../elsewhere/notes'] }],
        },
        'agent-reference.json',
      ),
    /path "notes" is declared more than once with different targets/,
  );
});

test('selects references by set name, description substring, and qualified name', () => {
  const config = parseConfig(
    {
      packages: { react: '18.2.0' },
      paths: { react: './react-notes' },
      sets: [{ name: 'docs', description: 'Documentation sources', paths: ['./notes'] }],
    },
    'agent-reference.json',
  );

  const byName = selectionFilter(config, { sets: ['docs'] });
  assert.equal(byName?.matches('path', 'notes'), true);
  assert.equal(byName?.matches('package', 'react'), false);

  const bySubstring = selectionFilter(config, { sets: ['documentation'] });
  assert.equal(bySubstring?.matches('path', 'notes'), true);

  const byQualifiedName = selectionFilter(config, { references: ['path:react'] });
  assert.equal(byQualifiedName?.matches('path', 'react'), true);
  assert.equal(byQualifiedName?.matches('package', 'react'), false);

  assert.equal(selectionFilter(config, {}), null);
  assert.throws(() => selectionFilter(config, { sets: ['nope'] }), /No set matches "nope"/);
});

test('a selector that matched nothing is named, not dropped', () => {
  const config = parseConfig(
    { packages: { react: '18.2.0' }, paths: { notes: './notes' } },
    'agent-reference.json',
  );

  const selection = selectionFilter(config, { references: ['react', 'tanstck-router'] });
  // Offering every candidate is what records the hits, exactly as a caller filters.
  for (const [kind, name] of [
    ['package', 'react'],
    ['path', 'notes'],
  ] as const) {
    selection?.matches(kind, name);
  }

  // One name hitting used to be enough to report the whole run a success, so the reference
  // the typo meant was never materialized and nothing said so.
  assert.deepEqual(selection?.unmatched(), [
    { label: 'reference "tanstck-router"', input: 'tanstck-router' },
  ]);
  assert.match(
    missingSelectionMessage(selection?.unmatched() ?? [], config),
    /Nothing matched reference "tanstck-router"\. Known references: package:react, path:notes\./,
  );
});

test('every selector hitting leaves nothing unmatched', () => {
  const config = parseConfig({ packages: { react: '18.2.0' } }, 'agent-reference.json');
  const selection = selectionFilter(config, { references: ['react'] });

  assert.equal(selection?.matches('package', 'react'), true);
  assert.deepEqual(selection?.unmatched(), []);
});

test('local config overrides shared entries by name', async () => {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-reference-config-test-'));
  await fs.writeFile(
    path.join(projectRoot, 'agent-reference.json'),
    JSON.stringify({ paths: { 'company-ui': './vendor/company-ui', notes: './notes' } }),
  );
  await fs.writeFile(
    path.join(projectRoot, 'agent-reference.local.json'),
    JSON.stringify({
      paths: { 'company-ui': { path: '~/code/company-ui', description: 'Local checkout' } },
    }),
  );

  const loaded = await loadAgentReferenceConfig(projectRoot);

  assert.deepEqual(
    loaded?.config.paths.map((entry) => [entry.name, entry.path, entry.description]),
    [
      ['company-ui', '~/code/company-ui', 'Local checkout'],
      ['notes', './notes', null],
    ],
  );
});

test('config files are JSONC, and the same characters inside a string stay data', async () => {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-reference-jsonc-test-'));
  await fs.writeFile(
    path.join(projectRoot, 'agent-reference.json'),
    `{
  // Sources for the engine work.
  "git": {
    "chess-engine": {
      "repository": "github:acme/chess-engine",
      /* A description is prose: whatever it holds is a value, not syntax. */
      "description": "Docs at https://acme.example/docs, and the config shape is { \\"zod\\": \\"3.25.0\\", }"
    },
  },
  "paths": {
    "notes": "./notes" // where the write-ups live
  },
}
`,
  );
  await fs.writeFile(
    path.join(projectRoot, 'agent-reference.local.json'),
    '{ "paths": { "vault": "~/notes" } } // the gitignored file reads the same way\n',
  );

  const loaded = await loadAgentReferenceConfig(projectRoot);

  assert.equal(
    loaded?.config.git[0]?.description,
    'Docs at https://acme.example/docs, and the config shape is { "zod": "3.25.0", }',
  );
  assert.deepEqual(
    loaded?.config.paths.map((entry) => [entry.name, entry.path]),
    [
      ['notes', './notes'],
      ['vault', '~/notes'],
    ],
  );
});

test('validate reports errors and warnings without needing a lockfile', async () => {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-reference-validate-test-'));
  await fs.writeFile(
    path.join(projectRoot, 'agent-reference.json'),
    JSON.stringify({ paths: { notes: './missing' }, sets: [{ description: 'nothing here yet' }] }),
  );

  const report = await validateConfig(projectRoot);

  assert.equal(report.valid, true);
  assert.equal(report.references.length, 1);
  assert.match(
    report.warnings.join('\n'),
    /paths\.notes points at .*missing, which does not exist/,
  );
  assert.match(report.warnings.join('\n'), /Set "nothing here yet" has no members/);

  await fs.writeFile(path.join(projectRoot, 'agent-reference.json'), '{ not json');
  const broken = await validateConfig(projectRoot);

  assert.equal(broken.valid, false);
  assert.match(broken.errors.join('\n'), /is not valid JSON/);
});

test('the printed schema and the parser accept the same top-level keys', async () => {
  const schema = JSON.parse(
    await readFile(new URL('../schema/agent-reference.schema.json', import.meta.url), 'utf8'),
  ) as { properties: Record<string, unknown> };

  // `schema` is what an agent reads to learn the format, so a key here that the parser
  // rejects is a config that fails on its first run.
  for (const key of Object.keys(schema.properties)) {
    assert.doesNotThrow(
      () => parseConfig({ [key]: undefined }, 'agent-reference.json'),
      `schema key ${key}`,
    );
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
        upstream: 'github:acme/chess-engine',
      },
    }),
  );

  const report = await validateConfig(projectRoot);

  assert.equal(report.valid, false);
  assert.match(
    report.errors.join('\n'),
    /git\.secret points at the machine path file:\/opt\/checkouts\/secret/,
  );
  assert.match(
    report.warnings.join('\n'),
    /git\.sibling escapes the repo \(file:\.\.\/company-ui\)/,
  );
  // A remote is portable by construction and has no business in either list.
  assert.doesNotMatch([...report.errors, ...report.warnings].join('\n'), /git\.upstream/);
});

test('a windows machine path is a leak wherever validate runs', async () => {
  const projectRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), 'agent-reference-windows-leak-test-'),
  );
  await fs.writeFile(
    path.join(projectRoot, 'agent-reference.json'),
    JSON.stringify({
      paths: { ui: 'C:\\Users\\somebody\\code\\company-ui', share: '\\\\fileserver\\team\\docs' },
      git: { vendored: 'file:D:/checkouts/vendor' },
    }),
  );

  // path.isAbsolute calls all three relative on POSIX, so a path committed from Windows
  // sailed through the Linux CI run that exists to catch exactly this.
  const report = await validateConfig(projectRoot);

  assert.equal(report.valid, false);
  assert.match(report.errors.join('\n'), /paths\.ui puts the machine path C:/);
  assert.match(report.errors.join('\n'), /paths\.share puts the machine path/);
  assert.match(report.errors.join('\n'), /git\.vendored points at the machine path/);
});

test('cacheDir is a leak in the committed file and unremarkable in the local one', async () => {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-reference-cachedir-test-'));
  const committed = path.join(projectRoot, 'agent-reference.json');
  await fs.writeFile(
    committed,
    JSON.stringify({ cacheDir: '/opt/people/someone/.agent-reference' }),
  );

  const shared = await validateConfig(projectRoot);
  assert.equal(shared.valid, false);
  assert.match(shared.errors.join('\n'), /cacheDir puts the machine path \/opt\/people\/someone/);

  await fs.writeFile(committed, JSON.stringify({}));
  await fs.writeFile(
    path.join(projectRoot, 'agent-reference.local.json'),
    JSON.stringify({ cacheDir: '/opt/people/someone/.agent-reference' }),
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

test('two subtrees of one repository are two references, not one repeated declaration', () => {
  const withNames = parseConfig(
    {
      sets: [
        {
          description: 'acme platform surface',
          git: [
            {
              name: 'design-system',
              repository: 'github:acme/monorepo',
              ref: 'v2',
              directory: 'packages/design-system',
            },
            {
              name: 'api-client',
              repository: 'github:acme/monorepo',
              ref: 'v2',
              directory: 'packages/api-client',
            },
          ],
        },
      ],
    },
    'agent-reference.json',
  );

  assert.deepEqual(
    withNames.git.map((entry) => [entry.name, entry.directory]),
    [
      ['design-system', 'packages/design-system'],
      ['api-client', 'packages/api-client'],
    ],
  );

  // Without names both derive "monorepo" from the repository. The directory has to count as
  // part of the target, or they merge and one subtree silently wins.
  assert.throws(
    () =>
      parseConfig(
        {
          sets: [
            {
              description: 'acme platform surface',
              git: [
                {
                  repository: 'github:acme/monorepo',
                  ref: 'v2',
                  directory: 'packages/design-system',
                },
                { repository: 'github:acme/monorepo', ref: 'v2', directory: 'packages/api-client' },
              ],
            },
          ],
        },
        'agent-reference.json',
      ),
    /git "monorepo" is declared more than once with different targets. Give one of them an explicit "name"/,
  );
});

test('a packages key may carry the ecosystem prefix that get prints back', () => {
  const config = parseConfig(
    { packages: { 'npm:zod': '3.22.0', react: '18.2.0' } },
    'agent-reference.json',
  );

  const zod = config.packages.find((entry) => entry.name === 'zod');
  // The prefix is taken off the name, so every lookup that has only the package name still
  // finds the entry. Storing `npm:zod` as the name made a pin unreachable and silently inert.
  assert.equal(zod?.name, 'zod');
  assert.equal(zod?.ecosystem, 'npm');
  assert.equal(zod?.configKey, 'npm:zod');

  const react = config.packages.find((entry) => entry.name === 'react');
  assert.equal(react?.ecosystem, 'npm');
  assert.equal(react?.configKey, 'react');
});

test('the prefixed and bare spellings of one package are one reference', () => {
  const config = parseConfig(
    {
      packages: {
        zod: '3.22.0',
        'npm:zod': { version: '3.22.0', description: 'Same package, spelled twice' },
      },
    },
    'agent-reference.json',
  );

  assert.equal(config.packages.length, 1);
  assert.equal(config.packages[0]?.description, 'Same package, spelled twice');

  assert.throws(
    () => parseConfig({ packages: { zod: '3.22.0', 'npm:zod': '3.23.0' } }, 'agent-reference.json'),
    /package "zod" is declared more than once with different targets/,
  );
});

test('a packages key naming an ecosystem this build cannot resolve fails at parse time', () => {
  assert.throws(
    () => parseConfig({ packages: { 'pypi:requests': '2.32.0' } }, 'agent-reference.json'),
    /pypi: coordinates are not supported yet.*declare requests under "git"/s,
  );

  // Not a known ecosystem at all, so the fix is a different one: the prefix is the mistake.
  assert.throws(
    () => parseConfig({ packages: { 'nmp:zod': '3.22.0' } }, 'agent-reference.json'),
    /"nmp:" is not an ecosystem.*a key with no prefix means npm/s,
  );
});

test('a version in a packages key is rejected, naming the shape that works', () => {
  assert.throws(
    () => parseConfig({ packages: { 'zod@3.22.0': '3.22.0' } }, 'agent-reference.json'),
    /carries a version in the key.*write "zod": "3.22.0"/s,
  );

  // A scoped name's leading @ is not a version separator.
  const config = parseConfig({ packages: { '@scope/thing': '1.0.0' } }, 'agent-reference.json');
  assert.equal(config.packages[0]?.name, '@scope/thing');
});

test('a set member may carry the ecosystem prefix too', () => {
  const config = parseConfig(
    {
      sets: [
        {
          description: 'validators we mirror',
          packages: ['npm:zod@3.22.0', { name: 'npm:yup', version: '1.4.0' }],
        },
      ],
    },
    'agent-reference.json',
  );

  assert.deepEqual(
    config.packages.map((entry) => [entry.name, entry.ecosystem, entry.configKey]),
    [
      ['zod', 'npm', 'npm:zod'],
      ['yup', 'npm', 'npm:yup'],
    ],
  );
});

test('every config the docs show is a config this parser accepts', () => {
  // The site and the README render these, so a sample that does not parse is a copy-paste
  // trap sitting on the front page. The complex example carried one: a set member and a
  // top-level entry named the same repository at different refs, which is a hard error.
  for (const [name, sample] of Object.entries(samples)) {
    if (sample.lang !== 'jsonc') continue;
    assert.doesNotThrow(() => parseConfig(parseJsonc(sample.code), 'agent-reference.json'), name);
  }
});
