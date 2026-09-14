import { displayPath } from './fs-utils.ts';
import { FINDINGS, type AuditReport } from './audit.ts';

export interface AuditFormatOptions {
  /** ANSI color. Callers decide from the stream: a TTY without NO_COLOR set. */
  color: boolean;
  /** Shorten home paths to `~/...`. Only for humans; piped output keeps literal paths. */
  tilde: boolean;
}

const ANSI = { dim: '2', yellow: '33' } as const;

type AnsiColor = keyof typeof ANSI;

/** Lists scanned stores, session counts, matching excerpts, and the setup prompt. */
export function formatAuditReport(report: AuditReport, options: AuditFormatOptions): string {
  if (report.harnesses.length === 0) return emptyState(report, options);

  const sections = [stores(report, options), counts(report, options), footer(report, options)];

  return sections.filter((section) => section !== '').join('\n');
}

function stores(report: AuditReport, options: AuditFormatOptions): string {
  const rows = report.harnesses.map((harness) => [
    harness.agent,
    `${harness.sessions}`,
    displayPath(harness.path, options),
  ]);
  const agent = Math.max(...rows.map((row) => (row[0] ?? '').length));
  const count = Math.max(...rows.map((row) => (row[1] ?? '').length));

  const lines = rows.map(([name, sessions, path]) => {
    const label = `${(sessions ?? '').padStart(count)} ${sessions === '1' ? 'session ' : 'sessions'}`;
    return `  ${(name ?? '').padEnd(agent)}  ${label}  ${paint(path ?? '', 'dim', options.color)}`;
  });

  const window = report.days === null ? 'all time' : `last ${dayCount(report.days)}`;

  return `Scanned local agent sessions (${window}):\n${lines.join('\n')}\n`;
}

/**
 * One row per symptom, always all four: a zero is a result here rather than a
 * missing row, since the reader is checking whether this happens to them.
 */
function counts(report: AuditReport, options: AuditFormatOptions): string {
  const rows = FINDINGS.map((finding) => ({
    id: finding.id,
    title: finding.title,
    sessions: `${report.counts[finding.id]}`,
    percent: share(report.counts[finding.id], report.sessions),
  }));
  const title = Math.max(...rows.map((row) => row.title.length));
  const count = Math.max(...rows.map((row) => row.sessions.length));

  const lines = rows.flatMap((row) => {
    const painted =
      row.sessions === '0' ? row.sessions : paint(row.sessions, 'yellow', options.color);
    // Trimmed, because a symptom that never turned up has no percentage beside
    // it and the columns would otherwise leave the gutter it would have used.
    const line =
      `  ${row.title.padEnd(title)}  ${' '.repeat(count - row.sessions.length)}${painted}  ${paint(row.percent, 'dim', options.color)}`.trimEnd();

    // The line the count came out of, under it, the way the harness that wrote
    // it prints. Absent only when a symptom never turned up, which is the one
    // case with nothing to show.
    const evidence = report.evidence[row.id];
    if (!evidence) return [line];
    const excerpt = `    ⎿ ${displayPath(evidence.text, options)}`;
    return [line, paint(excerpt, 'dim', options.color)];
  });

  return `${lines.join('\n')}\n`;
}

/** Summarizes the matches and gives the human a prompt to paste into their agent. */
function footer(report: AuditReport, options: AuditFormatOptions): string {
  if (report.affected === 0) {
    return `No sessions matched these patterns.\n${paint('Session data stayed on this machine.', 'dim', options.color)}\n`;
  }

  return [
    `${report.affected.toLocaleString()} of ${sessionCount(report.sessions)} matched at least one pattern.`,
    '',
    'To give your agent readable dependency source, paste this prompt:',
    '',
    'Set this project up for agent-reference: run `npx agent-reference init` and follow the brief it prints.',
    '',
  ].join('\n');
}

/** No store found is the interesting case: it says where it looked, so it can be corrected. */
function emptyState(report: AuditReport, options: AuditFormatOptions): string {
  const lines = [
    'No agent transcripts turned up on this machine. Looked in:',
    ...report.missing.map((target) => `  ${displayPath(target, options)}`),
    '',
    'If the agent you run keeps a history somewhere else, this cannot count it yet.',
  ];
  return `${lines.join('\n')}\n`;
}

function share(count: number, total: number): string {
  if (total === 0 || count === 0) return '';
  const percent = Math.round((count / total) * 100);
  return percent === 0 ? '<1%' : `${percent}%`;
}

function sessionCount(value: number): string {
  return `${value.toLocaleString()} session${value === 1 ? '' : 's'}`;
}

function dayCount(value: number): string {
  return `${value} day${value === 1 ? '' : 's'}`;
}

function paint(text: string, color: AnsiColor, enabled: boolean): string {
  return enabled ? `\u001b[${ANSI[color]}m${text}\u001b[0m` : text;
}

/**
 * Something on the screen while a few gigabytes are read. The count is the only
 * honest thing to show, since the answer is not known until the last session is
 * scanned, and it is erased rather than left behind: what a reader wants after
 * the wait is the report, not a record of the waiting.
 *
 * Only for a terminal. A progress line in a pipe is garbage in a file, so the
 * caller passes nothing when the output is not a TTY.
 */
export function auditProgress(write: (text: string) => void): {
  update: (done: number, total: number) => void;
  clear: () => void;
} {
  let last = 0;
  let drawn = false;

  return {
    update(done, total) {
      const now = Date.now();
      // Every frame would be one write per session. This is the rate a number
      // can be read at anyway.
      if (done < total && now - last < 80) return;
      last = now;
      drawn = true;
      // Transcripts rather than sessions: one store writes a session across
      // many files, so counting files against a session total would end on a
      // number the report then contradicts.
      write(`\r\u001b[Kreading ${done.toLocaleString()} of ${total.toLocaleString()} transcripts…`);
    },
    clear() {
      if (drawn) write('\r\u001b[K');
    },
  };
}
