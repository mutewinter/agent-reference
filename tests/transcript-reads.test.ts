import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { getActivityReport } from '../src/activity.ts';
import { formatActivityReport } from '../src/activity-format.ts';
import { getTranscriptReads, type TranscriptReads } from '../src/transcript-reads.ts';

/**
 * A machine in a temp directory: a home with transcripts in it, a store with one checkout, and
 * a project that declares a sibling folder as a reference. Nothing here reads the real home or
 * the real store; both are passed in.
 */
async function makeMachine(t: test.TestContext) {
  const root = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), 'agent-reference-reads-')),
  );
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const home = path.join(root, 'home');
  const store = path.join(root, 'store');
  const project = path.join(root, 'code', 'chess-engine');
  const sibling = path.join(root, 'code', 'company-ui');
  const checkout = path.join(store, 'src', 'github.com', 'acme', 'parser', 'abc123def456');

  await fs.mkdir(checkout, { recursive: true });
  await fs.mkdir(sibling, { recursive: true });
  await fs.mkdir(project, { recursive: true });
  await fs.writeFile(
    path.join(project, 'agent-reference.json'),
    JSON.stringify({
      references: {
        'company-ui': { source: '../company-ui', description: 'The design system' },
      },
    }),
  );

  const write = async (relative: string, contents: string) => {
    const target = path.join(home, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, contents);
  };

  return { home, store, project, sibling, checkout, write };
}

const TIME = '2026-09-20T12:00:00.000Z';

/** One Claude Code tool call and its result, the way the harness writes them. */
function claude(
  session: string,
  cwd: string,
  id: string,
  name: string,
  input: Record<string, unknown>,
  output: string,
  timestamp = TIME,
): string {
  const call = {
    type: 'assistant',
    sessionId: session,
    cwd,
    timestamp,
    message: { role: 'assistant', content: [{ type: 'tool_use', id, name, input }] },
  };
  const result = {
    type: 'user',
    sessionId: session,
    cwd,
    timestamp,
    message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: output }] },
  };
  return `${JSON.stringify(call)}\n${JSON.stringify(result)}\n`;
}

test('reads, searches and history in a checkout and a declared folder are counted with their size', async (t) => {
  const machine = await makeMachine(t);
  const { project, checkout, sibling } = machine;

  await machine.write(
    '.claude/projects/chess-engine/s1.jsonl',
    claude(
      's1',
      project,
      'a',
      'Read',
      { file_path: `${checkout}/src/index.ts` },
      'one\ntwo\nthree',
    ) +
      claude(
        's1',
        project,
        'b',
        'Bash',
        { command: `R=${checkout}; rg -n parse "$R/src"` },
        'src/index.ts:1:parse\nsrc/lexer.ts:9:parse',
      ) +
      claude(
        's1',
        project,
        'c',
        'Bash',
        { command: `cd ${checkout} && git log --oneline -3` },
        'x\ny\nz',
      ) +
      claude(
        's1',
        project,
        'd',
        'Bash',
        { command: `cd ${sibling} && sed -n '1,40p' src/Button.tsx` },
        'export function Button() {}',
      ),
  );

  const reads = await getTranscriptReads({ home: machine.home, storeDir: machine.store, env: {} });

  assert.equal(reads.sessionsUsing, 1);
  assert.equal(reads.reads, 2, 'the Read tool and the sed in the sibling');
  assert.equal(reads.searches, 1);
  assert.equal(reads.history, 1);
  assert.equal(reads.lines, 3 + 2 + 3 + 1, 'every line each result handed back');
  assert.equal(reads.filesOpened, 2, 'index.ts in the checkout, Button.tsx behind the cd');
  assert.equal(reads.filesSearched, 4, 'the two opened, and lexer.ts and index.ts from the search');
  assert.equal(reads.firstUse, TIME);
});

test('work that only happens near a reference is not a read of it', async (t) => {
  const machine = await makeMachine(t);
  const { project, checkout, sibling } = machine;

  await machine.write(
    '.claude/projects/chess-engine/s1.jsonl',
    // The project reading its own files.
    claude('s1', project, 'a', 'Read', { file_path: `${project}/src/main.ts` }, 'x') +
      // Output piped into tail, a heredoc written into the sibling, and an edit.
      claude(
        's1',
        project,
        'b',
        'Bash',
        { command: `cd ${sibling} && pnpm run build 2>&1 | tail -5` },
        'ok',
      ) +
      claude(
        's1',
        project,
        'c',
        'Bash',
        { command: `cat > ${sibling}/notes.md <<'EOF'\nhello\nEOF` },
        '',
      ) +
      claude('s1', project, 'd', 'Edit', { file_path: `${checkout}/src/index.ts` }, 'ok') +
      claude('s1', project, 'e', 'Bash', { command: `sed -i 's/a/b/' ${sibling}/src/a.ts` }, ''),
  );

  const reads = await getTranscriptReads({ home: machine.home, storeDir: machine.store, env: {} });

  assert.equal(reads.sessionsUsing, 0);
  assert.equal(reads.sessions, 1, 'the session was still read');
});

test('a folder is a reference only from a project that declares it', async (t) => {
  const machine = await makeMachine(t);
  const elsewhere = path.dirname(machine.project);

  await machine.write(
    '.claude/projects/elsewhere/s1.jsonl',
    claude('s1', elsewhere, 'a', 'Read', { file_path: `${machine.sibling}/src/Button.tsx` }, 'x'),
  );

  const reads = await getTranscriptReads({ home: machine.home, storeDir: machine.store, env: {} });
  assert.equal(reads.reads, 0);
});

test('Codex and opencode sessions are read too, and a call copied into a resumed session counts once', async (t) => {
  const machine = await makeMachine(t);
  const { project, checkout } = machine;
  const session = claude('s1', project, 'a', 'Read', { file_path: `${checkout}/README.md` }, 'hi');

  await machine.write('.claude/projects/chess-engine/s1.jsonl', session);
  await machine.write('.claude/projects/chess-engine/s1-resumed.jsonl', session);
  await machine.write(
    '.codex/sessions/2026/09/20/rollout-1.jsonl',
    [
      { timestamp: TIME, type: 'session_meta', payload: { cwd: project } },
      {
        timestamp: TIME,
        type: 'response_item',
        payload: {
          type: 'function_call',
          name: 'exec_command',
          call_id: 'call_1',
          arguments: JSON.stringify({ cmd: 'cat src/lexer.ts', workdir: checkout }),
        },
      },
      {
        timestamp: TIME,
        type: 'response_item',
        payload: {
          type: 'function_call_output',
          call_id: 'call_1',
          output: 'Command: cat src/lexer.ts\nProcess exited with code 0\nOutput:\none\ntwo',
        },
      },
    ]
      .map((line) => JSON.stringify(line))
      .join('\n'),
  );
  await machine.write(
    '.local/share/opencode/storage/part/msg_1/prt_1.json',
    JSON.stringify(
      {
        sessionID: 'ses_1',
        type: 'tool',
        tool: 'grep',
        callID: 'call_9',
        state: {
          input: { pattern: 'parse', path: checkout },
          output: 'src/index.ts:1:parse',
          time: { start: Date.parse(TIME) },
        },
      },
      null,
      2,
    ),
  );

  const reads = await getTranscriptReads({ home: machine.home, storeDir: machine.store, env: {} });

  assert.equal(reads.reads, 2, 'the Claude Code read once, and the Codex cat');
  assert.equal(reads.lines, 1 + 2 + 1, 'Codex output without its header');
  assert.equal(reads.searches, 1);
  assert.equal(reads.sessionsUsing, 3);
  assert.deepEqual(
    reads.stores.map((store) => [store.agent, store.sessions]),
    [
      // Both files say they are session s1, so they are one session.
      ['claude-code', 1],
      ['codex', 1],
      ['opencode', 1],
    ],
  );
});

test('--days leaves out calls older than the window', async (t) => {
  const machine = await makeMachine(t);
  const { project, checkout } = machine;

  await machine.write(
    '.claude/projects/chess-engine/s1.jsonl',
    claude(
      's1',
      project,
      'old',
      'Read',
      { file_path: `${checkout}/a.ts` },
      'x',
      '2026-08-01T12:00:00.000Z',
    ) + claude('s1', project, 'new', 'Read', { file_path: `${checkout}/b.ts` }, 'x'),
  );

  const reads = await getTranscriptReads({
    home: machine.home,
    storeDir: machine.store,
    env: {},
    days: 7,
    now: Date.parse('2026-09-21T12:00:00.000Z'),
  });
  assert.equal(reads.reads, 1);
});

test('the summary opens with what agents read, one number to a line', async (t) => {
  const storeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-reference-reads-log-'));
  t.after(() => fs.rm(storeDir, { recursive: true, force: true }));
  const report = await getActivityReport({ storeDir });
  const transcripts: TranscriptReads = {
    stores: [
      { agent: 'claude-code', path: '/home/.claude/projects', sessions: 371, bytes: 2.84e9 },
    ],
    days: null,
    sessions: 371,
    bytes: 2.84e9,
    sessionsUsing: 137,
    firstUse: '2026-08-21T15:00:00.000Z',
    lastUse: '2026-09-23T15:00:00.000Z',
    lines: 135_417,
    filesOpened: 2513,
    filesSearched: 5748,
    reads: 1279,
    searches: 963,
    history: 270,
    listings: 96,
  };

  const printed = formatActivityReport(
    { ...report, transcripts },
    { color: false, tilde: false, now: Date.parse('2026-09-23T18:00:00.000Z') },
  );

  assert.equal(
    printed.split('\n\n').slice(0, 3).join('\n\n'),
    [
      'agent-reference  Aug 21 to Sep 23, 2026',
      [
        '  135k  lines of source read',
        '  2.5k  files opened',
        '  5.7k  files searched',
        '   963  searches',
        '   270  git log and blame calls',
        '   137  sessions that used it',
      ].join('\n'),
      'Read from 371 Claude Code sessions (2.8 GB of transcripts in /home/.claude/projects).',
    ].join('\n\n'),
  );
  assert.match(printed, /No activity recorded yet/u, 'an empty log still says so underneath');
});
