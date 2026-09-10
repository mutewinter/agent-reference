import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  getActivityReport,
  recordActivity,
  usageLogPath,
  type RecordActivityInput,
} from '../src/activity.ts';
import { formatActivityLog, formatActivityReport } from '../src/activity-format.ts';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-09-10T12:00:00.000Z');

test('a run is recorded as one line and read back as one run', async () => {
  const storeDir = await tempStore();

  await recordActivity(
    {
      command: 'get',
      project: '/projects/chess-engine',
      args: ['zod'],
      references: [{ name: 'zod', kind: 'package', version: '3.22.0' }],
      ms: 812,
      now: NOW,
    },
    { storeDir },
  );

  const written = await fs.readFile(usageLogPath(storeDir), 'utf8');
  assert.equal(written.split('\n').filter(Boolean).length, 1);
  assert.deepEqual(JSON.parse(written), {
    v: 1,
    time: '2026-09-10T12:00:00.000Z',
    command: 'get',
    project: '/projects/chess-engine',
    args: ['zod'],
    references: [{ name: 'zod', kind: 'package', version: '3.22.0' }],
    ms: 812,
    ok: true,
  });

  const report = await getActivityReport({ storeDir, now: NOW });
  assert.equal(report.runs, 1);
  assert.equal(report.failures, 0);
  assert.deepEqual(report.commands, [
    { name: 'get', runs: 1, lastRun: '2026-09-10T12:00:00.000Z' },
  ]);
  assert.deepEqual(report.references, [
    {
      name: 'zod',
      runs: 1,
      lastRun: '2026-09-10T12:00:00.000Z',
      kind: 'package',
      version: '3.22.0',
    },
  ]);
  assert.deepEqual(report.projects, [
    { name: '/projects/chess-engine', runs: 1, lastRun: '2026-09-10T12:00:00.000Z' },
  ]);
});

test('runs are counted per command, reference, and project, most used first', async () => {
  const storeDir = await tempStore();
  await write(storeDir, [
    run({ command: 'get', names: ['zod'], daysAgo: 9 }),
    run({ command: 'get', names: ['zod', 'chess-engine'], daysAgo: 2 }),
    run({ command: 'get', names: ['zod'], daysAgo: 0.5 }),
    run({ command: 'status', names: [], daysAgo: 0.5, project: '/projects/company-ui' }),
  ]);

  const report = await getActivityReport({ storeDir, now: NOW });

  assert.equal(report.runs, 4);
  assert.deepEqual(
    report.commands.map((entry) => [entry.name, entry.runs]),
    [
      ['get', 3],
      ['status', 1],
    ],
  );
  assert.deepEqual(
    report.references.map((entry) => [entry.name, entry.runs]),
    [
      ['zod', 3],
      ['chess-engine', 1],
    ],
  );
  assert.deepEqual(
    report.projects.map((entry) => [entry.name, entry.runs]),
    [
      ['/projects/chess-engine', 3],
      ['/projects/company-ui', 1],
    ],
  );
  // The whole log is 9 days old, so a 30 day window would only repeat the total.
  assert.deepEqual(report.buckets, [
    { days: 1, runs: 2 },
    { days: 7, runs: 3 },
  ]);
});

test('--days counts a window, and says how much it left out', async () => {
  const storeDir = await tempStore();
  await write(storeDir, [
    run({ command: 'get', names: ['zod'], daysAgo: 40 }),
    run({ command: 'get', names: ['zod'], daysAgo: 2 }),
  ]);

  const week = await getActivityReport({ storeDir, days: 7, now: NOW });
  assert.equal(week.runs, 1);
  assert.equal(week.recorded, 2);
  assert.equal(week.windowDays, 7);

  const day = await getActivityReport({ storeDir, days: 1, now: NOW });
  assert.equal(day.runs, 0);
  assert.match(
    formatActivityReport(day, { color: false, tilde: false, now: NOW }),
    /No runs in the last 1 day, out of 2 runs recorded/,
  );
});

test('a failed run keeps the spec it was asked for and why it failed', async () => {
  const storeDir = await tempStore();
  await recordActivity(
    {
      command: 'get',
      project: '/projects/chess-engine',
      args: ['nonesuch'],
      ms: 40,
      now: NOW,
      error: new Error('No package named nonesuch.\nfix: check the name'),
    },
    { storeDir },
  );

  const report = await getActivityReport({ storeDir, now: NOW });
  assert.equal(report.failures, 1);
  assert.equal(report.events[0]?.ok, false);
  // One line: the rest of a multi-line failure is a fix for the run that hit it, not for a log.
  assert.equal(report.events[0]?.error, 'No package named nonesuch.');

  const printed = formatActivityLog(report, { color: false, tilde: false, now: NOW });
  assert.match(printed, /nonesuch/);
  assert.match(printed, /failed: No package named nonesuch\./);
});

test('recording is refusable, and nothing is written when it is refused', async () => {
  const storeDir = await tempStore();
  process.env.AGENT_REFERENCE_NO_LOG = '1';
  try {
    await recordActivity(
      { command: 'get', project: null, args: ['zod'], ms: 10, now: NOW },
      { storeDir },
    );
  } finally {
    delete process.env.AGENT_REFERENCE_NO_LOG;
  }

  assert.equal(await exists(usageLogPath(storeDir)), false);
  assert.equal((await getActivityReport({ storeDir, now: NOW })).runs, 0);
});

test('a log that rotates keeps both generations, and a torn line costs only itself', async () => {
  const storeDir = await tempStore();
  const logPath = usageLogPath(storeDir);
  await fs.mkdir(path.dirname(logPath), { recursive: true });

  // Past the cap, so the next append rotates this file rather than growing it.
  const line = `${JSON.stringify(event(run({ command: 'status', names: [], daysAgo: 3 })))}\n`;
  const filler = line.repeat(Math.ceil((2 * 1024 * 1024) / line.length));
  const before = filler.split('\n').length - 1;
  await fs.writeFile(logPath, filler);

  await recordActivity(
    { command: 'get', project: '/projects/chess-engine', args: ['zod'], ms: 12, now: NOW },
    { storeDir },
  );

  assert.equal(await exists(path.join(path.dirname(logPath), 'usage.1.jsonl')), true);
  assert.equal((await fs.readFile(logPath, 'utf8')).split('\n').filter(Boolean).length, 1);

  // A half-written line is skipped; the run above it and the run below it are not.
  await fs.appendFile(logPath, '{"v":1,"command":"get"\n');
  await recordActivity(
    { command: 'status', project: '/projects/chess-engine', args: [], ms: 8, now: NOW },
    { storeDir },
  );

  const report = await getActivityReport({ storeDir, now: NOW });
  assert.equal(report.runs, before + 2);
});

test('an empty log explains where the file is and that it stays here', async () => {
  const storeDir = await tempStore();
  const report = await getActivityReport({ storeDir, now: NOW });

  const printed = formatActivityReport(report, { color: false, tilde: false, now: NOW });
  assert.match(printed, /No activity recorded yet\./);
  assert.match(printed, /machine and nowhere else/);
  assert.match(printed, /AGENT_REFERENCE_NO_LOG=1/);
});

test('the summary reads as counts against how recently each one happened', async () => {
  const storeDir = await tempStore();
  await write(storeDir, [
    run({ command: 'get', names: ['zod'], daysAgo: 9 }),
    run({ command: 'get', names: ['zod'], daysAgo: 0.1 }),
    run({ command: 'clone', names: ['chess-engine'], daysAgo: 3, project: '/projects/company-ui' }),
  ]);

  const report = await getActivityReport({ storeDir, now: NOW });
  const printed = formatActivityReport(report, { color: false, tilde: false, now: NOW });

  assert.match(printed, /3 runs over 9 days · last run 2 hours ago/);
  assert.match(printed, /commands\n\s+get\s+2\s+2 hours ago/);
  assert.match(printed, /zod\s+2\s+3\.22\.0\s+2 hours ago/);
  assert.match(printed, /\/projects\/chess-engine\s+2\s+2 hours ago/);
  assert.match(printed, /never sent anywhere/);
});

interface RunInput {
  command: string;
  names: string[];
  daysAgo: number;
  project?: string;
}

function run(input: RunInput): RecordActivityInput {
  return {
    command: input.command,
    project: input.project ?? '/projects/chess-engine',
    args: input.names,
    references: input.names.map((name) => ({
      name,
      kind: 'package' as const,
      version: '3.22.0',
    })),
    ms: 100,
    now: NOW - input.daysAgo * DAY_MS,
  };
}

/** The line `recordActivity` would write, for a test that fills a log directly. */
function event(input: RecordActivityInput): unknown {
  return {
    v: 1,
    time: new Date(input.now ?? NOW).toISOString(),
    command: input.command,
    project: input.project,
    args: input.args,
    references: input.references ?? [],
    ms: input.ms,
    ok: true,
  };
}

async function write(storeDir: string, runs: RecordActivityInput[]): Promise<void> {
  for (const entry of runs) await recordActivity(entry, { storeDir });
}

async function tempStore(): Promise<string> {
  return await fs.mkdtemp(path.join(os.tmpdir(), 'agent-reference-activity-'));
}

async function exists(target: string): Promise<boolean> {
  return await fs
    .stat(target)
    .then(() => true)
    .catch(() => false);
}
