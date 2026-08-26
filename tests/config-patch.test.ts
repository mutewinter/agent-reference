import assert from 'node:assert/strict';
import test from 'node:test';

import { parseConfig } from '../src/config.ts';
import { gitDirectoryProblem } from '../src/get.ts';
import { missingDirectoryProblem, unresolvedProblem, pinFix } from '../src/problems.ts';
import { getStatusReport } from '../src/status.ts';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type {
  AgentReferenceProblem,
  ConfiguredGitReference,
  GitReferenceWorktreeResult,
  UnresolvedManifestReference,
  UnresolvedReason,
} from '../src/types.ts';

/**
 * Every problem carries the JSON to fix it, printed under `add to
 * agent-reference.json`, so an agent pastes it in without reading this source.
 * A patch that the parser then refuses turns a report into a broken config, and
 * asserting on a substring of the stringified patch is how one survived the
 * migration: the shape changed, the substring did not.
 *
 * This is the gate for the shape rather than for any one producer. Anything that
 * sets `configPatch` has to appear here.
 */
function assertPatchParses(problem: AgentReferenceProblem | null, label: string): void {
  assert.ok(problem, `${label}: expected a problem`);
  assert.ok(problem.configPatch, `${label}: expected a config patch`);
  assert.doesNotThrow(
    () => parseConfig(problem.configPatch, 'agent-reference.json'),
    `${label}: the patch does not parse`,
  );
}

test('every unresolved reason emits a patch the parser accepts', () => {
  const reasons: UnresolvedReason[] = [
    'no-repository',
    'registry-error',
    'unresolved-ref',
    'clone-failed',
    'rejected',
  ];

  for (const reason of reasons) {
    const failure: UnresolvedManifestReference = {
      kind: 'package',
      name: 'oddtags',
      version: '9.9.9',
      reason,
      detail: 'detail',
      repositoryUrl: 'https://github.com/acme/oddtags.git',
      pinnedRef: null,
      repository: null,
    };
    assertPatchParses(
      unresolvedProblem(failure, '/store', 'agent-reference.json'),
      `unresolved ${reason}`,
    );
  }
});

test('a missing subtree emits a patch the parser accepts', () => {
  assertPatchParses(
    missingDirectoryProblem(
      'design-system',
      'github:acme/monorepo#v2',
      'packages/design-system',
      'v2',
      '/store/src/github.com/acme/monorepo/abc123def456',
      'agent-reference.json',
    ),
    'missing directory',
  );

  const reference = {
    kind: 'git',
    name: 'design-system',
    scope: 'shared',
    repository: 'github:acme/monorepo',
    ref: 'v2',
    spec: 'github:acme/monorepo#v2',
    directory: 'packages/design-system',
    description: 'The components the app is built from',
    sets: [],
  } satisfies ConfiguredGitReference;
  const result = {
    directory: 'packages/design-system',
    directoryMissing: true,
    worktreePath: '/store/src/github.com/acme/monorepo/abc123def456',
    checkoutRef: 'v2',
  } as unknown as GitReferenceWorktreeResult;

  assertPatchParses(gitDirectoryProblem(reference, result), 'git directory problem');
});

test('a drift patch keeps the entry it is telling you to annotate', async () => {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-reference-drift-patch-'));
  await fs.cp(path.join(import.meta.dirname, '..', 'fixtures', 'pnpm-basic'), projectRoot, {
    recursive: true,
  });
  // An entry with everything a real pin carries, which is what a bare-string
  // patch quietly deletes.
  await fs.writeFile(
    path.join(projectRoot, 'agent-reference.json'),
    JSON.stringify({
      references: {
        'tiny-invariant': {
          source: 'npm:tiny-invariant@1.0.0',
          ref: 'v1.0.0',
          repository: 'github:acme/tiny-invariant',
          description: 'Pinned by hand: the tag scheme is not guessable.',
        },
      },
    }),
  );

  const report = await getStatusReport(projectRoot, { storeDir: path.join(projectRoot, 'store') });
  const drift = report.problems.find((problem) => problem.summary.includes('is pinned to 1.0.0'));

  assertPatchParses(drift ?? null, 'drift');
  // The object form is what survives a shallow merge, and the description rides along
  // as the one it already has, so pasting the patch cannot overwrite the sentence the
  // fix beside it tells you to edit.
  assert.deepEqual(drift?.configPatch, {
    references: {
      'tiny-invariant': {
        source: 'npm:tiny-invariant@1.3.3',
        description: 'Pinned by hand: the tag scheme is not guessable.',
      },
    },
  });
});

test('the pin fix names a key the config actually has', () => {
  const fix = pinFix(
    'zod',
    '3.22.0',
    'https://github.com/colinhacks/zod.git',
    '/store',
    'agent-reference.json',
  );
  assert.match(fix, /references\.zod\.ref/);
  assert.doesNotMatch(fix, /packages\./);
});
