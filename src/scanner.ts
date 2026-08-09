import fs from 'node:fs/promises';
import path from 'node:path';

import { scanBunDependencies } from './bun-lock.ts';
import { pathExists } from './fs-utils.ts';
import { scanNpmDependencies } from './npm-lock.ts';
import { scanPnpmDependencies } from './pnpm-lock.ts';
import { scanYarnDependencies } from './yarn-lock.ts';
import type { PackageReference, PackageManager, ProjectContext, ScanProjectOptions } from './types.ts';

const LOCKFILE_CANDIDATES: Array<{ file: string; packageManager: PackageManager }> = [
  { file: 'pnpm-lock.yaml', packageManager: 'pnpm' },
  { file: 'package-lock.json', packageManager: 'npm' },
  { file: 'bun.lock', packageManager: 'bun' },
  { file: 'bun.lockb', packageManager: 'bun' },
  { file: 'yarn.lock', packageManager: 'yarn' }
];

export async function resolveProjectInput(
  projectPath: string | null | undefined,
  cwd: string = process.cwd()
): Promise<ProjectContext> {
  const input = path.resolve(cwd, projectPath ?? '.');
  const inputStat = await fs.stat(input).catch(() => null);
  if (!inputStat) {
    throw new Error(
      `No such project path: ${projectPath}. Pass a directory or package.json, or select a reference with --package/--group/--reference.`
    );
  }
  const packageJsonPath = inputStat.isDirectory() ? path.join(input, 'package.json') : input;

  if (path.basename(packageJsonPath) !== 'package.json') {
    throw new Error(`Expected a project directory or package.json path, got ${projectPath ?? '.'}`);
  }

  await fs.access(packageJsonPath);
  const packageDir = path.dirname(packageJsonPath);
  const lockfile = await findNearestLockfile(packageDir);

  if (!lockfile) {
    throw new Error(`No supported lockfile found from ${packageDir} upward. PNPM is supported first.`);
  }

  const projectRoot = path.dirname(lockfile.path);

  return {
    projectRoot,
    packageJsonPath,
    lockfilePath: lockfile.path,
    packageManager: lockfile.packageManager,
    importer: path.relative(projectRoot, packageDir) || '.'
  };
}

export async function scanProject(
  projectPath: string | null | undefined,
  options: ScanProjectOptions = {}
): Promise<PackageReference[]> {
  const context = await resolveProjectInput(projectPath, options.cwd);
  return scanResolvedProject(context, options);
}

export async function scanResolvedProject(
  context: ProjectContext,
  options: ScanProjectOptions = {}
): Promise<PackageReference[]> {
  switch (context.packageManager) {
    case 'pnpm':
      return scanPnpmDependencies(context, options);
    case 'npm':
      return scanNpmDependencies(context);
    case 'bun':
      return scanBunDependencies(context);
    case 'yarn':
      return scanYarnDependencies(context);
    default:
      throw new Error(`${context.packageManager} lockfiles are not supported yet.`);
  }
}

async function findNearestLockfile(startDir: string): Promise<{ path: string; packageManager: PackageManager } | null> {
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
