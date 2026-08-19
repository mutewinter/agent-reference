import path from 'node:path';

import { displayPath } from './fs-utils.ts';
import { getCommand, KEEP_REFERENCE_NOTE } from './problems.ts';
import type {
  AgentReferenceProblem,
  AgentReferenceStatusEntry,
  AgentReferenceStatusReport
} from './types.ts';

export interface StatusFormatOptions {
  /** ANSI color. Callers decide from the stream: a TTY without NO_COLOR set. */
  color: boolean;
  /** Shorten home paths to `~/...`. Only for humans; piped output keeps literal paths. */
  tilde: boolean;
}

const ANSI = { green: '32', yellow: '33', red: '31', dim: '2' } as const;

type AnsiColor = keyof typeof ANSI;

const STATUS_COLORS: Partial<Record<AgentReferenceStatusEntry['status'], AnsiColor>> = {
  ready: 'green',
  stale: 'yellow',
  missing: 'red',
  'not-installed': 'red',
  unresolvable: 'red'
};

/**
 * Status for humans and agents alike: references grouped under the config file that
 * declared them, one self-describing line each, with fields present only when they carry
 * data. `--json` is the machine format; nothing here needs to be parsed positionally.
 */
export function formatStatusReport(report: AgentReferenceStatusReport, options: StatusFormatOptions): string {
  const sections: string[] = [];

  // Anything actionable goes first: a reader that stops early must still see the work.
  if (report.nextSteps.length > 0) {
    sections.push(`next steps:\n${report.nextSteps.map((step) => `  ${step}`).join('\n')}\n`);
  }
  if (report.problems.length > 0) {
    sections.push(`problems:\n${report.problems.map(formatProblem).join('\n')}\n\n  ${KEEP_REFERENCE_NOTE}\n`);
  }

  if (report.references.length === 0) {
    sections.push(emptyStateHint(report));
    return sections.join('\n');
  }

  const shared = report.references.filter((entry) => entry.scope !== 'local');
  const local = report.references.filter((entry) => entry.scope === 'local');
  if (shared.length > 0) {
    sections.push(
      scopeSection(fileLabel(report.configPath, 'agent-reference.json', 'shared'), shared, report.sets, options)
    );
  }
  if (local.length > 0) {
    sections.push(
      scopeSection(
        fileLabel(report.localConfigPath, 'agent-reference.local.json', 'this machine'),
        local,
        report.sets,
        options
      )
    );
  }

  const footer = footerLine(report, options);
  if (footer) sections.push(footer);

  return sections.join('\n');
}

export function formatProblem(problem: AgentReferenceProblem): string {
  const lines = [
    `  [${problem.severity}] ${problem.reference ? `${problem.reference}: ` : ''}${problem.summary}`,
    `    fix: ${problem.fix}`
  ];

  if (problem.configPatch) {
    const patch = JSON.stringify(problem.configPatch, null, 2)
      .split('\n')
      .map((line) => `    ${line}`)
      .join('\n');
    lines.push(`    add to agent-reference.json:\n${patch}`);
  }

  return lines.join('\n');
}

/**
 * Sets render as their own subsections, headed by the set's description, so the output
 * reads the way the collections were written: a labeled list. An entry belonging to two
 * sets appears under both, which is repetition, not state.
 */
function scopeSection(
  header: string,
  entries: AgentReferenceStatusEntry[],
  sets: AgentReferenceStatusReport['sets'],
  options: StatusFormatOptions
): string {
  const lines = [paint(header, 'dim', options.color)];

  const unset = entries.filter((entry) => entry.sets.length === 0);
  lines.push(...entryLines(unset, 2, options));

  for (const set of sets) {
    const label = set.name ?? set.description;
    const members = entries.filter((entry) => entry.sets.includes(label));
    if (members.length === 0) continue;
    if (lines.length > 1) lines.push('');
    lines.push(`  ${set.description}`);
    lines.push(...entryLines(members, 4, options));
  }

  return `${lines.join('\n')}\n`;
}

function entryLines(entries: AgentReferenceStatusEntry[], indent: number, options: StatusFormatOptions): string[] {
  if (entries.length === 0) return [];
  const width = Math.max(...entries.map((entry) => entry.name.length)) + 2;
  const pad = ' '.repeat(indent);
  const lines: string[] = [];

  for (const entry of entries) {
    const fragments = [entry.kind, paintStatus(entry, options.color), ...primaryFragments(entry, options)];
    lines.push(`${pad}${entry.name.padEnd(width)}${fragments.join(' · ')}`);
    if (entry.description) {
      lines.push(`${pad}${' '.repeat(width)}${paint(`"${entry.description}"`, 'dim', options.color)}`);
    }
  }

  return lines;
}

/** The datum that matters for this entry right now; never a `-` placeholder. */
function primaryFragments(entry: AgentReferenceStatusEntry, options: StatusFormatOptions): string[] {
  const shownPath = (): string => displayPath(entry.path, { tilde: options.tilde });

  if (entry.kind === 'folder') {
    return [shownPath()];
  }

  if (entry.kind === 'git') {
    if (entry.status === 'ready') return [shownPath()];
    if (entry.status === 'stale') return [entry.requested ?? '', getCommand(entry.name)];
    return [entry.requested ?? ''];
  }

  switch (entry.status) {
    case 'ready':
      return [`${entry.currentVersion}${entry.confidence ? ` ${entry.confidence}` : ''}`, shownPath()];
    case 'stale':
      return [`lockfile ${entry.currentVersion}, checkout ${entry.clonedVersion}`, getCommand(entry.name)];
    case 'declared':
      return entry.currentVersion ? [entry.currentVersion] : [];
    case 'not-installed':
      return ['configured "installed", not in the lockfile'];
    default:
      return ['see problems above'];
  }
}

function footerLine(report: AgentReferenceStatusReport, options: StatusFormatOptions): string | null {
  const parts: string[] = [];
  if (report.summary.declared > 0) parts.push(`${report.summary.declared} declared`);
  if (report.summary.stale > 0) parts.push(paint(`${report.summary.stale} stale`, 'yellow', options.color));
  if (parts.length === 0) return null;

  if (report.summary.declared > 0) parts.push('nothing fetched until needed');
  parts.push('agent-reference get <name>');
  return `${parts.join(' · ')}\n`;
}

/**
 * An empty status is the front door, so it explains the tool instead of shrugging. The
 * strongest hint is that `get` already works here with no setup at all.
 */
function emptyStateHint(report: AgentReferenceStatusReport): string {
  const lines = [
    'No references configured here.',
    '',
    'agent-reference get <spec> materializes readable source on demand, no config needed:',
    '  a dependency name, name@version, owner/repo, a git URL, or file:../repo'
  ];

  if (report.installedPackageCount > 0) {
    const count = report.installedPackageCount;
    lines.push(
      `  This project's lockfile holds ${count} ${count === 1 ? 'dependency' : 'dependencies'}; any of their names works.`
    );
  }

  lines.push(
    '',
    'Declare durable references in agent-reference.json (committed, shareable) or',
    'agent-reference.local.json (machine paths, gitignored). agent-reference schema prints the format.',
    ''
  );

  return lines.join('\n');
}

function fileLabel(configPath: string | null, fallback: string, label: string): string {
  return `${configPath ? path.basename(configPath) : fallback} (${label})`;
}

function paintStatus(entry: AgentReferenceStatusEntry, color: boolean): string {
  const code = STATUS_COLORS[entry.status];
  return code ? paint(entry.status, code, color) : entry.status;
}

function paint(text: string, color: AnsiColor, enabled: boolean): string {
  return enabled ? `\u001b[${ANSI[color]}m${text}\u001b[0m` : text;
}
