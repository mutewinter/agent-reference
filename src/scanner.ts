import fs from 'node:fs/promises';
import path from 'node:path';

import { scanBunDependencies } from './bun-lock.ts';
import { DEFAULT_CONFIG_FILE, DEFAULT_LOCAL_CONFIG_FILE } from './config.ts';
import { pathExists } from './fs-utils.ts';
import { scanNpmDependencies } from './npm-lock.ts';
import { scanPnpmDependencies } from './pnpm-lock.ts';
import { scanYarnDependencies } from './yarn-lock.ts';
import type {
  LockfileProjectContext,
  PackageManager,
  PackageReference,
  ProjectContext,
  ScanProjectOptions,
} from './types.ts';

const LOCKFILE_CANDIDATES: Array<{ file: string; packageManager: PackageManager }> = [
  { file: 'pnpm-lock.yaml', packageManager: 'pnpm' },
  { file: 'package-lock.json', packageManager: 'npm' },
  { file: 'bun.lock', packageManager: 'bun' },
  { file: 'bun.lockb', packageManager: 'bun' },
  { file: 'yarn.lock', packageManager: 'yarn' },
];

export async function resolveProjectInput(
  projectPath: string | null | undefined,
  cwd: string = process.cwd(),
): Promise<ProjectContext> {
  const input = path.resolve(cwd, projectPath ?? '.');
  const inputStat = await fs.stat(input).catch(() => null);
  if (!inputStat) {
    throw new Error(
      `No such project path: ${projectPath}. Pass a directory or package.json, or name a reference.`,
    );
  }

  let packageDir: string;
  let packageJsonPath: string | null;
  if (inputStat.isDirectory()) {
    packageDir = input;
    const candidate = path.join(input, 'package.json');
    packageJsonPath = (await pathExists(candidate)) ? candidate : null;
  } else {
    if (path.basename(input) !== 'package.json') {
      throw new Error(
        `Expected a project directory or package.json path, got ${projectPath ?? '.'}`,
      );
    }
    packageJsonPath = input;
    packageDir = path.dirname(input);
  }

  const lockfile = await findNearestLockfile(packageDir);
  const configDir = await findNearestConfigDir(packageDir);
  // Any directory is a project. The nearest config anchors it; failing that, the lockfile
  // root; failing that, the directory itself. A missing lockfile just means no packages.
  const projectRoot = configDir ?? (lockfile ? path.dirname(lockfile.path) : packageDir);

  return {
    projectRoot,
    packageJsonPath,
    lockfilePath: lockfile?.path ?? null,
    packageManager: lockfile?.packageManager ?? 'unknown',
    // Lockfile importer keys are slash-separated whatever the platform, so the relative path
    // has to be rejoined rather than used as the OS wrote it.
    importer: lockfile
      ? path.relative(path.dirname(lockfile.path), packageDir).split(path.sep).join('/') || '.'
      : '.',
  };
}

export async function scanProject(
  projectPath: string | null | undefined,
  options: ScanProjectOptions = {},
): Promise<PackageReference[]> {
  const context = await resolveProjectInput(projectPath, options.cwd);
  return scanResolvedProject(context, options);
}

export async function scanResolvedProject(
  context: ProjectContext,
  options: ScanProjectOptions = {},
): Promise<PackageReference[]> {
  if (context.lockfilePath === null) return [];
  const lockfileContext: LockfileProjectContext = {
    ...context,
    lockfilePath: context.lockfilePath,
  };

  switch (lockfileContext.packageManager) {
    case 'pnpm':
      return scanPnpmDependencies(lockfileContext, options);
    case 'npm':
      return scanNpmDependencies(lockfileContext);
    case 'bun':
      return scanBunDependencies(lockfileContext);
    case 'yarn':
      return scanYarnDependencies(lockfileContext);
    default:
      throw new Error(`${lockfileContext.packageManager} lockfiles are not supported yet.`);
  }
}

async function findNearestConfigDir(startDir: string): Promise<string | null> {
  let current = startDir;

  while (true) {
    for (const file of [DEFAULT_CONFIG_FILE, DEFAULT_LOCAL_CONFIG_FILE]) {
      if (await pathExists(path.join(current, file))) return current;
    }

    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

async function findNearestLockfile(
  startDir: string,
): Promise<{ path: string; packageManager: PackageManager } | null> {
  let current = startDir;

  while (true) {
    for (const candidate of LOCKFILE_CANDIDATES) {
      const lockfilePath = path.join(current, candidate.file);
      if (await pathExists(lockfilePath)) {
        return { path: lockfilePath, packageManager: candidate.packageManager };
      }
    }

    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}
