#!/usr/bin/env node
import fs from 'node:fs/promises';
import process from 'node:process';
import readline from 'node:readline/promises';

import { parseArgv } from './args.ts';
import { loadDepCloneConfig } from './config.ts';
import { cloneDependencies, initConfig, listDependencies } from './core.ts';
import { loadMetadataFile } from './metadata.ts';
import { dependencyKey } from './package-utils.ts';
import { resolveProjectInput } from './scanner.ts';
import type { DepCloneDependency } from './types.ts';

async function main(argv: string[]): Promise<void> {
  const options = parseArgv(argv);

  if (options.command === 'help') {
    process.stdout.write(helpText());
    return;
  }

  if (options.command === 'version') {
    const packageJson = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url), 'utf8')) as {
      version: string;
    };
    process.stdout.write(`${packageJson.version}\n`);
    return;
  }

  if (options.command === 'list') {
    const dependencies = await listDependencies(options.projectPath, {
      allImporters: options.allImporters
    });
    process.stdout.write(options.json ? `${JSON.stringify(dependencies, null, 2)}\n` : formatDependencyTable(dependencies));
    return;
  }

  if (options.command === 'init') {
    let packages = options.packages;
    let all = options.all;

    if (!all && packages.length === 0 && !options.nonInteractive && process.stdin.isTTY) {
      const dependencies = await listDependencies(options.projectPath, {
        allImporters: options.allImporters
      });
      packages = await promptForPackages(dependencies);
      all = false;
    }

    const result = await initConfig(options.projectPath, {
      all,
      packages,
      allImporters: options.allImporters,
      registry: options.registry ?? undefined,
      worktreeRoot: options.worktreeRoot ?? undefined,
      force: options.force,
      configFile: options.configFile
    });

    if (options.json) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return;
    }

    process.stdout.write(`config -> ${result.configPath}\n`);
    return;
  }

  const metadataMap = await loadMetadataFile(options.metadataFile);
  let packages = options.packages;
  let all = options.all;

  if (!all && packages.length === 0 && !options.nonInteractive && process.stdin.isTTY && !await hasCloneConfig(options.projectPath, options.configFile)) {
    const dependencies = await listDependencies(options.projectPath, {
      allImporters: options.allImporters
    });
    packages = await promptForPackages(dependencies);
    all = false;
  }

  const result = await cloneDependencies(options.projectPath, {
    all,
    packages,
    allImporters: options.allImporters,
    registry: options.registry ?? undefined,
    metadataMap,
    bareStoreDir: options.bareStoreDir ?? undefined,
    worktreeRoot: options.worktreeRoot ?? undefined,
    configFile: options.configFile,
    force: options.force
  });

  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  for (const clone of result.cloned) {
    process.stdout.write(`${dependencyKey(clone.dependency.name, clone.dependency.version)} -> ${clone.worktreePath}\n`);
  }
  for (const skipped of result.skipped) {
    process.stdout.write(`${dependencyKey(skipped.dependency.name, skipped.dependency.version)} skipped: ${skipped.reason}\n`);
  }
  process.stdout.write(`manifest -> ${result.manifestPath}\n`);
}

function formatDependencyTable(dependencies: DepCloneDependency[]): string {
  if (dependencies.length === 0) return 'No dependencies found.\n';

  const rows = dependencies.map((dependency) => [
    dependency.name,
    dependency.version,
    dependency.dependencyTypes.join(','),
    dependency.importers.join(',')
  ]);
  const headers = ['name', 'version', 'type', 'importer'];
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => row[index]?.length ?? 0))
  );
  const formatRow = (row: string[]): string =>
    row.map((value, index) => value.padEnd(widths[index] ?? 0)).join('  ');

  return `${formatRow(headers)}\n${formatRow(widths.map((width) => '-'.repeat(width)))}\n${rows
    .map(formatRow)
    .join('\n')}\n`;
}

async function promptForPackages(dependencies: DepCloneDependency[]): Promise<string[]> {
  process.stdout.write(formatDependencyChoices(dependencies));
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
    .filter((value) => Number.isInteger(value) && value > 0 && value <= dependencies.length);

  return selections.map((selection) => {
    const dependency = dependencies[selection - 1];
    if (!dependency) {
      throw new Error(`Invalid selection ${selection}`);
    }
    return dependencyKey(dependency.name, dependency.version);
  });
}

function formatDependencyChoices(dependencies: DepCloneDependency[]): string {
  return dependencies
    .map((dependency, index) => `${index + 1}. ${dependencyKey(dependency.name, dependency.version)}`)
    .join('\n')
    .concat('\n');
}

function helpText(): string {
  return `depclone

Usage:
  depclone list [project-or-package.json] [--json] [--all-importers]
  depclone init [project-or-package.json] --package react [--package zod]
  depclone clone [project-or-package.json] --package react [--package zod] [--json]
  depclone clone [project-or-package.json] --non-interactive
  depclone clone [project-or-package.json] --all --non-interactive

Options:
  --all                 Clone every discovered direct dependency.
  --package, -p <name>  Clone a dependency by name or name@version. Repeatable.
  --all-importers       Scan every PNPM lockfile importer in a workspace.
  --config <path>       Config file. Defaults to depclone.config.json in the project root.
  --metadata-file <json> Use npm metadata from a local JSON map.
  --registry <url>      npm registry base URL. Defaults to https://registry.npmjs.org.
  --cache-dir <dir>     Global bare repository store. Also accepted: --store-dir.
  --worktree-dir <dir>  Project-visible dependency worktree directory.
  --non-interactive     Fail instead of prompting when no package is selected.
  --json                Print machine-readable JSON.
  --force               Reuse an existing worktree path even if it differs.
`;
}

async function hasCloneConfig(projectPath: string | null, configFile: string | null): Promise<boolean> {
  const context = await resolveProjectInput(projectPath);
  const loaded = await loadDepCloneConfig(context.projectRoot, { configFile });
  return loaded !== null;
}

main(process.argv.slice(2)).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`depclone: ${message}\n`);
  process.exitCode = 1;
});
