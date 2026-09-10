import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { defaultStoreDir } from './git.ts';
import { resolveProjectInput } from './scanner.ts';
import type { AgentReferenceKind, CheckoutConfidence } from './types.ts';

/**
 * What this machine has asked agent-reference for, recorded locally so the question "is this
 * thing actually being used, and for what" is answered from evidence rather than memory. One
 * JSON object per line, appended by every run, read back by `activity`. It is a file in the
 * store like every other cache here: nothing is sent anywhere, nothing but this CLI reads it,
 * and deleting it costs the history and nothing else.
 */
const LOG_DIR = 'log';
const LOG_FILE = 'usage.jsonl';
/** One generation back. Two files bound the log without a rewrite on the append path. */
const ROTATED_FILE = 'usage.1.jsonl';
const MAX_LOG_BYTES = 2 * 1024 * 1024;

/** Lines carrying anything else are from a build that wrote a different shape, and are skipped. */
const SCHEMA_VERSION = 1;

/** A relayed failure goes in whole lines elsewhere; here it is one field on one line. */
const MAX_ERROR_LENGTH = 200;

const DAY_MS = 24 * 60 * 60 * 1000;
/** The windows a summary reports beside the total, when the log is old enough to fill them. */
const BUCKET_DAYS = [1, 7, 30] as const;
const DEFAULT_EVENT_LIMIT = 50;

/** A warning is relayed text, and it shares one line with everything else about the run. */
const MAX_WARNING_LENGTH = 120;
const MAX_WARNINGS = 5;

/**
 * Which harness ran this, when it says so itself. Only variables a tool sets on its own
 * process are read, by exact name, and only whether one is set is recorded: never a value,
 * never the environment at large, and never the process tree above this one. An unrecognized
 * caller is recorded as no caller rather than guessed at; add a row when you meet one.
 */
const HARNESS_ENV: ReadonlyArray<readonly [string, string]> = [
  ['CLAUDECODE', 'claude-code'],
  ['CODEX_SANDBOX', 'codex'],
  ['CODEX_SESSION_ID', 'codex'],
  ['CURSOR_INVOKED_AS', 'cursor'],
  // Last, so a harness running inside CI still reports as itself.
  ['CI', 'ci'],
];

/** A person typed it: nothing named a harness, and something was watching stdout. */
export const TERMINAL = 'terminal';
/** Neither, which is a caller this cannot name rather than a caller it says was nobody. */
export const UNATTRIBUTED = 'unattributed';

/** One source a run materialized, named the way the run named it back. */
export interface ActivityReference {
  name: string;
  kind: AgentReferenceKind;
  /** The version resolved, for a package; null for a repository or a path. */
  version: string | null;
  /** How sure the checkout is of that version. `fallback` means it is not that version. */
  confidence: CheckoutConfidence | null;
}

/** One run of the CLI. */
export interface ActivityEvent {
  v: number;
  /** ISO 8601, in UTC, so a line means the same thing in any timezone it is read from. */
  time: string;
  command: string;
  /** The project root the run resolved against, or null when it could not be determined. */
  project: string | null;
  /** The positionals as typed: the specs asked for, which survive a failure that resolves none. */
  args: string[];
  /** Flag names as typed, values dropped: which shape of a command was asked for. */
  flags: string[];
  references: ActivityReference[];
  /** Whether stdout was a terminal, which is what separates a person from a harness. */
  tty: boolean;
  /** The harness that ran this, when one names itself. Null is unattributed, not "nobody". */
  agent: string | null;
  /** The build that wrote this line, so a log spanning upgrades can be read. */
  cli: string;
  ms: number;
  ok: boolean;
  /** Answers the run handed back that were not what was asked for, though it succeeded. */
  warnings: string[];
  /** The first line of the failure, for the run that needs explaining later. */
  error?: string;
}

export interface ActivityCount {
  name: string;
  runs: number;
  /** ISO time of the most recent run counted here. */
  lastRun: string;
}

export interface ActivityReferenceCount extends ActivityCount {
  kind: AgentReferenceKind;
  /** The version most recently materialized under this name, for a package. */
  version: string | null;
}

export interface ActivityReport {
  logPath: string;
  /** Runs inside the window, which is the whole log unless `days` narrowed it. */
  runs: number;
  /** Runs in the log whatever the window, so an empty window reads as a window and not a log. */
  recorded: number;
  failures: number;
  /** Runs that succeeded and still handed back something worth reading twice. */
  warned: number;
  windowDays: number | null;
  firstRun: string | null;
  lastRun: string | null;
  buckets: Array<{ days: number; runs: number }>;
  commands: ActivityCount[];
  references: ActivityReferenceCount[];
  projects: ActivityCount[];
  /** Who ran it: the harness that named itself, `terminal` for a person, else unattributed. */
  callers: ActivityCount[];
  /** The most recent runs, oldest first. Bounded by `limit`; `runs` is the true total. */
  events: ActivityEvent[];
}

export function usageLogPath(storeDir: string): string {
  return path.join(storeDir, LOG_DIR, LOG_FILE);
}

/** Set to anything but `0` to stop recording. The log is local, but it is still a record. */
export function recordingDisabled(): boolean {
  const value = process.env.AGENT_REFERENCE_NO_LOG;
  return value !== undefined && value !== '' && value !== '0';
}

export interface RecordActivityInput {
  command: string;
  project: string | null;
  args: string[];
  flags?: string[];
  references?: ActivityReference[];
  warnings?: string[];
  tty?: boolean;
  cli?: string;
  /** The harness, when the caller already knows it. Detected from the environment otherwise. */
  agent?: string | null;
  /** Milliseconds the run took, wall clock. */
  ms: number;
  error?: unknown;
  /** What the process is about to exit with. A command can answer and still fail, and
   * `validate` does exactly that: it prints its findings and sets 1 without throwing. */
  exitCode?: number;
  now?: number;
}

/**
 * The harness that ran this, or null when nothing in the environment names one. Exported so
 * the table above is testable from the outside, since the whole design of it is that a run
 * is labeled only by a name a tool published about itself.
 */
export function detectAgent(env: NodeJS.ProcessEnv = process.env): string | null {
  for (const [variable, agent] of HARNESS_ENV) {
    const value = env[variable];
    if (value !== undefined && value !== '' && value !== '0') return agent;
  }
  return null;
}

/**
 * Appends one run. A record of a run is worth less than the run itself, so every failure
 * here is swallowed: a full disk, a read-only home, a store directory that is a file. The
 * append is a single small write, which is atomic enough for a file two commands share.
 */
export async function recordActivity(
  input: RecordActivityInput,
  options: { storeDir?: string } = {},
): Promise<void> {
  if (recordingDisabled()) return;

  const event: ActivityEvent = {
    v: SCHEMA_VERSION,
    time: new Date(input.now ?? Date.now()).toISOString(),
    command: input.command,
    project: input.project,
    args: input.args,
    flags: input.flags ?? [],
    references: input.references ?? [],
    tty: input.tty ?? false,
    agent: input.agent === undefined ? detectAgent() : input.agent,
    cli: input.cli ?? 'unknown',
    ms: input.ms,
    // A command that answered and then set a non-zero exit did not succeed, whatever it
    // printed. Reading only the thrown failure recorded a refused config as a clean run.
    ok: input.error === undefined && !input.exitCode,
    warnings: (input.warnings ?? [])
      .slice(0, MAX_WARNINGS)
      .map((warning) => oneLine(warning, MAX_WARNING_LENGTH)),
  };
  if (input.error !== undefined) event.error = errorLine(input.error);

  const logPath = usageLogPath(options.storeDir ?? defaultStoreDir());
  try {
    await fs.mkdir(path.dirname(logPath), { recursive: true });
    await rotate(logPath);
    await fs.appendFile(logPath, `${JSON.stringify(event)}\n`);
  } catch {
    // Nothing to report to: this runs after the command has already printed its answer.
  }
}

/**
 * The project a run belongs to, which is the root the commands themselves resolve rather than
 * the directory the shell happened to be in, so runs from a subdirectory count as one project.
 * Any failure falls back to the directory, because a run that happened is worth recording
 * under an imperfect name.
 */
export async function activityProject(cwd: string = process.cwd()): Promise<string> {
  return await resolveProjectInput(null, cwd)
    .then((project) => project.projectRoot)
    .catch(() => cwd);
}

export interface ActivityOptions {
  storeDir?: string;
  /** Count only runs this recent. Null, the default, is the whole log. */
  days?: number | null;
  /** How many of the most recent runs to carry in `events`. */
  limit?: number;
  now?: number;
}

export async function getActivityReport(options: ActivityOptions = {}): Promise<ActivityReport> {
  const storeDir = options.storeDir ?? defaultStoreDir();
  const now = options.now ?? Date.now();
  const days = options.days ?? null;
  const limit = options.limit ?? DEFAULT_EVENT_LIMIT;

  const recorded = await readEvents(storeDir);
  const cutoff = days === null ? null : now - days * DAY_MS;
  const events = cutoff === null ? recorded : recorded.filter((event) => at(event) >= cutoff);

  const commands = new Map<string, ActivityCount>();
  const projects = new Map<string, ActivityCount>();
  const references = new Map<string, ActivityReferenceCount>();
  const callers = new Map<string, ActivityCount>();
  let failures = 0;
  let warned = 0;

  // Ascending, so the run being counted is always the most recent one seen for its key.
  for (const event of events) {
    if (!event.ok) failures += 1;
    if (event.ok && event.warnings.length > 0) warned += 1;
    count(commands, event.command, event.time);
    count(callers, caller(event), event.time);
    if (event.project) count(projects, event.project, event.time);
    for (const reference of event.references) countReference(references, reference, event.time);
  }

  const first = events[0];
  return {
    logPath: usageLogPath(storeDir),
    runs: events.length,
    recorded: recorded.length,
    failures,
    warned,
    windowDays: days,
    firstRun: first?.time ?? null,
    lastRun: events.at(-1)?.time ?? null,
    buckets: buckets(events, now, days),
    commands: ranked(commands),
    references: ranked(references),
    projects: ranked(projects),
    callers: ranked(callers),
    events: limit > 0 ? events.slice(-limit) : [],
  };
}

function count(tally: Map<string, ActivityCount>, name: string, time: string): void {
  const existing = tally.get(name);
  if (existing) {
    existing.runs += 1;
    existing.lastRun = time;
    return;
  }

  tally.set(name, { name, runs: 1, lastRun: time });
}

function countReference(
  tally: Map<string, ActivityReferenceCount>,
  reference: ActivityReference,
  time: string,
): void {
  const existing = tally.get(reference.name);
  if (!existing) {
    tally.set(reference.name, {
      name: reference.name,
      runs: 1,
      lastRun: time,
      kind: reference.kind,
      version: reference.version,
    });
    return;
  }

  existing.runs += 1;
  existing.lastRun = time;
  existing.kind = reference.kind;
  // A repository or a path carries no version, and must not blank out one already seen for
  // a name that has also been asked for as a package.
  existing.version = reference.version ?? existing.version;
}

function ranked<T extends ActivityCount>(tally: Map<string, T>): T[] {
  return [...tally.values()].toSorted((a, b) => b.runs - a.runs || a.name.localeCompare(b.name));
}

/**
 * A window is only worth printing when the log is older than it is: on a log three days old,
 * "30 days" is the total said twice, which reads as a bug in the counting.
 */
function buckets(
  events: ActivityEvent[],
  now: number,
  days: number | null,
): Array<{ days: number; runs: number }> {
  const first = events[0];
  if (!first) return [];
  const span = now - at(first);

  return BUCKET_DAYS.filter(
    (bucket) => bucket * DAY_MS < span && (days === null || bucket < days),
  ).map((bucket) => ({
    days: bucket,
    runs: events.filter((event) => at(event) >= now - bucket * DAY_MS).length,
  }));
}

function at(event: ActivityEvent): number {
  return Date.parse(event.time);
}

/**
 * Both generations, oldest first. A line that will not parse is skipped rather than fatal:
 * this file is appended to by concurrent runs and truncated by rotation, and one unreadable
 * line must not cost the history around it.
 */
async function readEvents(storeDir: string): Promise<ActivityEvent[]> {
  const directory = path.join(storeDir, LOG_DIR);
  const events: ActivityEvent[] = [];

  for (const file of [ROTATED_FILE, LOG_FILE]) {
    const contents = await fs.readFile(path.join(directory, file), 'utf8').catch(() => null);
    if (contents === null) continue;

    for (const line of contents.split('\n')) {
      const event = parseEvent(line);
      if (event) events.push(event);
    }
  }

  // Appends are already in order, but a clock that moved backwards would leave them not so,
  // and every window and "last run" here reads the ends of this list.
  return events.toSorted((a, b) => at(a) - at(b));
}

function parseEvent(line: string): ActivityEvent | null {
  if (!line.trim()) return null;
  try {
    const event = JSON.parse(line) as ActivityEvent;
    if (event.v !== SCHEMA_VERSION || Number.isNaN(Date.parse(event.time))) return null;
    // Fields added after a line was written default rather than disqualify it: the shape is
    // additive, so a run recorded by an older build still counts toward every total.
    return {
      ...event,
      args: Array.isArray(event.args) ? event.args : [],
      flags: Array.isArray(event.flags) ? event.flags : [],
      references: Array.isArray(event.references) ? event.references : [],
      warnings: Array.isArray(event.warnings) ? event.warnings : [],
      tty: event.tty === true,
      agent: event.agent ?? null,
      cli: event.cli ?? 'unknown',
    };
  } catch {
    return null;
  }
}

/**
 * Keeps the log bounded without ever rewriting it: past the cap the current file becomes the
 * previous generation and a new one starts, so an append stays one write however long the
 * history gets. The reader takes both, so the oldest half is lost only on the second rotation.
 */
async function rotate(logPath: string): Promise<void> {
  const stat = await fs.stat(logPath).catch(() => null);
  if (!stat || stat.size < MAX_LOG_BYTES) return;
  await fs.rename(logPath, path.join(path.dirname(logPath), ROTATED_FILE)).catch(() => {});
}

function errorLine(error: unknown): string {
  return oneLine(error instanceof Error ? error.message : String(error), MAX_ERROR_LENGTH);
}

/** Relayed text on a line of its own: the first line of it, bounded. */
function oneLine(value: string, limit: number): string {
  const first = value.split('\n')[0]?.trim() ?? '';
  return first.length > limit ? `${first.slice(0, limit - 1)}…` : first;
}

/**
 * Who a run belongs to. A harness that named itself wins; failing that, a terminal means a
 * person typed it, and everything else is a caller nothing here can put a name to.
 */
function caller(event: ActivityEvent): string {
  return event.agent ?? (event.tty ? TERMINAL : UNATTRIBUTED);
}
