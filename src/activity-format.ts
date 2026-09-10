import path from 'node:path';

import { displayPath } from './fs-utils.ts';
import { sanitizeRelayedLine } from './text-utils.ts';
import type { ActivityEvent, ActivityReport } from './activity.ts';

export interface ActivityFormatOptions {
  /** ANSI color. Callers decide from the stream: a TTY without NO_COLOR set. */
  color: boolean;
  /** Shorten home paths to `~/...`. Only for humans; piped output keeps literal paths. */
  tilde: boolean;
  /** Reads as "ago" from here. Passed in so a test can render a fixed log. */
  now?: number;
}

const ANSI = { dim: '2', yellow: '33' } as const;

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
  if (report.runs === 0) return emptyState(report, options);

  const sections = [
    headline(report, now, options),
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

/** How it went: the failure when there was one, since that is why the line is being read. */
function detail(event: ActivityEvent, color: boolean): string {
  if (event.ok) return duration(event.ms);
  return paint(
    `failed: ${truncate(sanitizeRelayedLine(event.error ?? ''), MAX_ERROR)}`,
    'yellow',
    color,
  );
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
