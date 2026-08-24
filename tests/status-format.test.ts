import assert from 'node:assert/strict';
import test from 'node:test';

import { formatStatusReport } from '../src/status-format.ts';
import type { AgentReferenceStatusEntry, AgentReferenceStatusReport } from '../src/types.ts';

const PLAIN = { color: false, tilde: false } as const;

test('renders scope sections with sets as labeled-list subsections', () => {
  const output = formatStatusReport(
    report(
      [
        entry({ kind: 'git', name: 'chess-engine', scope: 'shared', status: 'declared', requested: 'github:acme/chess-engine', sets: ['engines'] }),
        entry({
          kind: 'path',
          name: 'design-notes',
          scope: 'local',
          status: 'ready',
          path: '/refs/design-notes',
          pathType: 'folder',
          description: 'Sketches and early notes'
        })
      ],
      { sets: [{ name: 'engines', description: 'Engines we study upstream', references: ['git:chess-engine'] }] }
    ),
    PLAIN
  );

  assert.match(output, /agent-reference\.json \(shared\)\n  Engines we study upstream\n    chess-engine {2,}git · declared · github:acme\/chess-engine/);
  assert.match(output, /agent-reference\.local\.json \(this machine\)\n  design-notes {2,}folder · ready · \/refs\/design-notes/);
  assert.match(output, /"Sketches and early notes"/);
  assert.doesNotMatch(output, / - /);
  // Counted against the whole list: one of the two references here has not been fetched.
  assert.match(output, /1 of 2 not fetched yet, which is normal · agent-reference get <name>/);
});

test('a path reference reads as what it turned out to be on disk', () => {
  const output = formatStatusReport(
    report([
      entry({ kind: 'path', name: 'notes', scope: 'local', status: 'ready', path: '/vault/notes.md', pathType: 'file' }),
      entry({ kind: 'path', name: 'vault', scope: 'local', status: 'ready', path: '/vault', pathType: 'folder' }),
      // Nothing is there, so there is no shape to report and the kind stands in.
      entry({ kind: 'path', name: 'gone', scope: 'local', status: 'missing', path: '/vault/gone.md' })
    ]),
    PLAIN
  );

  assert.match(output, /notes {2,}file · ready · \/vault\/notes\.md/);
  assert.match(output, /vault {2,}folder · ready · \/vault/);
  assert.match(output, /gone {2,}path · missing · \/vault\/gone\.md/);
});

test('package lines carry version, confidence, and staleness inline', () => {
  const output = formatStatusReport(
    report([
      entry({
        kind: 'package',
        name: 'zod',
        scope: 'shared',
        status: 'ready',
        currentVersion: '3.25.76',
        confidence: 'verified',
        path: '/store/src/zod/9f0c9d1'
      }),
      entry({
        kind: 'package',
        name: 'electron-builder',
        scope: 'shared',
        status: 'stale',
        currentVersion: '26.15.7',
        clonedVersion: '26.14.0'
      })
    ]),
    PLAIN
  );

  assert.match(output, /zod .*package · ready · 3\.25\.76 verified · \/store\/src\/zod\/9f0c9d1/);
  assert.match(output, /electron-builder {2,}package · stale · lockfile 26\.15\.7, checkout 26\.14\.0 · agent-reference get electron-builder/);
});

test('an empty report is an initialization hint, and color stays off when disabled', () => {
  const output = formatStatusReport(report([], { installedPackageCount: 214 }), PLAIN);

  assert.match(output, /No references configured here\./);
  assert.match(output, /get <spec> materializes readable source on demand/);
  assert.match(output, /lockfile holds 214 dependencies/);
  assert.match(output, /agent-reference\.local\.json \(machine paths, gitignored\)/);
  assert.doesNotMatch(output, /\[/);
});

test('color paints statuses only when enabled', () => {
  const colored = formatStatusReport(
    report([entry({ kind: 'path', name: 'notes', scope: 'shared', status: 'ready', path: '/notes' })]),
    { color: true, tilde: false }
  );
  assert.match(colored, /\[32mready\[0m/);
});

function report(
  references: AgentReferenceStatusEntry[],
  overrides: Partial<AgentReferenceStatusReport> = {}
): AgentReferenceStatusReport {
  const summary = { ready: 0, declared: 0, stale: 0, missing: 0, 'not-installed': 0, unresolvable: 0 };
  for (const reference of references) summary[reference.status] += 1;

  return {
    generatedAt: new Date().toISOString(),
    projectRoot: '/project',
    configPath: '/project/agent-reference.json',
    localConfigPath: '/project/agent-reference.local.json',
    manifestPath: null,
    installedPackageCount: 0,
    sets: [],
    references,
    problems: [],
    nextSteps: [],
    summary,
    ...overrides
  };
}

function entry(input: Partial<AgentReferenceStatusEntry> & Pick<AgentReferenceStatusEntry, 'kind' | 'name' | 'status'>): AgentReferenceStatusEntry {
  return {
    description: null,
    scope: null,
    sets: [],
    requested: null,
    packageManager: null,
    currentVersion: null,
    clonedVersion: null,
    path: null,
    repositoryPath: null,
    repositoryUrl: null,
    checkoutSha: null,
    confidence: null,
    status: input.status,
    action: '',
    ...input
  };
}
