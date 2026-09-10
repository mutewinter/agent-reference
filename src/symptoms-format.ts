import { displayPath } from './fs-utils.ts';
import { SYMPTOMS, type SymptomsReport } from './symptoms.ts';

export interface SymptomsFormatOptions {
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
 */
export function formatSymptomsReport(
  report: SymptomsReport,
  options: SymptomsFormatOptions,
): string {
  if (report.harnesses.length === 0) return emptyState(report, options);

  const sections = [stores(report, options), counts(report, options), footer(report, options)];

  return sections.filter((section) => section !== '').join('\n');
}

function stores(report: SymptomsReport, options: SymptomsFormatOptions): string {
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

  return `${paint(`what your agents did without the source, over ${window}`, 'dim', options.color)}\n${lines.join('\n')}\n`;
}

/**
 * One row per symptom, always all four: a zero is a result here rather than a
 * missing row, since the reader is checking whether this happens to them.
 */
function counts(report: SymptomsReport, options: SymptomsFormatOptions): string {
  const rows = SYMPTOMS.map((symptom) => [
    symptom.title,
    `${report.counts[symptom.id]}`,
    share(report.counts[symptom.id], report.sessions),
  ]);
  const title = Math.max(...rows.map((row) => (row[0] ?? '').length));
  const count = Math.max(...rows.map((row) => (row[1] ?? '').length));

  const lines = rows.map(([label, sessions, percent]) => {
    const painted =
      sessions === '0' ? (sessions ?? '') : paint(sessions ?? '', 'yellow', options.color);
    return `  ${(label ?? '').padEnd(title)}  ${' '.repeat(count - (sessions ?? '').length)}${painted}  ${paint(percent ?? '', 'dim', options.color)}`;
  });

  return `${lines.join('\n')}\n`;
}

/** What the four have in common, which is the only sentence here that sells anything. */
function footer(report: SymptomsReport, options: SymptomsFormatOptions): string {
  const lines =
    report.affected === 0
      ? [
          'None of these turned up, which is worth knowing too.',
          'Nothing left this machine: only these files were read, and only counts came out.',
        ]
      : [
          `${report.affected} of ${sessionCount(report.sessions)} did at least one of these.`,
          'Every one of them is a session that had no readable source to reach for.',
          'agent-reference get <name> is what puts it there. See agent-reference.dev',
        ];

  return `${lines.map((line) => paint(line, 'dim', options.color)).join('\n')}\n`;
}

/** No store found is the interesting case: it says where it looked, so it can be corrected. */
function emptyState(report: SymptomsReport, options: SymptomsFormatOptions): string {
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
  return `${value} session${value === 1 ? '' : 's'}`;
}

function dayCount(value: number): string {
  return `${value} day${value === 1 ? '' : 's'}`;
}

function paint(text: string, color: AnsiColor, enabled: boolean): string {
  return enabled ? `\u001b[${ANSI[color]}m${text}\u001b[0m` : text;
}
