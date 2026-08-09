#!/usr/bin/env node
import fs from 'node:fs/promises';
import process from 'node:process';
import readline from 'node:readline/promises';

import { parseArgv, type CliOptions } from './args.ts';
import { loadAgentReferenceConfig } from './config.ts';
import { cloneReferences, initConfig } from './core.ts';
import { dependencyKey } from './package-utils.ts';
import { loadMetadataFile } from './registry.ts';
import { resolveProjectInput, scanProject } from './scanner.ts';
import { getStatusReport } from './status.ts';
import { validateConfig, type ValidationReport } from './validate.ts';
import type {
  AgentReferenceProblem,
  AgentReferenceStatusReport,
  PackageReference,
  AgentReferenceStatusEntry
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
    case 'list': {
      const dependencies = await scanProject(options.projectPath, { allImporters: options.allImporters });
      printResult(options, dependencies, formatDependencyTable);
      return;
    }
    case 'status': {
      const report = await getStatusReport(options.projectPath, {
        allImporters: options.allImporters,
        configFile: options.configFile,
        groups: options.groups,
        references: options.references,
        storeDir: options.storeDir ?? undefined,
        worktreeRoot: options.worktreeRoot ?? undefined,
        gitBin: options.gitBin ?? undefined
      });
      printResult(options, report, formatStatusReport);
      return;
    }
    case 'validate':
      return runValidate(options);
    case 'init':
      return runInit(options);
    case 'clone':
      return runClone(options);
  }
}

async function runValidate(options: CliOptions): Promise<void> {
  const report = await validateConfig(options.projectPath, { configFile: options.configFile });
  printResult(options, report, formatValidationReport);
  if (!report.valid) process.exitCode = 1;
}

async function runInit(options: CliOptions): Promise<void> {
  const packages = await resolvePackageSelection(options, true);
  const result = await initConfig(options.projectPath, {
    all: options.all,
    packages,
    allImporters: options.allImporters,
    registry: options.registry ?? undefined,
    worktreeRoot: options.worktreeRoot ?? undefined,
    force: options.force,
    configFile: options.configFile
  });

  printResult(
    options,
    result,
    () => `config -> ${result.configPath}\ntip: install the agent skill with: npx skills add mutewinter/agent-reference\n`
  );
}

async function runClone(options: CliOptions): Promise<void> {
  const packages = await resolvePackageSelection(options, !(await hasCloneConfig(options)));
  const result = await cloneReferences(options.projectPath, {
    all: options.all,
    packages,
    groups: options.groups,
    references: options.references,
    allImporters: options.allImporters,
    registry: options.registry ?? undefined,
    metadataMap: await loadMetadataFile(options.metadataFile),
    storeDir: options.storeDir ?? undefined,
    worktreeRoot: options.worktreeRoot ?? undefined,
    configFile: options.configFile,
    gitBin: options.gitBin ?? undefined,
    force: options.force
  });

  printResult(options, result, () => {
    const lines = [
      ...result.cloned.map(
        (clone) =>
          `${dependencyKey(clone.dependency.name, clone.dependency.version)} -> ${clone.packagePath} (${clone.confidence}, ${clone.refSource} ${clone.checkoutRef})`
      ),
      ...result.skipped.map((skip) => `${skip.version ? dependencyKey(skip.name, skip.version) : skip.name} skipped: ${skip.reason}`),
      ...result.clonedGit.map((clone) => `git:${clone.name} -> ${clone.worktreePath}`),
      ...result.folders.map((name) => `folder:${name} is already local, nothing to clone`),
      `manifest -> ${result.manifestPath}`,
      ...(result.unresolved.length > 0
        ? ['', 'Run agent-reference status for the fix for each unresolved reference.']
        : [])
    ];
    return `${lines.join('\n')}\n`;
  });
}

async function resolvePackageSelection(options: CliOptions, promptWhenEmpty: boolean): Promise<string[]> {
  const canPrompt =
    !options.all &&
    options.packages.length === 0 &&
    options.groups.length === 0 &&
    options.references.length === 0 &&
    !options.nonInteractive &&
    process.stdin.isTTY &&
    promptWhenEmpty;
  if (!canPrompt) return options.packages;

  const dependencies = await scanProject(options.projectPath, { allImporters: options.allImporters });
  return promptForPackages(dependencies);
}

function printResult<T>(options: CliOptions, result: T, format: (result: T) => string): void {
  process.stdout.write(options.json ? `${JSON.stringify(result, null, 2)}\n` : format(result));
}

function formatStatusReport(report: AgentReferenceStatusReport): string {
  const sections = [formatStatusTable(report.references)];

  const described = report.references.filter((entry) => entry.description);
  if (described.length > 0) {
    sections.push(`notes:\n${described.map((entry) => `  ${entry.name}: ${entry.description}`).join('\n')}\n`);
  }

  if (report.groups.length > 0) {
    const lines = report.groups.map((group) => {
      const heading = `  ${group.name}${group.description ? `: ${group.description}` : ''}`;
      return `${heading}\n    ${group.references.join(', ') || '(no members)'}`;
    });
    sections.push(`groups:\n${lines.join('\n')}\n`);
  }

  if (report.problems.length > 0) {
    sections.push(`problems:\n${report.problems.map(formatProblem).join('\n')}\n`);
  }

  if (report.nextSteps.length > 0) {
    sections.push(`next steps:\n${report.nextSteps.map((step) => `  ${step}`).join('\n')}\n`);
  }

  return sections.join('\n');
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
    entry.path ?? '-'
  ]);
  return formatTable(headers, rows, 'No dependency references found.\n');
}

function formatValidationReport(report: ValidationReport): string {
  const lines: string[] = [];

  for (const error of report.errors) lines.push(`error: ${error}`);
  for (const warning of report.warnings) lines.push(`warning: ${warning}`);

  if (report.valid) {
    const groups = report.groups.length === 1 ? '1 group' : `${report.groups.length} groups`;
    const references = report.references.length === 1 ? '1 reference' : `${report.references.length} references`;
    lines.push(`ok: ${report.configPath ?? report.localConfigPath} defines ${references} in ${groups}.`);
  }

  return `${lines.join('\n')}\n`;
}

function formatDependencyTable(dependencies: PackageReference[]): string {
  const rows = dependencies.map((dependency) => [
    dependency.name,
    dependency.version,
    dependency.dependencyTypes.join(','),
    dependency.importers.join(',')
  ]);
  return formatTable(['name', 'version', 'type', 'importer'], rows, 'No dependencies found.\n');
}

function formatTable(headers: string[], rows: string[][], emptyMessage: string): string {
  if (rows.length === 0) return emptyMessage;

  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => row[index]?.length ?? 0))
  );
  const formatRow = (row: string[]): string =>
    row.map((value, index) => value.padEnd(widths[index] ?? 0)).join('  ');

  return `${formatRow(headers)}\n${formatRow(widths.map((width) => '-'.repeat(width)))}\n${rows
    .map(formatRow)
    .join('\n')}\n`;
}

async function promptForPackages(dependencies: PackageReference[]): Promise<string[]> {
  const choices = dependencies
    .map((dependency, index) => `${index + 1}. ${dependencyKey(dependency.name, dependency.version)}`)
    .join('\n');
  process.stdout.write(`${choices}\n`);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  const answer = await rl.question('Clone packages (numbers, comma-separated, or "all"): ');
  rl.close();

  if (answer.trim().toLowerCase() === 'all') {
    return dependencies.map((dependency) => dependencyKey(dependency.name, dependency.version));
  }

  const selections = answer
    .split(',')
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((value) => Number.isInteger(value) && value > 0);

  return selections.map((selection) => {
    const dependency = dependencies[selection - 1];
    if (!dependency) {
      throw new Error(`Invalid selection ${selection}`);
    }
    return dependencyKey(dependency.name, dependency.version);
  });
}

function helpText(): string {
  return `agent-reference

Usage:
  agent-reference status [project-or-package.json] [--group <name>] [--json]
  agent-reference list [project-or-package.json] [--json] [--all-importers]
  agent-reference clone [project-or-package.json] [--package react] [--group docs] [--non-interactive]
  agent-reference clone [project-or-package.json] --all --non-interactive
  agent-reference init [project-or-package.json] --package react [--package zod]
  agent-reference validate [project-or-package.json] [--json]
  agent-reference schema

Options:
  --all                 Clone every discovered direct dependency.
  --package, -p <name>  Select a dependency by name or name@version. Repeatable.
  --group, -g <name>    Select every reference in a configured group. Repeatable.
  --reference <name>    Select one reference by name, or kind:name. Repeatable.
  --all-importers       Scan every PNPM lockfile importer in a workspace.
  --config <path>       Config file. Defaults to agent-reference.json in the project root.
  --metadata-file <json> Use npm metadata from a local JSON map.
  --registry <url>      npm registry base URL. Defaults to https://registry.npmjs.org.
  --cache-dir <dir>     Machine-wide store for bare repos and shared worktrees. Also: --store-dir.
  --worktree-dir <dir>  Project-visible dependency worktree directory.
  --git-bin <path>      git executable to use. Defaults to git on PATH.
  --non-interactive     Fail instead of prompting when no package is selected.
  --json                Print machine-readable JSON.
  --force               Reuse an existing worktree path even if it differs.

Config format: run \`agent-reference schema\` for the full JSON Schema, and
\`agent-reference validate\` after editing agent-reference.json.
`;
}

async function hasCloneConfig(options: CliOptions): Promise<boolean> {
  const context = await resolveProjectInput(options.projectPath);
  const loaded = await loadAgentReferenceConfig(context.projectRoot, { configFile: options.configFile });
  return loaded !== null;
}

main(process.argv.slice(2)).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`agent-reference: ${message}\n`);
  process.exitCode = 1;
});
