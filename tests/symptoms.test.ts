import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { getSymptomsReport } from '../src/symptoms.ts';

/**
 * Every fixture here is a home directory with transcripts in it, so nothing
 * touches the machine running the tests: the scanner takes the home to look
 * under, which is the only reason it takes one at all.
 */
async function makeHome(files: Record<string, string>): Promise<string> {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-reference-symptoms-'));
  for (const [relative, contents] of Object.entries(files)) {
    const target = path.join(home, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, contents);
  }
  return home;
}

/** One Claude Code event, the way the harness writes it. */
const claudeCall = (name: string, input: Record<string, unknown>) =>
  `${JSON.stringify({
    type: 'assistant',
    message: { role: 'assistant', content: [{ type: 'tool_use', name, input }] },
  })}\n`;

const claudeResult = (text: string) =>
  `${JSON.stringify({
    type: 'user',
    message: { role: 'user', content: [{ type: 'tool_result', content: text }] },
  })}\n`;

test('every symptom is counted once per session, whichever store it came from', async (t) => {
  const home = await makeHome({
    '.claude/projects/app/one.jsonl':
      claudeCall('Edit', { file_path: '/code/app/src/List.tsx' }) +
      claudeResult("error TS2305: Module '\"x\"' has no exported member 'useVirtual'.") +
      claudeCall('Read', { file_path: '/code/app/node_modules/interactjs/dist/interact.min.js' }) +
      claudeCall('WebFetch', { url: 'https://effect.website/docs' }),
    // A second session showing one of them twice still counts once.
    '.claude/projects/app/two.jsonl':
      claudeCall('WebSearch', { query: 'effect filesystem' }) +
      claudeCall('WebFetch', { url: 'https://effect.website/docs/platform' }),
    '.claude/projects/app/clean.jsonl': claudeCall('Read', { file_path: '/code/app/src/main.ts' }),
    '.codex/sessions/2026/09/rollout-one.jsonl':
      `${JSON.stringify({
        type: 'response_item',
        payload: {
          type: 'function_call',
          name: 'shell',
          arguments: JSON.stringify({
            command: ['bash', '-lc', 'cat node_modules/zod/dist/index.js'],
          }),
        },
      })}\n` +
      `${JSON.stringify({
        type: 'response_item',
        payload: {
          type: 'function_call',
          name: 'shell',
          arguments: JSON.stringify({
            command: ['bash', '-lc', 'git clone --depth 1 https://github.com/x/y /tmp/y'],
          }),
        },
      })}\n`,
    // Two parts of one opencode session are one session, not two.
    '.local/share/opencode/storage/part/msg_1/prt_1.json': JSON.stringify(
      { sessionID: 'ses_1', type: 'tool', tool: 'webfetch', state: { status: 'completed' } },
      null,
      2,
    ),
    '.local/share/opencode/storage/part/msg_1/prt_2.json': JSON.stringify(
      { sessionID: 'ses_1', type: 'text', text: 'nothing to see' },
      null,
      2,
    ),
  });
  t.after(() => fs.rm(home, { recursive: true, force: true }));

  const report = await getSymptomsReport({ home });

  const claude = report.harnesses.find((entry) => entry.agent === 'claude-code');
  assert.equal(claude?.sessions, 3);
  assert.deepEqual(claude?.counts, { guessed: 1, web: 2, build: 1, clone: 0 });
  assert.equal(claude?.affected, 2, 'the clean session is not one of them');

  const codex = report.harnesses.find((entry) => entry.agent === 'codex');
  assert.deepEqual(codex?.counts, { guessed: 0, web: 0, build: 1, clone: 1 });

  const opencode = report.harnesses.find((entry) => entry.agent === 'opencode');
  assert.equal(opencode?.sessions, 1, 'parts of one session are one session');
  assert.equal(opencode?.counts.web, 1);

  assert.equal(report.sessions, 5);
  assert.equal(report.counts.web, 3);
  assert.equal(report.affected, 4);
});

test('each count carries the newest line it came out of', async (t) => {
  const home = await makeHome({
    '.claude/projects/app/older.jsonl': claudeCall('Read', {
      file_path: '/code/app/node_modules/left-pad/dist/index.js',
    }),
    '.claude/projects/app/newer.jsonl': claudeCall('Read', {
      file_path: '/code/app/node_modules/zod/dist/index.d.ts',
    }),
    // A session that wrote a page about the failure, rather than one that had
    // it. The count stands; the line under it comes from somewhere readable.
    '.claude/projects/app/markup.jsonl': claudeResult(
      'the site says <code>error TS2305: has no exported member</code> here',
    ),
  });
  t.after(() => fs.rm(home, { recursive: true, force: true }));

  const older = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
  await fs.utimes(path.join(home, '.claude/projects/app/older.jsonl'), older, older);

  const report = await getSymptomsReport({ home });

  assert.equal(
    report.evidence.build?.text,
    'Read(/code/app/node_modules/zod/dist/index.d.ts)',
    'the newest session is the one quoted, named the way the harness named the tool',
  );
  assert.equal(report.counts.guessed, 1, 'the markup session still counts');
  assert.equal(report.evidence.guessed, undefined, 'and is not what gets quoted');
});

test('a path an agent only talked about is not a path it opened', async (t) => {
  const home = await makeHome({
    '.claude/projects/app/talk.jsonl':
      `${JSON.stringify({
        type: 'user',
        message: {
          role: 'user',
          content: 'do not read node_modules/effect/dist/FileSystem.js, read the source',
        },
      })}\n` + claudeResult('ls node_modules/effect/dist/FileSystem.js'),
  });
  t.after(() => fs.rm(home, { recursive: true, force: true }));

  const report = await getSymptomsReport({ home });
  assert.equal(report.counts.build, 0);
  assert.equal(report.affected, 0);
});

test('a window drops the sessions outside it', async (t) => {
  const home = await makeHome({
    '.claude/projects/app/old.jsonl': claudeCall('WebSearch', { query: 'anything' }),
    '.claude/projects/app/new.jsonl': claudeCall('WebSearch', { query: 'anything' }),
  });
  t.after(() => fs.rm(home, { recursive: true, force: true }));

  const old = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  await fs.utimes(path.join(home, '.claude/projects/app/old.jsonl'), old, old);

  const all = await getSymptomsReport({ home });
  assert.equal(all.sessions, 2);

  const recent = await getSymptomsReport({ home, days: 30 });
  assert.equal(recent.sessions, 1);
  assert.equal(recent.counts.web, 1);
});

test('a machine with no transcripts says where it looked', async (t) => {
  const home = await makeHome({ 'notes.md': 'no agents here\n' });
  t.after(() => fs.rm(home, { recursive: true, force: true }));

  const report = await getSymptomsReport({ home });
  assert.deepEqual(report.harnesses, []);
  assert.equal(report.missing.length, 3, 'every store it knows about is named');
  assert.ok(report.missing.every((target) => target.startsWith(home)));
  assert.equal(report.sessions, 0);
});
