#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { parseArgv, type CliOptions } from './args.ts';
import { displayPath as shortenPath } from './fs-utils.ts';
import { cloneReferences } from './core.ts';
import { getReferences } from './get.ts';
import { dependencyKey } from './package-utils.ts';
import { KEEP_REFERENCE_NOTE } from './problems.ts';
import { formatProblem, formatStatusReport } from './status-format.ts';
import { getStatusReport } from './status.ts';
import { formatBytes, inspectStore, type StoreReport } from './store.ts';
import { validateConfig, type ValidationReport } from './validate.ts';
import type { CloneReferencesResult, GetReferenceResult } from './types.ts';

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
      const humanOutput = Boolean(process.stdout.isTTY);
      write(options, report, (result) =>
        formatStatusReport(result, { color: humanOutput && !process.env.NO_COLOR, tilde: humanOutput })
      );
      return;
    }
    case 'get': {
      // Every positional is a spec: get runs against the current directory's project, and
      // specs like github:owner/repo would be misread as paths by splitPositionals.
      const results = await getReferences(null, options.positionals);
      write(options, results, formatGetResults);
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

function formatGetResults(results: GetReferenceResult[]): string {
  const lines = results.map((result) => {
    if (result.kind === 'package') {
      return `${dependencyKey(result.name, result.version ?? '')} -> ${displayPath(result.path)} (${result.confidence}, ${result.refSource} ${result.checkoutRef})`;
    }
    if (result.kind === 'git') {
      return `${result.requested} -> ${displayPath(result.path)} (${result.checkoutRef} @ ${result.checkoutSha?.slice(0, 12)})`;
    }
    return `${result.name} -> ${displayPath(result.path)}`;
  });
  return `${lines.join('\n')}\n`;
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
    `state -> ${displayPath(result.manifestPath)}`,
    ...(result.problems.length > 0
      ? ['', `problems:\n${result.problems.map(formatProblem).join('\n')}`, `  ${KEEP_REFERENCE_NOTE}`]
      : [])
  ];
  return `${lines.join('\n')}\n`;
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

Gives an agent readable upstream source on demand: dependencies at their exact
installed version, git repositories, and local folders, all by name. Nothing is
fetched until asked for.

Usage:
  agent-reference get <spec>... [--json]
  agent-reference status [reference...] [--group <name>] [--json]
  agent-reference clone  [reference...] [--group <name>] [--json]
  agent-reference validate
  agent-reference schema
  agent-reference store [--prune] [--days <n>]

Commands:
  get       Materialize one reference and print its path. A spec is a configured
            reference name, a dependency name (version from the lockfile), a
            name@version, github:owner/repo, owner/repo, a git URL, or file:../repo.
            Works with no config and no project at all.
  status    Report every configured reference: scope, state, and absolute path.
            Declared-but-not-fetched is the normal state, not a problem.
  clone     Bulk prefetch every configured reference, for CI or a long flight.
  validate  Check agent-reference.json and agent-reference.local.json; flags
            machine paths that do not belong in the committed file.
  schema    Print the JSON Schema for agent-reference.json.
  store     Show what the store holds and how big it is. --prune deletes
            checkouts unused for --days (default 30) and any repository left
            with none; everything pruned is refetched on the next get.

Options:
  --group <name>  Select every reference in a configured group. Repeatable.
  --json          Print machine-readable JSON.
  --prune         For store: delete stale checkouts.
  --days <n>      For store --prune: age threshold in days. Default 30.

References are declared in agent-reference.json (committed, shareable) and
agent-reference.local.json (gitignored, machine paths and private references).
Edit the JSON directly; run \`agent-reference validate\` after. The store lives
in ~/.agent-reference. Set AGENT_REFERENCE_STORE_DIR to move it.
`;
}

main(process.argv.slice(2)).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`agent-reference: ${message}\n`);
  process.exitCode = 1;
});
