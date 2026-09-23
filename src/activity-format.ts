import path from 'node:path';

import { displayPath } from './fs-utils.ts';
import { sanitizeRelayedLine } from './text-utils.ts';
import { UNATTRIBUTED, type ActivityEvent, type ActivityReport } from './activity.ts';
import type { TranscriptReads } from './transcript-reads.ts';

export interface ActivityFormatOptions {
  /** ANSI color. Callers decide from the stream: a TTY without NO_COLOR set. */
  color: boolean;
  /** Shorten home paths to `~/...`. Only for humans; piped output keeps literal paths. */
  tilde: boolean;
  /** Reads as "ago" from here. Passed in so a test can render a fixed log. */
  now?: number;
}

const ANSI = { bold: '1', dim: '2', green: '32', yellow: '33' } as const;

type AnsiColor = keyof typeof ANSI;

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** Enough rows to see a habit; past that the list is a log, and `--log` is the log. */
const MAX_REFERENCES = 10;
const MAX_PROJECTS = 5;
/** One line per run, so what a run was for is trimmed rather than allowed to wrap. */
const MAX_SUBJECT = 48;
const MAX_ERROR = 80;

/**
 * How much this machine uses the tool and what it reaches for, counted from the local log.
 * The summary is the answer to "is this being used"; the log underneath it is the answer to
 * "used for what", and every line here comes off the same file.
 */
export function formatActivityReport(
  report: ActivityReport,
  options: ActivityFormatOptions,
): string {
  const now = options.now ?? Date.now();
  const reads = readsSection(report.transcripts, options);
  if (report.runs === 0) return [reads, emptyState(report, options)].filter(Boolean).join('\n');

  const sections = [
    reads,
    headline(report, now, options),
    countSection('who ran it', callerRows(report, now), 0, options),
    countSection(
      'commands',
      report.commands.map((entry) => [entry.name, String(entry.runs), '', ago(entry.lastRun, now)]),
      0,
      options,
    ),
    countSection(
      'references',
      report.references.map((entry) => [
        sanitizeRelayedLine(entry.name),
        String(entry.runs),
        entry.kind === 'package' ? sanitizeRelayedLine(entry.version ?? 'package') : entry.kind,
        ago(entry.lastRun, now),
      ]),
      MAX_REFERENCES,
      options,
    ),
    countSection(
      'projects',
      report.projects.map((entry) => [
        displayPath(entry.name, options),
        String(entry.runs),
        '',
        ago(entry.lastRun, now),
      ]),
      MAX_PROJECTS,
      options,
    ),
    footer(report, options),
  ];

  return sections.filter((section) => section !== '').join('\n');
}

/** Harness names the way their makers write them. */
const HARNESS_NAMES: Record<string, string> = {
  'claude-code': 'Claude Code',
  codex: 'Codex',
  opencode: 'opencode',
};

/**
 * What agents read out of references, one number to a line and every number in one column,
 * then where the numbers came from. Listings are counted but not printed: next to reads and
 * searches they are noise, and `--json` carries them.
 */
function readsSection(reads: TranscriptReads | null, options: ActivityFormatOptions): string {
  const scanned = reads?.stores.filter((store) => store.sessions > 0) ?? [];
  if (!reads || scanned.length === 0) return '';

  const source = sourceLines(reads, scanned, options).map((line) =>
    paint(line, 'dim', options.color),
  );
  if (reads.sessionsUsing === 0) {
    return `${paint('No reads of a reference yet.', 'dim', options.color)}\n${source.join('\n')}\n`;
  }

  const rows: Array<[number, string]> = [
    [reads.lines, 'lines of source read'],
    [reads.filesOpened, 'files opened'],
    [reads.filesSearched, 'files searched'],
    [reads.searches, 'searches'],
    [reads.history, 'git log and blame calls'],
    [reads.sessionsUsing, 'sessions that used it'],
  ];
  const width = Math.max(...rows.map(([value]) => shortNumber(value).length));
  const lines = rows.map(([value, label]) => {
    const number = paint(shortNumber(value).padStart(width), 'green', options.color);
    return `  ${paint(number, 'bold', options.color)}  ${label}`;
  });

  return [
    `${paint('agent-reference', 'bold', options.color)}  ${paint(dateRange(reads), 'dim', options.color)}`,
    '',
    ...lines,
    '',
    ...source,
    '',
  ].join('\n');
}

/**
 * What the numbers were read from. One store reads as one sentence; several get a line each,
 * since three paths strung together in a sentence are unreadable.
 */
function sourceLines(
  reads: TranscriptReads,
  scanned: TranscriptReads['stores'],
  options: ActivityFormatOptions,
): string[] {
  const size = `${formatBytes(reads.bytes)} of transcripts`;
  const [only] = scanned;
  if (scanned.length === 1 && only) {
    const name = HARNESS_NAMES[only.agent] ?? only.agent;
    return [
      `Read from ${only.sessions.toLocaleString('en-US')} ${name} ${only.sessions === 1 ? 'session' : 'sessions'} (${size} in ${displayPath(only.path, options)}).`,
    ];
  }

  const counts = scanned.map((store) => store.sessions.toLocaleString('en-US'));
  const names = scanned.map((store) => HARNESS_NAMES[store.agent] ?? store.agent);
  const countWidth = Math.max(...counts.map((value) => value.length));
  const nameWidth = Math.max(...names.map((value) => value.length));
  return [
    `Read from ${reads.sessions.toLocaleString('en-US')} sessions in ${size}:`,
    ...scanned.map(
      (store, index) =>
        `  ${(counts[index] ?? '').padStart(countWidth)} ${(names[index] ?? '').padEnd(nameWidth)}  ${displayPath(store.path, options)}`,
    ),
  ];
}

/**
 * Exact below a thousand, one decimal below a hundred thousand, whole thousands past that:
 * the column is read at a glance, and 135,417 reads slower than 135k without saying more.
 */
function shortNumber(value: number): string {
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e5) return `${Math.round(value / 1e3)}k`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}k`;
  return String(value);
}

function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${Math.round(bytes / 1e6)} MB`;
  return `${Math.max(1, Math.round(bytes / 1e3))} KB`;
}

/**
 * First read to last, with the year said once when both fall in it. Always with a year: this
 * line ends up in screenshots, which are read long after the year they were taken in.
 */
function dateRange(reads: TranscriptReads): string {
  if (!reads.firstUse || !reads.lastUse) return '';
  const first = new Date(reads.firstUse);
  const last = new Date(reads.lastUse);
  const day = (at: Date) => at.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const year = (at: Date) => String(at.getFullYear());
  if (first.getFullYear() !== last.getFullYear()) {
    return `${day(first)}, ${year(first)} to ${day(last)}, ${year(last)}`;
  }
  return day(first) === day(last)
    ? `${day(last)}, ${year(last)}`
    : `${day(first)} to ${day(last)}, ${year(last)}`;
}

/**
 * Who ran the runs, when that is a question with an answer. One row reading
 * `unattributed` is the section saying it does not know, which is worth less than the space
 * it takes; any other single row still names somebody.
 */
function callerRows(report: ActivityReport, now: number): string[][] {
  const [only] = report.callers;
  if (report.callers.length === 1 && only?.name === UNATTRIBUTED) return [];
  return report.callers.map((entry) => [
    entry.name,
    String(entry.runs),
    '',
    ago(entry.lastRun, now),
  ]);
}

/** Where the numbers came from, and what that file is not. */
function footer(report: ActivityReport, options: ActivityFormatOptions): string {
  const lines = [
    `${displayPath(report.logPath, options)} · this machine only, never sent anywhere`,
    'agent-reference activity --log shows the runs themselves',
  ];
  return `${lines.map((line) => paint(line, 'dim', options.color)).join('\n')}\n`;
}

/**
 * The runs themselves, oldest first, so the most recent is the line above the prompt. What a
 * run was for is the references it materialized, and the specs it was asked for when it
 * materialized none, which is what a failure leaves behind.
 */
export function formatActivityLog(report: ActivityReport, options: ActivityFormatOptions): string {
  if (report.runs === 0) return emptyState(report, options);

  const shown = report.events.length;
  const header =
    shown < report.runs
      ? `${displayPath(report.logPath, options)} · last ${shown} of ${runCount(report.runs)}`
      : `${displayPath(report.logPath, options)} · ${runCount(report.runs)}`;

  const rows = report.events.map((event) => [
    stamp(event.time),
    event.command,
    event.project ? path.basename(event.project) : '',
    subject(event),
    detail(event, options.color),
  ]);
  const widths = [0, 1, 2, 3].map((column) =>
    Math.max(...rows.map((row) => (row[column] ?? '').length)),
  );

  const lines = rows.map((row) =>
    row
      .map((cell, column) => (column < 4 ? cell.padEnd(widths[column] ?? 0) : cell))
      .join('  ')
      .trimEnd(),
  );

  if (report.windowDays !== null) {
    lines.push(
      '',
      paint(
        `the last ${dayCount(report.windowDays)}; agent-reference activity --log takes the whole log`,
        'dim',
        options.color,
      ),
    );
  }

  return `${paint(header, 'dim', options.color)}\n\n${lines.join('\n')}\n`;
}

/** What a run was for: what it materialized, or failing that what it was asked for. */
function subject(event: ActivityEvent): string {
  const named =
    event.references.length > 0
      ? event.references.map((reference) =>
          reference.version ? `${reference.name}@${reference.version}` : reference.name,
        )
      : event.args;
  return truncate(sanitizeRelayedLine(named.join(', ')), MAX_SUBJECT);
}

/**
 * How it went: the failure when there was one, and otherwise the warning, since a run that
 * answered while saying the answer is not what was asked for is why this column is read.
 */
function detail(event: ActivityEvent, color: boolean): string {
  if (!event.ok) {
    return paint(
      `failed: ${truncate(sanitizeRelayedLine(event.error ?? ''), MAX_ERROR)}`,
      'yellow',
      color,
    );
  }

  const warning = event.warnings[0];
  if (!warning) return duration(event.ms);
  const note = paint(
    `warned: ${truncate(sanitizeRelayedLine(warning), MAX_ERROR)}`,
    'yellow',
    color,
  );
  return `${duration(event.ms)}  ${note}`;
}

function headline(report: ActivityReport, now: number, options: ActivityFormatOptions): string {
  const days = report.windowDays ?? span(report, now);
  // A log younger than a day has no span worth reporting, and "over 1 day" reads as a claim
  // about a stretch of time rather than about a log that started this morning.
  const scope =
    report.windowDays === null && days > 1
      ? `${runCount(report.runs)} over ${dayCount(days)}`
      : `${runCount(report.runs)} in the last ${dayCount(days)}`;
  const lines = [`${scope} · last run ${ago(report.lastRun, now)}`];

  const counts = [
    ...report.buckets.map(
      (bucket) => `${bucket.days === 1 ? 'today' : `${bucket.days} days`} ${bucket.runs}`,
    ),
    ...(report.failures > 0 ? [`${report.failures} failed`] : []),
    ...(report.warned > 0 ? [`${report.warned} warned`] : []),
  ];
  if (counts.length > 0) lines.push(paint(counts.join(' · '), 'dim', options.color));

  return `${lines.join('\n')}\n`;
}

/**
 * One block of counted rows. The count column is right-aligned against the widest number so
 * the bars a reader is really looking for line up, and an empty middle cell collapses rather
 * than leaving a gutter.
 */
function countSection(
  heading: string,
  rows: string[][],
  limit: number,
  options: ActivityFormatOptions,
): string {
  if (rows.length === 0) return '';

  const shown = limit > 0 ? rows.slice(0, limit) : rows;
  const name = Math.max(...shown.map((row) => (row[0] ?? '').length));
  const runs = Math.max(...shown.map((row) => (row[1] ?? '').length));
  const kind = Math.max(...shown.map((row) => (row[2] ?? '').length));

  const lines = shown.map(([label, count, middle, last]) => {
    const cells = [
      (label ?? '').padEnd(name),
      (count ?? '').padStart(runs),
      ...(kind > 0 ? [(middle ?? '').padEnd(kind)] : []),
      paint(last ?? '', 'dim', options.color),
    ];
    return `  ${cells.join('  ')}`;
  });

  if (rows.length > shown.length) {
    lines.push(paint(`  +${rows.length - shown.length} more`, 'dim', options.color));
  }

  return `${paint(heading, 'dim', options.color)}\n${lines.join('\n')}\n`;
}

/**
 * Nothing recorded yet is the front door for this command, so it says where the file is and
 * what it is not: a local record, read by nothing but this CLI, and refusable.
 */
function emptyState(report: ActivityReport, options: ActivityFormatOptions): string {
  const lines =
    report.recorded > 0 && report.windowDays !== null
      ? [
          `No runs in the last ${dayCount(report.windowDays)}, out of ${runCount(report.recorded)} recorded.`,
          '',
          'agent-reference activity takes the whole log.',
        ]
      : [
          'No activity recorded yet.',
          '',
          `Every run appends one line to ${displayPath(report.logPath, options)}, on this`,
          'machine and nowhere else. AGENT_REFERENCE_NO_LOG=1 turns the recording off.',
        ];

  return `${lines.join('\n')}\n`;
}

function span(report: ActivityReport, now: number): number {
  if (!report.firstRun) return 1;
  return Math.max(1, Math.ceil((now - Date.parse(report.firstRun)) / DAY_MS));
}

function runCount(runs: number): string {
  return `${runs} ${runs === 1 ? 'run' : 'runs'}`;
}

function dayCount(days: number): string {
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}

function duration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '';
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
}

/** Local time, written out rather than localized: a log is read down a column. */
function stamp(time: string): string {
  const at = new Date(time);
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

/** How recently, in the coarsest unit that still says something. */
function ago(time: string | null, now: number): string {
  if (!time) return 'never';
  const elapsed = now - Date.parse(time);
  if (!Number.isFinite(elapsed) || elapsed < MINUTE_MS) return 'just now';
  if (elapsed < HOUR_MS) return plural(Math.floor(elapsed / MINUTE_MS), 'minute');
  if (elapsed < DAY_MS) return plural(Math.floor(elapsed / HOUR_MS), 'hour');
  if (elapsed < 30 * DAY_MS) return plural(Math.floor(elapsed / DAY_MS), 'day');
  return plural(Math.floor(elapsed / (30 * DAY_MS)), 'month');
}

function plural(value: number, unit: string): string {
  return `${value} ${unit}${value === 1 ? '' : 's'} ago`;
}

function truncate(value: string, limit: number): string {
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
}

function paint(text: string, color: AnsiColor, enabled: boolean): string {
  return enabled ? `\u001b[${ANSI[color]}m${text}\u001b[0m` : text;
}
