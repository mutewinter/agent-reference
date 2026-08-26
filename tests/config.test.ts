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
import { resolveReferencePath } from '../src/fs-utils.ts';
import { classifySource } from '../src/source.ts';
import { validateConfig } from '../src/validate.ts';

test('one map holds every kind, and the kind comes out of the source', () => {
  const config = parseConfig(
    {
      references: {
        react: {
          source: 'npm:react@18.2.0',
          description: 'The framework this project is written in',
        },
        zod: { source: 'zod@3.25.0', description: 'Schema shapes' },
        notes: {
          source: './notes',
          description: 'Project notes, read where they live',
        },
        'api-docs': { source: '../platform/docs', description: 'Endpoint contracts' },
        typescript: {
          source: 'github:microsoft/TypeScript#main',
          description: 'The compiler, for checking what a flag does',
        },
        tooling: { source: 'github:acme/tooling', ref: 'v4', description: 'Build tooling' },
      },
    },
    'agent-reference.json',
  );

  assert.deepEqual(config.packages[0], {
    kind: 'package',
    name: 'react',
    ecosystem: 'npm',
    scope: 'shared',
    version: '18.2.0',
    ref: null,
    repository: null,
    directory: null,
    description: 'The framework this project is written in',
    sets: [],
  });
  assert.equal(config.packages[1]?.description, 'Schema shapes');
  // A bare name still means npm, so the two spellings land on the same ecosystem.
  assert.deepEqual(
    config.packages.map((entry) => [entry.name, entry.ecosystem, entry.version]),
    [
      ['react', 'npm', '18.2.0'],
      ['zod', 'npm', '3.25.0'],
    ],
  );
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
    () => parseConfig({ refrences: { react: 'npm:react@18.2.0' } }, 'agent-reference.json'),
    /unknown key refrences\. Did you mean "references"\?/,
  );
  assert.throws(
    () =>
      parseConfig(
        { references: { react: { source: 'npm:react@18.2.0', descripton: 'typo' } } },
        'agent-reference.json',
      ),
    /unknown key references\.react\.descripton\. Did you mean "description"\?/,
  );
  // The typo is named before the shape is judged, or every misspelled key reads as an
  // object that is neither a reference nor a set.
  assert.throws(
    () => parseConfig({ references: { react: { sorce: './x' } } }, 'agent-reference.json'),
    /unknown key references\.react\.sorce\. Did you mean "source"\?/,
  );
  assert.throws(
    () =>
      parseConfig({ references: { react: { description: 'no source' } } }, 'agent-reference.json'),
    /references\.react has neither "source" nor "references"/,
  );
  assert.throws(
    () => parseConfig({ references: { notes: 42 } }, 'agent-reference.json'),
    /references\.notes must be an object/,
  );
  assert.throws(
    () =>
      parseConfig(
        { references: { both: { source: './a', references: {}, description: 'x' } } },
        'agent-reference.json',
      ),
    /references\.both has both "source" and "references"/,
  );
  assert.throws(
    () => parseConfig({ references: { notes: { source: './notes' } } }, 'agent-reference.json'),
    /references\.notes\.description is required/,
  );
  assert.throws(
    () =>
      parseConfig(
        {
          references: {
            tooling: { source: 'github:a/b#main', ref: 'v4', description: 'Build tooling' },
          },
        },
        'agent-reference.json',
      ),
    /sets ref "v4" but the source already pins "#main"/,
  );
});

test('the four keys that became one name where their entries go', () => {
  assert.throws(
    () => parseConfig({ folders: { notes: './notes' } }, 'agent-reference.json'),
    /folders was folded into one "references" map keyed by name.*a path is a source/s,
  );
  assert.throws(
    () => parseConfig({ packages: { zod: '3.22.0' } }, 'agent-reference.json'),
    /packages was folded into one "references" map keyed by name.*the version moves into the source/s,
  );
  assert.throws(
    () => parseConfig({ git: { pi: 'github:a/b' } }, 'agent-reference.json'),
    /git was folded into one "references" map keyed by name.*the repository moves into the source/s,
  );
  assert.throws(
    () => parseConfig({ sets: [{ description: 'Notes' }] }, 'agent-reference.json'),
    /sets was folded into one "references" map keyed by name.*a set is a reference holding several/s,
  );
});

test('a set is a reference that resolves to several paths, keyed by its own name', () => {
  const config = parseConfig(
    {
      references: {
        docs: {
          description: 'Documentation sources to read before writing docs',
          references: {
            'design-notes': { source: './docs/design-notes', description: 'How this looks' },
            'api-docs': { source: '../platform/docs', description: 'Endpoint contracts' },
            'design-system': {
              source: 'github:acme/design-system#v4',
              description: 'The components these docs describe',
            },
            zod: { source: 'npm:zod@3.25.0', description: 'Schema shapes' },
          },
        },
      },
    },
    'agent-reference.json',
  );

  const sets = resolveSets(config);
  assert.equal(sets.length, 1);
  assert.equal(sets[0]?.name, 'docs');
  assert.equal(sets[0]?.description, 'Documentation sources to read before writing docs');
  // One map holds every kind, so a set can mix a package, a repository and a folder.
  assert.deepEqual(
    sets[0]?.members.map((member) => `${member.kind}:${member.name}`),
    ['package:zod', 'path:design-notes', 'path:api-docs', 'git:design-system'],
  );
  assert.equal(config.git[0]?.ref, 'v4');
  assert.equal(config.packages[0]?.version, '3.25.0');
});

test('the shorthands that are gone name what replaced them', () => {
  assert.throws(
    () => parseConfig({ references: { pi: 'github:earendil-works/pi' } }, 'agent-reference.json'),
    /references\.pi is a bare source string.*"source": "github:earendil-works\/pi"/s,
  );
  assert.throws(
    () =>
      parseConfig(
        { references: { engines: ['github:acme/chess-engine'] } },
        'agent-reference.json',
      ),
    /references\.engines is an array.*a "references" object keyed by name/s,
  );
  // `name` was how a member earned a handle inside an array. The key is the handle now.
  assert.throws(
    () =>
      parseConfig(
        {
          references: {
            engines: {
              description: 'Engines we study',
              references: {
                chess: { source: 'github:acme/chess-engine', name: 'engine', description: 'One' },
              },
            },
          },
        },
        'agent-reference.json',
      ),
    /a set member is keyed by its name now.*the key replaces this field/s,
  );
});

test('the same source in two sets merges into one reference with both labels', () => {
  const config = parseConfig(
    {
      references: {
        engines: {
          description: 'Engines we study',
          references: {
            'chess-engine': { source: 'github:acme/chess-engine', description: 'The engine' },
          },
        },
        rewrite: {
          description: 'Everything to read before a rewrite',
          references: {
            'chess-engine': { source: 'github:acme/chess-engine', description: 'The engine' },
          },
        },
      },
    },
    'agent-reference.json',
  );

  assert.equal(config.git.length, 1);
  assert.deepEqual(config.git[0]?.sets, ['engines', 'rewrite']);
});

test('two declarations disagreeing about a name is a conflict, not repetition', () => {
  assert.throws(
    () =>
      parseConfig(
        {
          references: {
            notes: {
              source: './notes',
              description: 'Project notes, read where they live',
            },
            other: {
              description: 'Other notes',
              references: {
                notes: { source: '../elsewhere/notes', description: 'Notes kept elsewhere' },
              },
            },
          },
        },
        'agent-reference.json',
      ),
    /"notes" is declared more than once and the two point somewhere different/,
  );
});

test('every spelling of ~ the grammar accepts is expanded, not resolved against the project', () => {
  // The classifier takes `~`, `~/x` and `~\\x`; the resolver took only `~/x`, so the other
  // two resolved against the project root and invented a directory named `~` beside it.
  for (const spec of ['~', '~/notes', '~\\notes']) {
    assert.equal(classifySource(spec).kind, 'path', spec);
    assert.equal(
      resolveReferencePath('/project', spec).startsWith(os.homedir()),
      true,
      `${spec} resolved outside the home directory`,
    );
  }

  assert.equal(resolveReferencePath('/project', '~'), os.homedir());
  assert.equal(resolveReferencePath('/project', './docs'), path.resolve('/project', 'docs'));
});

test('a set may not take a name a reference already has', () => {
  // A set and its member are the same kind of handle, so they cannot both be `instrument`.
  assert.throws(
    () =>
      parseConfig(
        {
          references: {
            instrument: {
              description: 'The instrument checkouts',
              references: {
                instrument: { source: './instrument', description: 'The app itself' },
              },
            },
          },
        },
        'agent-reference.json',
      ),
    /"instrument" is both a set and a path reference/,
  );
});

test('a set holds references, never other sets', () => {
  assert.throws(
    () =>
      parseConfig(
        {
          references: {
            outer: {
              description: 'Outer',
              references: { inner: { description: 'Inner', references: {} } },
            },
          },
        },
        'agent-reference.json',
      ),
    /references\.outer\.references\.inner is a set inside a set/,
  );
});

test('a key that does nothing for its source is refused rather than ignored', () => {
  assert.throws(
    () =>
      parseConfig(
        { references: { n: { source: './notes', ref: 'main', description: 'Notes' } } },
        'agent-reference.json',
      ),
    /references\.n\.ref does nothing for this source/,
  );
  assert.throws(
    () =>
      parseConfig(
        { references: { n: { source: './notes', directory: 'sub', description: 'Notes' } } },
        'agent-reference.json',
      ),
    /references\.n\.directory does nothing for this source/,
  );
  assert.throws(
    () =>
      parseConfig(
        {
          references: {
            n: { source: 'github:a/b', repository: 'github:c/d', description: 'A repo' },
          },
        },
        'agent-reference.json',
      ),
    /references\.n\.repository does nothing for this source/,
  );
});

test('a local checkout is read where it lives, so the file: prefix names the path to write', () => {
  assert.throws(
    () =>
      parseConfig(
        {
          references: {
            ui: {
              source: 'file:../company-ui',
              description: 'The shared component library next door',
            },
          },
        },
        'agent-reference.json',
      ),
    /"file:\.\.\/company-ui" is not a source.*Write "\.\.\/company-ui" to read that checkout where it lives.*not the same thing.*snapshot/s,
  );

  // A `file://` URL is a git URL like any other, and still clones into the store.
  const config = parseConfig(
    {
      references: {
        ui: {
          source: 'file:///opt/checkouts/company-ui',
          description: 'The shared component library next door',
        },
      },
    },
    'agent-reference.json',
  );
  assert.equal(config.git[0]?.repository, 'file:///opt/checkouts/company-ui');
});

test('a selector is a name, and a set name stands for its members', () => {
  const config = parseConfig(
    {
      references: {
        react: {
          source: 'npm:react@18.2.0',
          description: 'The framework this project is written in',
        },
        'react-notes': {
          source: './react-notes',
          description: 'Notes on the framework upgrade',
        },
        docs: {
          description: 'Documentation sources',
          references: {
            notes: { source: './notes', description: 'Project notes, read where they live' },
          },
        },
      },
    },
    'agent-reference.json',
  );

  const bySetName = selectionFilter(config, { references: ['docs'] });
  assert.equal(bySetName?.matches('path', 'notes'), true);
  assert.equal(bySetName?.matches('package', 'react'), false);

  const byName = selectionFilter(config, { references: ['react-notes'] });
  assert.equal(byName?.matches('path', 'react-notes'), true);
  assert.equal(byName?.matches('package', 'react'), false);

  // A word out of a description is not a selector. It resolved here and not in `get`,
  // which classifies the spec itself and would have asked a registry for a package by
  // that word: one selector, two behaviors, one of them a network fetch.
  const bySubstring = selectionFilter(config, { references: ['documentation'] });
  assert.equal(bySubstring?.matches('path', 'notes'), false);

  assert.equal(selectionFilter(config, {}), null);
});

test('a selector that matched nothing is named, not dropped', () => {
  const config = parseConfig(
    {
      references: {
        react: {
          source: 'npm:react@18.2.0',
          description: 'The framework this project is written in',
        },
        notes: { source: './notes', description: 'Project notes, read where they live' },
      },
    },
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
    /Nothing matched reference "tanstck-router"\. Known references: react, notes\./,
  );
});

test('every selector hitting leaves nothing unmatched', () => {
  const config = parseConfig(
    {
      references: {
        react: {
          source: 'npm:react@18.2.0',
          description: 'The framework this project is written in',
        },
      },
    },
    'agent-reference.json',
  );
  const selection = selectionFilter(config, { references: ['react'] });

  assert.equal(selection?.matches('package', 'react'), true);
  assert.deepEqual(selection?.unmatched(), []);
});

test('local config overrides shared entries by name', async () => {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-reference-config-test-'));
  await fs.writeFile(
    path.join(projectRoot, 'agent-reference.json'),
    JSON.stringify({
      references: {
        'company-ui': { source: './vendor/company-ui', description: 'The vendored copy' },
        notes: { source: './notes', description: 'Project notes, read where they live' },
      },
    }),
  );
  await fs.writeFile(
    path.join(projectRoot, 'agent-reference.local.json'),
    JSON.stringify({
      references: {
        'company-ui': { source: '~/code/company-ui', description: 'Local checkout' },
      },
    }),
  );

  const loaded = await loadAgentReferenceConfig(projectRoot);

  assert.deepEqual(
    loaded?.config.paths.map((entry) => [entry.name, entry.path, entry.description]),
    [
      ['company-ui', '~/code/company-ui', 'Local checkout'],
      ['notes', './notes', 'Project notes, read where they live'],
    ],
  );
});

test('a local entry overrides a committed one of any kind, not just its own', async () => {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-reference-override-kind-'));
  await fs.writeFile(
    path.join(projectRoot, 'agent-reference.json'),
    JSON.stringify({
      references: { zod: { source: 'npm:zod@3.22.0', description: 'Schema shapes' } },
    }),
  );
  await fs.writeFile(
    path.join(projectRoot, 'agent-reference.local.json'),
    JSON.stringify({ references: { zod: { source: '~/code/zod', description: 'Schema shapes' } } }),
  );

  // Three arrays merged separately, so both survived: `get` answered with whichever
  // it reached first and `status` printed two rows for one name.
  const loaded = await loadAgentReferenceConfig(projectRoot);

  assert.equal(loaded?.config.packages.length, 0);
  assert.deepEqual(
    loaded?.config.paths.map((entry) => [entry.name, entry.path]),
    [['zod', '~/code/zod']],
  );
});

test('a set in one file and a reference in the other names both files', async () => {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-reference-xfile-set-'));
  await fs.writeFile(
    path.join(projectRoot, 'agent-reference.json'),
    JSON.stringify({
      references: {
        harnesses: {
          description: 'Harnesses worth reading',
          references: {
            'chess-engine': { source: 'github:acme/chess-engine', description: 'The engine' },
          },
        },
      },
    }),
  );
  await fs.writeFile(
    path.join(projectRoot, 'agent-reference.local.json'),
    JSON.stringify({
      references: {
        harnesses: { source: '~/code/harnesses', description: 'Harnesses worth reading' },
      },
    }),
  );

  // Not an override the way two references are: one resolves to a path and the
  // other to several, so there is nothing to prefer.
  await assert.rejects(
    loadAgentReferenceConfig(projectRoot),
    /"harnesses" is a set in .*agent-reference\.json and a path reference in .*agent-reference\.local\.json/,
  );
});

test('config files are JSONC, and the same characters inside a string stay data', async () => {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-reference-jsonc-test-'));
  await fs.writeFile(
    path.join(projectRoot, 'agent-reference.json'),
    `{
  // Sources for the engine work.
  "references": {
    "chess-engine": {
      "source": "github:acme/chess-engine",
      /* A description is prose: whatever it holds is a value, not syntax. */
      "description": "Docs at https://acme.example/docs, and the config shape is { \\"zod\\": \\"npm:zod@3.25.0\\", }"
    },
    "notes": {
      "source": "./notes", // where the write-ups live
      "description": "Project notes, read where they live"
    }
  },
}
`,
  );
  await fs.writeFile(
    path.join(projectRoot, 'agent-reference.local.json'),
    '{ "references": { "vault": { "source": "~/notes", "description": "The personal vault" } } }\n',
  );

  const loaded = await loadAgentReferenceConfig(projectRoot);

  assert.equal(
    loaded?.config.git[0]?.description,
    'Docs at https://acme.example/docs, and the config shape is { "zod": "npm:zod@3.25.0", }',
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
    JSON.stringify({
      references: {
        notes: {
          source: './missing',
          description: 'Project notes, read where they live',
        },
        empty: { description: 'nothing here yet', references: {} },
      },
    }),
  );

  const report = await validateConfig(projectRoot);

  assert.equal(report.valid, true);
  assert.equal(report.references.length, 1);
  assert.match(
    report.warnings.join('\n'),
    /references\.notes points at .*missing, which does not exist/,
  );
  assert.match(report.warnings.join('\n'), /Set "empty" has no members/);

  await fs.writeFile(path.join(projectRoot, 'agent-reference.json'), '{ not json');
  const broken = await validateConfig(projectRoot);

  assert.equal(broken.valid, false);
  assert.match(broken.errors.join('\n'), /is not valid JSON/);
});

test('an owner/repo shorthand that is also a folder here is worth saying out loud', async () => {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-reference-shorthand-test-'));
  await fs.mkdir(path.join(projectRoot, 'docs', 'decisions'), { recursive: true });
  await fs.writeFile(
    path.join(projectRoot, 'agent-reference.json'),
    JSON.stringify({
      references: {
        decisions: {
          source: 'docs/decisions',
          description: 'Why this project is shaped the way it is',
        },
        upstream: { source: 'acme/chess-engine', description: 'The engine this fork tracks' },
      },
    }),
  );

  // Parsing stays pure, so it answers the same on every machine; only the disk can tell
  // these apart, and only here.
  const report = await validateConfig(projectRoot);

  assert.match(
    report.warnings.join('\n'),
    /references\.decisions reads as the GitHub repository github:docs\/decisions.*Write "\.\/docs\/decisions"/s,
  );
  assert.doesNotMatch(report.warnings.join('\n'), /references\.upstream reads as/);
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
      references: {
        secret: {
          source: 'file:///opt/checkouts/secret',
          description: 'A checkout that never leaves this machine',
        },
        sibling: {
          source: '../company-ui',
          description: 'The shared component library next door',
        },
        upstream: {
          source: 'github:acme/chess-engine',
          description: 'The engine this fork tracks',
        },
      },
    }),
  );

  const report = await validateConfig(projectRoot);

  assert.equal(report.valid, false);
  assert.match(
    report.errors.join('\n'),
    /references\.secret points at the machine path file:\/\/\/opt\/checkouts\/secret/,
  );
  assert.match(
    report.warnings.join('\n'),
    /references\.sibling escapes the repo \(\.\.\/company-ui\)/,
  );
  // A remote is portable by construction and has no business in either list.
  assert.doesNotMatch([...report.errors, ...report.warnings].join('\n'), /references\.upstream/);
});

test('a windows machine path is a leak wherever validate runs', async () => {
  const projectRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), 'agent-reference-windows-leak-test-'),
  );
  await fs.writeFile(
    path.join(projectRoot, 'agent-reference.json'),
    JSON.stringify({
      references: {
        ui: {
          source: 'C:\\Users\\somebody\\code\\company-ui',
          description: 'The shared component library next door',
        },
        share: {
          source: '\\\\fileserver\\team\\docs',
          description: 'Team documents on the file server',
        },
        vendored: {
          source: 'file://D:/checkouts/vendor',
          description: 'A vendored checkout on this machine',
        },
      },
    }),
  );

  // path.isAbsolute calls all three relative on POSIX, so a path committed from Windows
  // sailed through the Linux CI run that exists to catch exactly this.
  const report = await validateConfig(projectRoot);

  assert.equal(report.valid, false);
  assert.match(report.errors.join('\n'), /references\.ui puts the machine path C:/);
  assert.match(report.errors.join('\n'), /references\.share puts the machine path/);
  assert.match(report.errors.join('\n'), /references\.vendored points at the machine path/);
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
      references: {
        platform: {
          description: 'acme platform surface',
          references: {
            'design-system': {
              source: 'github:acme/monorepo#v2',
              directory: 'packages/design-system',
              description: 'The components the app is built from',
            },
            'api-client': {
              source: 'github:acme/monorepo#v2',
              directory: 'packages/api-client',
              description: 'The generated client the app calls',
            },
          },
        },
      },
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

  // The directory counts as part of the target, so one name cannot cover two subtrees.
  assert.throws(
    () =>
      parseConfig(
        {
          references: {
            monorepo: {
              source: 'github:acme/monorepo#v2',
              directory: 'packages/design-system',
              description: 'The components the app is built from',
            },
            platform: {
              description: 'acme platform surface',
              references: {
                monorepo: {
                  source: 'github:acme/monorepo#v2',
                  directory: 'packages/api-client',
                  description: 'The generated client the app calls',
                },
              },
            },
          },
        },
        'agent-reference.json',
      ),
    /"monorepo" is declared more than once and the two point somewhere different/,
  );
});

test('a package source may carry the ecosystem prefix that get prints back', () => {
  const config = parseConfig(
    {
      references: {
        zod: { source: 'npm:zod@3.22.0', description: 'Schema shapes' },
        react: { source: 'react@18.2.0', description: 'The framework this project is written in' },
      },
    },
    'agent-reference.json',
  );

  const zod = config.packages.find((entry) => entry.name === 'zod');
  // The prefix names the registry, never the name, so every lookup that has only the
  // package name still finds the entry.
  assert.equal(zod?.name, 'zod');
  assert.equal(zod?.ecosystem, 'npm');

  const react = config.packages.find((entry) => entry.name === 'react');
  assert.equal(react?.ecosystem, 'npm');
  assert.equal(react?.version, '18.2.0');
});

test('a package source naming an ecosystem this build cannot resolve fails at parse time', () => {
  assert.throws(
    () =>
      parseConfig(
        {
          references: {
            requests: {
              source: 'pypi:requests@2.32.0',
              description: 'The HTTP client this service calls out with',
            },
          },
        },
        'agent-reference.json',
      ),
    /pypi: coordinates are not supported yet/s,
  );

  // Not a known ecosystem at all, so the fix is a different one: the prefix is the mistake.
  assert.throws(
    () =>
      parseConfig(
        { references: { zod: { source: 'nmp:zod@3.22.0', description: 'Schema shapes' } } },
        'agent-reference.json',
      ),
    /"nmp:" is not an ecosystem/s,
  );
});

test('a package source without an exact version is refused, naming the command that finds one', () => {
  assert.throws(
    () =>
      parseConfig(
        { references: { zod: { source: 'npm:zod', description: 'Schema shapes' } } },
        'agent-reference.json',
      ),
    /names no version.*agent-reference versions <name>/s,
  );
  assert.throws(
    () =>
      parseConfig(
        { references: { zod: { source: 'npm:zod@^3.22.0', description: 'Schema shapes' } } },
        'agent-reference.json',
      ),
    /pins "\^3\.22\.0", which is not an exact version/,
  );
  assert.throws(
    () =>
      parseConfig(
        { references: { zod: { source: 'npm:zod@latest', description: 'Schema shapes' } } },
        'agent-reference.json',
      ),
    /is not an exact version/,
  );

  // A scoped name's leading @ is not a version separator.
  const config = parseConfig(
    {
      references: {
        '@scope/thing': { source: '@scope/thing@1.0.0', description: 'A scoped package' },
      },
    },
    'agent-reference.json',
  );
  assert.equal(config.packages[0]?.name, '@scope/thing');
  assert.equal(config.packages[0]?.version, '1.0.0');
});

test('a package reference is keyed by its package name', () => {
  // It resolves through a registry and is audited against a lockfile, and both key on the
  // package's own name. A handle of your own is what a repository source is for.
  assert.throws(
    () =>
      parseConfig(
        {
          references: { 'zod-pinned': { source: 'npm:zod@3.22.0', description: 'Schema shapes' } },
        },
        'agent-reference.json',
      ),
    /named "zod-pinned" but its source is the package zod.*write "zod": \{ "source": "npm:zod@3\.22\.0"/s,
  );
  assert.doesNotThrow(() =>
    parseConfig(
      { references: { zod: { source: 'npm:zod@3.22.0', description: 'Schema shapes' } } },
      'agent-reference.json',
    ),
  );
});

test('every config the docs show is a config this parser accepts', () => {
  // The site and the README render these, so a sample that does not parse is a copy-paste
  // trap sitting on the front page.
  for (const [name, sample] of Object.entries(samples)) {
    if (sample.lang !== 'jsonc') continue;
    assert.doesNotThrow(() => parseConfig(parseJsonc(sample.code), 'agent-reference.json'), name);
  }
});
