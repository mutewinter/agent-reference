#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { parseArgv, type CliOptions } from './args.ts';
import { displayPath as shortenPath } from './fs-utils.ts';
import { cloneReferences } from './core.ts';
import { dependencyKey } from './package-utils.ts';
import { KEEP_REFERENCE_NOTE } from './problems.ts';
import { getStatusReport } from './status.ts';
import { formatBytes, inspectStore, type StoreReport } from './store.ts';
import { validateConfig, type ValidationReport } from './validate.ts';
import type {
  AgentReferenceProblem,
  AgentReferenceStatusEntry,
  AgentReferenceStatusReport,
  CloneReferencesResult
} from './types.ts';

async function main(argv: string[]): Promise<void> {
  const options = parseArgv(argv);

  switch (options.command) {
    case 'help':
      process.stdout.write(helpText());
      return;
    case 'version': {
      const packageJson = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url), 'utf8')) as {
        version: string;
      };
      process.stdout.write(`${packageJson.version}\n`);
      return;
    }
    case 'schema':
      process.stdout.write(await fs.readFile(new URL('../schema/agent-reference.schema.json', import.meta.url), 'utf8'));
      return;
    case 'status': {
      const { projectPath, references } = await splitPositionals(options);
      const report = await getStatusReport(projectPath, { references, groups: options.groups });
      write(options, report, formatStatusReport);
      return;
    }
    case 'clone': {
      const { projectPath, references } = await splitPositionals(options);
      const result = await cloneReferences(projectPath, { references, groups: options.groups });
      write(options, result, formatCloneResult);
      return;
    }
    case 'validate': {
      const { projectPath } = await splitPositionals(options);
      const report = await validateConfig(projectPath);
      write(options, report, formatValidationReport);
      if (!report.valid) process.exitCode = 1;
      return;
    }
    case 'store': {
      const report = await inspectStore({ prune: options.prune, days: options.days ?? undefined });
      write(options, report, formatStoreReport);
      return;
    }
  }
}

/**
 * `agent-reference clone zod` is what an agent writes first, so a bare name that is not a
 * path on disk is a reference selector rather than a project path.
 */
async function splitPositionals(options: CliOptions): Promise<{ projectPath: string | null; references: string[] }> {
  let projectPath: string | null = null;
  const references: string[] = [];

  for (const value of options.positionals) {
    if (projectPath === null && (await looksLikePath(value))) {
      projectPath = value;
    } else {
      references.push(value);
    }
  }

  return { projectPath, references };
}

async function looksLikePath(value: string): Promise<boolean> {
  if (value.startsWith('.') || value.startsWith('~') || path.isAbsolute(value)) return true;
  // A scoped package name contains a slash, so only check the filesystem for the rest.
  if (value.includes('/') && !value.startsWith('@')) return true;
  return Boolean(await fs.stat(value).catch(() => null));
}

function write<T>(options: CliOptions, result: T, format: (result: T) => string): void {
  process.stdout.write(options.json ? `${JSON.stringify(result, null, 2)}\n` : format(result));
}

function displayPath(value: string | null): string {
  return shortenPath(value, { tilde: Boolean(process.stdout.isTTY) });
}

function formatStatusReport(report: AgentReferenceStatusReport): string {
  const sections: string[] = [];

  // Anything actionable goes first: a reader that stops early must still see the work.
  if (report.nextSteps.length > 0) {
    sections.push(`next steps:\n${report.nextSteps.map((step) => `  ${step}`).join('\n')}\n`);
  }
  if (report.problems.length > 0) {
    sections.push(`problems:\n${report.problems.map(formatProblem).join('\n')}\n\n  ${KEEP_REFERENCE_NOTE}\n`);
  }

  sections.push(formatStatusTable(report.references));

  const described = report.references.filter((entry) => entry.description);
  if (described.length > 0) {
    sections.push(`notes:\n${described.map((entry) => `  ${entry.name}: ${entry.description}`).join('\n')}\n`);
  }

  if (report.groups.length > 0) {
    const lines = report.groups.map(
      (group) =>
        `  ${group.name}${group.description ? `: ${group.description}` : ''}\n    ${group.references.join(', ') || '(no members)'}`
    );
    sections.push(`groups:\n${lines.join('\n')}\n`);
  }

  return sections.join('\n');
}

function formatCloneResult(result: CloneReferencesResult): string {
  const lines = [
    ...result.cloned.map(
      (clone) =>
        `${dependencyKey(clone.dependency.name, clone.dependency.version)} -> ${displayPath(clone.packagePath)} (${clone.confidence}, ${clone.refSource} ${clone.checkoutRef})`
    ),
    ...result.skipped.map(
      (skip) => `${skip.version ? dependencyKey(skip.name, skip.version) : skip.name} skipped: ${skip.reason}`
    ),
    ...result.clonedGit.map((clone) => `git:${clone.name} -> ${displayPath(clone.worktreePath)}`),
    ...result.folders.map((name) => `folder:${name} is already local, nothing to clone`),
    `manifest -> ${displayPath(result.manifestPath)}`,
    ...(result.problems.length > 0
      ? ['', `problems:\n${result.problems.map(formatProblem).join('\n')}`, `  ${KEEP_REFERENCE_NOTE}`]
      : [])
  ];
  return `${lines.join('\n')}\n`;
}

function formatProblem(problem: AgentReferenceProblem): string {
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

function formatStatusTable(entries: AgentReferenceStatusEntry[]): string {
  const showGroups = entries.some((entry) => entry.groups.length > 0);
  const headers = ['kind', 'name', 'current', 'cloned', 'status', ...(showGroups ? ['groups'] : []), 'path'];
  const rows = entries.map((entry) => [
    entry.kind,
    entry.name,
    entry.currentVersion ?? '-',
    entry.clonedVersion ?? '-',
    entry.status,
    ...(showGroups ? [entry.groups.join(',') || '-'] : []),
    displayPath(entry.path)
  ]);

  if (rows.length === 0) return 'No references configured. See agent-reference schema for the config format.\n';

  const widths = headers.map((header, index) => Math.max(header.length, ...rows.map((row) => row[index]?.length ?? 0)));
  const formatRow = (row: string[]): string => row.map((value, index) => value.padEnd(widths[index] ?? 0)).join('  ');

  return `${formatRow(headers)}\n${formatRow(widths.map((width) => '-'.repeat(width)))}\n${rows.map(formatRow).join('\n')}\n`;
}

function formatStoreReport(report: StoreReport): string {
  const lines = [displayPath(report.storeDir), ''];

  if (report.repositories.length === 0) {
    lines.push('empty. agent-reference clone fills it.');
    return `${lines.join('\n')}\n`;
  }

  const rows = report.repositories.map((repository) => [
    repository.name,
    formatBytes(repository.totalBytes),
    `${repository.checkouts.length} checkout${repository.checkouts.length === 1 ? '' : 's'}`
  ]);
  const width = Math.max(...rows.map((row) => row[0]?.length ?? 0));
  const size = Math.max(...rows.map((row) => row[1]?.length ?? 0));
  for (const [name, bytes, checkouts] of rows) {
    lines.push(`  ${(name ?? '').padEnd(width)}  ${(bytes ?? '').padStart(size)}  ${checkouts}`);
  }

  lines.push('', `total ${formatBytes(report.totalBytes)}`);
  if (report.removed.length > 0) {
    lines.push(`removed ${report.removed.length}, reclaiming ${formatBytes(report.reclaimedBytes)}`);
  } else {
    lines.push('Everything here is a cache: agent-reference store --prune trims it, and clone rebuilds.');
  }

  return `${lines.join('\n')}\n`;
}

function formatValidationReport(report: ValidationReport): string {
  const lines = [
    ...report.errors.map((error) => `error: ${error}`),
    ...report.warnings.map((warning) => `warning: ${warning}`)
  ];

  if (report.valid) {
    const references = report.references.length === 1 ? '1 reference' : `${report.references.length} references`;
    const groups = report.groups.length === 1 ? '1 group' : `${report.groups.length} groups`;
    lines.push(`ok: ${displayPath(report.configPath ?? report.localConfigPath)} defines ${references} in ${groups}.`);
  }

  return `${lines.join('\n')}\n`;
}

function helpText(): string {
  return `agent-reference

Keeps upstream source for a project's references checked out locally, so an agent
can read the real thing instead of guessing.

Usage:
  agent-reference status [reference...] [--group <name>] [--json]
  agent-reference clone  [reference...] [--group <name>] [--json]
  agent-reference validate
  agent-reference schema
  agent-reference store [--prune] [--days <n>]

Commands:
  status    Report every reference with its absolute path, plus problems and next steps.
  clone     Materialize configured references into the machine-wide store.
  validate  Check agent-reference.json and report located errors.
  schema    Print the JSON Schema for agent-reference.json.
  store     Show what the store holds and how big it is. --prune deletes
            checkouts unused for --days (default 30) and any repository left
            with none; clone rebuilds anything it removes.

A positional is a reference name, or a project directory / package.json path.
With none, every configured reference is used.

Options:
  --group <name>  Select every reference in a configured group. Repeatable.
  --json          Print machine-readable JSON.
  --prune         For store: delete stale checkouts.
  --days <n>      For store --prune: age threshold in days. Default 30.

References are declared in agent-reference.json, which you edit directly. Run
\`agent-reference schema\` for the format and \`agent-reference validate\` to check it.
The store lives in ~/.agent-reference. Set AGENT_REFERENCE_STORE_DIR to move it.
`;
}

main(process.argv.slice(2)).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`agent-reference: ${message}\n`);
  process.exitCode = 1;
});
