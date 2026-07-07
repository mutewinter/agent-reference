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
import type { PackageReference, AgentReferenceStatusEntry } from './types.ts';

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
    case 'list': {
      const dependencies = await scanProject(options.projectPath, { allImporters: options.allImporters });
      printResult(options, dependencies, formatDependencyTable);
      return;
    }
    case 'status': {
      const report = await getStatusReport(options.projectPath, {
        allImporters: options.allImporters,
        configFile: options.configFile
      });
      printResult(options, report, (result) => formatStatusTable(result.references));
      return;
    }
    case 'init':
      return runInit(options);
    case 'clone':
      return runClone(options);
  }
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

  printResult(options, result, () => `config -> ${result.configPath}\n`);
}

async function runClone(options: CliOptions): Promise<void> {
  const packages = await resolvePackageSelection(options, !(await hasCloneConfig(options)));
  const result = await cloneReferences(options.projectPath, {
    all: options.all,
    packages,
    allImporters: options.allImporters,
    registry: options.registry ?? undefined,
    metadataMap: await loadMetadataFile(options.metadataFile),
    bareStoreDir: options.bareStoreDir ?? undefined,
    worktreeRoot: options.worktreeRoot ?? undefined,
    configFile: options.configFile,
    force: options.force
  });

  printResult(options, result, () => {
    const lines = [
      ...result.cloned.map((clone) => `${dependencyKey(clone.dependency.name, clone.dependency.version)} -> ${clone.worktreePath}`),
      ...result.skipped.map((skip) => `${skip.version ? dependencyKey(skip.name, skip.version) : skip.name} skipped: ${skip.reason}`),
      ...result.clonedGit.map((clone) => `git:${clone.name} -> ${clone.worktreePath}`),
      `manifest -> ${result.manifestPath}`
    ];
    return `${lines.join('\n')}\n`;
  });
}

async function resolvePackageSelection(options: CliOptions, promptWhenEmpty: boolean): Promise<string[]> {
  const canPrompt =
    !options.all && options.packages.length === 0 && !options.nonInteractive && process.stdin.isTTY && promptWhenEmpty;
  if (!canPrompt) return options.packages;

  const dependencies = await scanProject(options.projectPath, { allImporters: options.allImporters });
  return promptForPackages(dependencies);
}

function printResult<T>(options: CliOptions, result: T, format: (result: T) => string): void {
  process.stdout.write(options.json ? `${JSON.stringify(result, null, 2)}\n` : format(result));
}

function formatStatusTable(entries: AgentReferenceStatusEntry[]): string {
  const rows = entries.map((entry) => [
    entry.kind,
    entry.name,
    entry.currentVersion ?? '-',
    entry.clonedVersion ?? '-',
    entry.status,
    entry.path ?? '-'
  ]);
  return formatTable(['kind', 'name', 'current', 'cloned', 'status', 'path'], rows, 'No dependency references found.\n');
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
  agent-reference list [project-or-package.json] [--json] [--all-importers]
  agent-reference status [project-or-package.json] [--json]
  agent-reference init [project-or-package.json] --package react [--package zod]
  agent-reference clone [project-or-package.json] --package react [--package zod] [--json]
  agent-reference clone [project-or-package.json] --non-interactive
  agent-reference clone [project-or-package.json] --all --non-interactive

Options:
  --all                 Clone every discovered direct dependency.
  --package, -p <name>  Clone a dependency by name or name@version. Repeatable.
  --all-importers       Scan every PNPM lockfile importer in a workspace.
  --config <path>       Config file. Defaults to agent-reference.json in the project root.
  --metadata-file <json> Use npm metadata from a local JSON map.
  --registry <url>      npm registry base URL. Defaults to https://registry.npmjs.org.
  --cache-dir <dir>     Global bare repository store. Also accepted: --store-dir.
  --worktree-dir <dir>  Project-visible dependency worktree directory.
  --non-interactive     Fail instead of prompting when no package is selected.
  --json                Print machine-readable JSON.
  --force               Reuse an existing worktree path even if it differs.
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
