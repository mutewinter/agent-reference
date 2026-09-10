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

/**
 * The reader is being asked to believe something about their own machine, so
 * the stores come first with what was actually read, then the counts, then one
 * line saying what all four have in common. A percentage rides beside every
 * count because "71" means nothing without the 775 it came out of.
 *
 * The gray is spent on the two things that are genuinely secondary, the paths
 * and the closing lines. An earlier version dimmed the heading, the paths, the
 * percentages, the quotes and the footer, which is most of the screen: there
 * was nothing left at full strength for the dim to be quieter than, and the
 * whole readout came out washed.
 */
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

  const window =
    report.days === null ? 'every session on this machine' : `the last ${dayCount(report.days)}`;

  return `what your agents did without the source, over ${window}\n${lines.join('\n')}\n`;
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
    // Full strength: this is the line the reader is meant to recognize, and it
    // is the whole reason the count is worth printing.
    const rail = paint('    ⎿ ', 'dim', options.color);
    return [line, `${rail}${displayPath(evidence.text, options)}`];
  });

  return `${lines.join('\n')}\n`;
}

/** What the four have in common, which is the only sentence here that sells anything. */
function footer(report: AuditReport, options: AuditFormatOptions): string {
  const lines =
    report.affected === 0
      ? [
          'None of these turned up, which is worth knowing too.',
          'Nothing left this machine: only these files were read, and only counts came out.',
        ]
      : [
          `${report.affected.toLocaleString()} of ${sessionCount(report.sessions)} did at least one of these.`,
          'Every one of them is a session that had no readable source to reach for.',
          'agent-reference get <name> is what puts it there. See agent-reference.dev',
        ];

  const [first, ...rest] = lines;
  return `${[first ?? '', ...rest.map((line) => paint(line, 'dim', options.color))].join('\n')}\n`;
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
