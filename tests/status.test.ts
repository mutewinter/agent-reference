import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { manifestReferencePath } from '../src/git.ts';
import { stateFilePath } from '../src/manifest.ts';
import { shippedSkillDir } from '../src/skill.ts';
import { getStatusReport } from '../src/status.ts';
import type { AgentReferenceManifest, AgentReferenceManifestReference } from '../src/types.ts';

const repoRoot = path.resolve(import.meta.dirname, '..');
const STORE_DIR = '/tmp/agent-reference-status-test-store';
// The skill check reads a machine-wide directory, so every report here is pointed at a home
// that holds no skill. Without it these tests would pass or fail on whether the machine
// running them happens to have a current skill installed.
const HOME_DIR = '/tmp/agent-reference-status-test-home';

test('reports never-materialized dependencies as declared, not as a problem', async () => {
  const projectRoot = await copyFixtureProject();
  const report = await getStatusReport(path.join(projectRoot, 'package.json'), {
    storeDir: STORE_DIR,
    home: HOME_DIR,
  });

  assert.equal(report.references.length, 1);
  assert.equal(report.references[0]?.kind, 'package');
  assert.equal(report.references[0]?.name, 'tiny-invariant');
  assert.equal(report.references[0]?.currentVersion, '1.3.3');
  assert.equal(report.references[0]?.status, 'declared');
  assert.match(report.references[0]?.action ?? '', /agent-reference get tiny-invariant/);
  assert.equal(report.problems.length, 0);
  assert.deepEqual(report.nextSteps, []);
});

test('reports ready dependencies with store worktree paths', async () => {
  const projectRoot = await copyFixtureProject();
  await useConfig(projectRoot);
  const [reference] = await writeManifest(projectRoot, '1.3.3');
  assert.ok(reference, 'writeManifest wrote no references');
  const worktreePath = manifestReferencePath(STORE_DIR, reference);
  await fs.mkdir(worktreePath, { recursive: true });

  const report = await getStatusReport(path.join(projectRoot, 'package.json'), {
    storeDir: STORE_DIR,
    home: HOME_DIR,
  });

  assert.equal(report.references[0]?.status, 'ready');
  assert.equal(report.references[0]?.path, worktreePath);
  assert.equal(report.references[0]?.checkoutSha, 'abc123');
});

test('reports stale dependencies when cloned version differs from lockfile', async () => {
  const projectRoot = await copyFixtureProject();
  await useConfig(projectRoot);
  await writeManifest(projectRoot, '1.2.0');

  const report = await getStatusReport(path.join(projectRoot, 'package.json'), {
    storeDir: STORE_DIR,
    home: HOME_DIR,
  });

  assert.equal(report.references[0]?.status, 'stale');
  assert.equal(report.references[0]?.currentVersion, '1.3.3');
  assert.equal(report.references[0]?.clonedVersion, '1.2.0');
});

test('reports config-only packages as configured references', async () => {
  const projectRoot = await copyFixtureProject();
  await fs.writeFile(
    path.join(projectRoot, 'agent-reference.json'),
    JSON.stringify(
      {
        references: {
          'tiny-warning': {
            source: 'npm:tiny-warning@1.0.3',
            description: 'The dependency this project pins',
          },
        },
      },
      null,
      2,
    ),
  );

  const report = await getStatusReport(path.join(projectRoot, 'package.json'), {
    storeDir: STORE_DIR,
    home: HOME_DIR,
  });

  assert.equal(report.references.length, 1);
  assert.equal(report.references[0]?.kind, 'package');
  assert.equal(report.references[0]?.name, 'tiny-warning');
  // The project's own package manager, not the word `config`: where the version came from
  // is a separate field.
  assert.equal(report.references[0]?.packageManager, 'pnpm');
  assert.equal(report.references[0]?.ecosystem, 'npm');
  assert.equal(report.references[0]?.currentVersion, '1.0.3');
  assert.equal(report.references[0]?.status, 'declared');
});

test('a path reference may name a file, and status reports which it found', async () => {
  const projectRoot = await copyFixtureProject();
  await fs.mkdir(path.join(projectRoot, 'references'), { recursive: true });
  const notePath = path.join(projectRoot, 'references', 'release-checklist.md');
  await fs.writeFile(notePath, '# Release checklist\n');
  await fs.writeFile(
    path.join(projectRoot, 'agent-reference.json'),
    JSON.stringify(
      {
        references: {
          checklist: {
            source: './references/release-checklist.md',
            description: 'The steps a release goes through',
          },
          notes: {
            source: './references',
            description: 'Project notes, read where they live',
          },
          gone: {
            source: './references/missing.md',
            description: 'A source that is not there',
          },
        },
      },
      null,
      2,
    ),
  );

  const report = await getStatusReport(path.join(projectRoot, 'package.json'), {
    storeDir: STORE_DIR,
    home: HOME_DIR,
  });
  const byName = new Map(report.references.map((entry) => [entry.name, entry]));

  assert.equal(byName.get('checklist')?.status, 'ready');
  assert.equal(byName.get('checklist')?.pathType, 'file');
  assert.equal(byName.get('checklist')?.path, notePath);
  assert.equal(byName.get('notes')?.pathType, 'folder');
  // Nothing is on disk, so there is no shape to report.
  assert.equal(byName.get('gone')?.status, 'missing');
  assert.equal(byName.get('gone')?.pathType, null);
});

test('reports local folder references with absolute paths', async () => {
  const projectRoot = await copyFixtureProject();
  const folderPath = path.join(projectRoot, 'references', 'design-notes');
  await fs.mkdir(folderPath, { recursive: true });
  await fs.writeFile(path.join(projectRoot, 'agent-reference.json'), '{}\n');
  await fs.writeFile(
    path.join(projectRoot, 'agent-reference.local.json'),
    JSON.stringify(
      {
        references: {
          'design-notes': {
            source: './references/design-notes',
            description: 'Where the current design came from',
          },
        },
      },
      null,
      2,
    ),
  );

  const report = await getStatusReport(path.join(projectRoot, 'package.json'), {
    storeDir: STORE_DIR,
    home: HOME_DIR,
  });

  assert.equal(report.references.length, 1);
  assert.equal(report.references[0]?.kind, 'path');
  assert.equal(report.references[0]?.name, 'design-notes');
  assert.equal(report.references[0]?.status, 'ready');
  assert.equal(report.references[0]?.scope, 'local');
  assert.equal(report.references[0]?.path, folderPath);
});

test('reports stale git references when configured spec changes', async () => {
  const projectRoot = await copyFixtureProject();
  await fs.writeFile(
    path.join(projectRoot, 'agent-reference.json'),
    JSON.stringify(
      {
        references: {
          tooling: {
            source: 'github:example/tooling#main',
            description: 'The build tooling this project clones',
          },
        },
      },
      null,
      2,
    ),
  );
  const gitReference: AgentReferenceManifestReference = {
    kind: 'git',
    name: 'tooling',
    requested: 'github:example/tooling#old',
    repositoryUrl: 'https://github.com/example/tooling.git',
    checkoutRef: 'old',
    checkoutSha: 'abc123',
    refSource: 'configured',
  };
  await writeManifest(projectRoot, '1.3.3', [gitReference]);

  const report = await getStatusReport(path.join(projectRoot, 'package.json'), {
    storeDir: STORE_DIR,
    home: HOME_DIR,
  });

  assert.equal(report.references.length, 1);
  assert.equal(report.references[0]?.kind, 'git');
  assert.equal(report.references[0]?.name, 'tooling');
  assert.equal(report.references[0]?.status, 'stale');
  assert.equal(report.references[0]?.path, manifestReferencePath(STORE_DIR, gitReference));
});

test('works in a directory with no package.json or lockfile at all', async () => {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-reference-no-node-test-'));
  const folderPath = path.join(projectRoot, 'notes');
  await fs.mkdir(folderPath, { recursive: true });
  await fs.writeFile(
    path.join(projectRoot, 'agent-reference.json'),
    JSON.stringify(
      {
        references: {
          notes: { source: './notes', description: 'Project notes, read where they live' },
          tooling: {
            source: 'github:example/tooling',
            description: 'The build tooling this project clones',
          },
        },
      },
      null,
      2,
    ),
  );

  const report = await getStatusReport(projectRoot, { storeDir: STORE_DIR, home: HOME_DIR });

  assert.deepEqual(
    report.references.map((entry) => [entry.name, entry.status]),
    [
      ['notes', 'ready'],
      ['tooling', 'declared'],
    ],
  );
  assert.equal(report.problems.length, 0);
});

test('an empty directory reports no references instead of erroring', async () => {
  const emptyDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-reference-empty-test-'));
  const report = await getStatusReport(emptyDir, { storeDir: STORE_DIR, home: HOME_DIR });
  assert.deepEqual(report.references, []);
});

test('finds the nearest config walking up from a subdirectory', async () => {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-reference-walk-up-test-'));
  await fs.mkdir(path.join(projectRoot, 'deep', 'inside'), { recursive: true });
  await fs.writeFile(
    path.join(projectRoot, 'agent-reference.json'),
    JSON.stringify(
      {
        references: {
          tooling: {
            source: 'github:example/tooling',
            description: 'The build tooling this project clones',
          },
        },
      },
      null,
      2,
    ),
  );

  const report = await getStatusReport(path.join(projectRoot, 'deep', 'inside'), {
    storeDir: STORE_DIR,
    home: HOME_DIR,
  });

  assert.equal(report.projectRoot, projectRoot);
  assert.equal(report.references[0]?.name, 'tooling');
});

test("a selector that is nobody's reference offers the reading that it was a command", async () => {
  const projectRoot = await copyFixtureProject();
  await useConfig(projectRoot);

  // Standing in for whatever the next release adds. A command a newer instruction names is
  // not rejected by an older build: it falls through to the default command and is read as
  // a reference name, so without this the failure blames the config.
  await assert.rejects(
    getStatusReport(projectRoot, { references: ['explain'], storeDir: STORE_DIR, home: HOME_DIR }),
    (error: Error) => {
      assert.match(error.message, /Nothing matched reference "explain"/);
      assert.match(error.message, /it has get, versions, status/);
      assert.match(error.message, /newer than the CLI/);
      return true;
    },
  );
});

test('one name hitting does not excuse the one beside it that missed', async () => {
  const projectRoot = await copyFixtureProject();
  await useConfig(projectRoot);

  // A run naming several references used to succeed as long as any one of them hit, so a
  // typo was dropped in silence and the reference it meant was quietly never reported.
  await assert.rejects(
    getStatusReport(projectRoot, {
      references: ['tiny-invariant', 'tiny-invarient'],
      storeDir: STORE_DIR,
      home: HOME_DIR,
    }),
    (error: Error) => {
      assert.match(error.message, /Nothing matched reference "tiny-invarient"/);
      assert.doesNotMatch(error.message, /reference "tiny-invariant"/);
      return true;
    },
  );
});

test('a miss on a name this build does have as a command reads as an ordinary miss', async () => {
  const projectRoot = await copyFixtureProject();
  await useConfig(projectRoot);

  // `guide` exists here, so nothing about this build is out of date and the hint would be
  // a false lead. It fires on the absence of the command, not on the shape of the word.
  await assert.rejects(
    getStatusReport(projectRoot, { references: ['guide'], storeDir: STORE_DIR, home: HOME_DIR }),
    (error: Error) => {
      assert.doesNotMatch(error.message, /newer than the CLI/);
      return true;
    },
  );
});

test('a machine path in the committed config is a warning here, not a blocked reference', async () => {
  const projectRoot = await copyFixtureProject();
  await fs.writeFile(
    path.join(projectRoot, 'agent-reference.json'),
    JSON.stringify({
      references: {
        notes: { source: '~/notes', description: 'Project notes, read where they live' },
        internal: {
          source: 'file:///opt/checkouts/internal',
          description: 'The internal checkout next door',
        },
      },
    }),
  );

  const report = await getStatusReport(path.join(projectRoot, 'package.json'), {
    storeDir: STORE_DIR,
    home: HOME_DIR,
  });

  assert.deepEqual(
    report.problems.map((problem) => [problem.reference, problem.severity]),
    [
      ['path:notes', 'warning'],
      ['git:internal', 'warning'],
    ],
  );
  assert.match(report.problems[0]?.fix ?? '', /Move this entry to agent-reference\.local\.json/);
  // Nothing here is unusable, so status must not tell the agent to stop and resolve errors.
  assert.deepEqual(report.nextSteps, []);
});

test('a drift patch edits the entry that is there, as a whole coordinate', async () => {
  const projectRoot = await copyFixtureProject();
  await fs.writeFile(
    path.join(projectRoot, 'agent-reference.json'),
    JSON.stringify(
      {
        references: {
          'tiny-invariant': {
            source: 'npm:tiny-invariant@1.0.0',
            description: 'The invariant helper this project throws with',
          },
        },
      },
      null,
      2,
    ),
  );

  const report = await getStatusReport(path.join(projectRoot, 'package.json'), {
    storeDir: STORE_DIR,
    home: HOME_DIR,
  });

  assert.equal(report.references[0]?.name, 'tiny-invariant');
  const drift = report.problems.find((problem) => problem.summary.includes('is pinned to 1.0.0'));
  // The version lives in the source, so the patch replaces the whole coordinate rather than
  // a separate version field that could disagree with it.
  // The object form, so a shallow merge leaves a ref, a directory and the description
  // that explains the pin where they are.
  assert.deepEqual(drift?.configPatch, {
    references: {
      'tiny-invariant': {
        source: 'npm:tiny-invariant@1.3.3',
        description: 'The invariant helper this project throws with',
      },
    },
  });
  assert.match(drift?.fix ?? '', /references\.tiny-invariant/);
});

test('the report names the lockfile package versions were read from', async () => {
  const projectRoot = await copyFixtureProject();
  const report = await getStatusReport(path.join(projectRoot, 'package.json'), {
    storeDir: STORE_DIR,
    home: HOME_DIR,
  });

  assert.equal(path.basename(report.lockfilePath ?? ''), 'pnpm-lock.yaml');
  assert.equal(report.packageManager, 'pnpm');
});

// The config is one map, so `status` reads it back in the order it was written. Three passes
// over three kind-partitioned arrays reported a file grouped by something nobody chose, and
// put every package first however far down the file it sat.
test('references are reported in the order the config declares them', async () => {
  const projectRoot = await copyFixtureProject();
  await fs.writeFile(
    path.join(projectRoot, 'agent-reference.json'),
    JSON.stringify({
      references: {
        decisions: { source: './docs', description: 'Why this is shaped the way it is' },
        'tiny-invariant': {
          source: 'npm:tiny-invariant@1.3.3',
          description: 'The invariant helper this project throws with',
        },
        pi: { source: 'github:acme/pi', description: 'A terminal coding agent' },
      },
    }),
  );

  const report = await getStatusReport(projectRoot, { storeDir: STORE_DIR, home: HOME_DIR });

  assert.deepEqual(
    report.references.map((entry) => entry.name),
    ['decisions', 'tiny-invariant', 'pi'],
  );
});

// One name means one thing, so a selector is a name and the kind never enters into it.
test('a selector names one reference whatever kind it turns out to be', async () => {
  const projectRoot = await copyFixtureProject();
  await fs.writeFile(
    path.join(projectRoot, 'agent-reference.json'),
    JSON.stringify({
      references: {
        decisions: { source: './docs', description: 'Why this is shaped the way it is' },
        pi: { source: 'github:acme/pi', description: 'A terminal coding agent' },
      },
    }),
  );

  const report = await getStatusReport(projectRoot, {
    storeDir: STORE_DIR,
    home: HOME_DIR,
    references: ['pi'],
  });
  assert.deepEqual(
    report.references.map((entry) => entry.name),
    ['pi'],
  );

  await assert.rejects(
    getStatusReport(projectRoot, { storeDir: STORE_DIR, home: HOME_DIR, references: ['pie'] }),
    /Nothing matched reference "pie"/,
  );
});

async function copyFixtureProject(): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-reference-status-test-'));
  await fs.cp(path.join(repoRoot, 'fixtures/pnpm-basic'), tempDir, { recursive: true });
  return tempDir;
}

async function useConfig(projectRoot: string): Promise<void> {
  await fs.writeFile(
    path.join(projectRoot, 'agent-reference.json'),
    JSON.stringify(
      {
        references: {
          'tiny-invariant': {
            source: 'npm:tiny-invariant@1.3.3',
            description: 'The invariant helper this project throws with',
          },
        },
      },
      null,
      2,
    ),
  );
}

async function writeManifest(
  projectRoot: string,
  version: string,
  extraReferences: AgentReferenceManifest['references'] = [],
): Promise<AgentReferenceManifest['references']> {
  const manifest: AgentReferenceManifest = {
    schemaVersion: 6,
    projectRoot,
    references: [
      {
        kind: 'package',
        name: 'tiny-invariant',
        version,
        packageManager: 'pnpm',
        repositoryUrl: 'https://github.com/alexreardon/tiny-invariant.git',
        repositoryDirectory: null,
        gitHead: 'abc123',
        checkoutRef: 'abc123',
        checkoutSha: 'abc123',
        refSource: 'gitHead',
        confidence: 'verified',
        pinnedRef: null,
      },
      ...extraReferences,
    ],
  };

  const statePath = stateFilePath(STORE_DIR, projectRoot);
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  await fs.writeFile(statePath, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest.references;
}

test('a skill copy that no longer matches this version is reported where status is read', async () => {
  // The skill is copied into a project once and nothing updates it, so an upgrade that
  // reworded the guidance leaves the copy asserting the old wording. status is the command
  // that runs often enough to notice, and its reader is the agent that copy instructs.
  const projectRoot = await copyFixtureProject();
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-reference-skill-home-'));
  const installed = path.join(home, '.claude', 'skills', 'agent-reference');
  await fs.mkdir(installed, { recursive: true });
  await fs.writeFile(path.join(installed, 'SKILL.md'), 'an older wording\n');

  const stale = await getStatusReport(path.join(projectRoot, 'package.json'), {
    storeDir: STORE_DIR,
    home,
  });
  const drift = stale.problems.find((problem) => /skill at/.test(problem.summary));
  assert.ok(drift, 'a stale skill copy should be reported');
  assert.equal(drift.severity, 'warning');
  assert.equal(drift.about, 'project');
  assert.match(drift.summary, /is not the one this version ships/);
  assert.match(drift.fix, /SKILL\.md/);

  // And says nothing once the copy matches, because a warning that never clears is noise.
  await fs.copyFile(path.join(shippedSkillDir(), 'SKILL.md'), path.join(installed, 'SKILL.md'));
  const current = await getStatusReport(path.join(projectRoot, 'package.json'), {
    storeDir: STORE_DIR,
    home,
  });
  assert.equal(current.problems.filter((problem) => /skill at/.test(problem.summary)).length, 0);

  await fs.rm(home, { recursive: true, force: true });
});
