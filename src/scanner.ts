import fs from 'node:fs/promises';
import path from 'node:path';

import { scanBunDependencies } from './bun-lock.ts';
import { scanNpmDependencies } from './npm-lock.ts';
import { scanPnpmDependencies } from './pnpm-lock.ts';
import { scanYarnDependencies } from './yarn-lock.ts';
import type { PackageReference, PackageManager, ProjectContext, ScanProjectOptions } from './types.ts';

export async function resolveProjectInput(
  projectPath: string | null | undefined,
  cwd: string = process.cwd()
): Promise<ProjectContext> {
  const input = path.resolve(cwd, projectPath ?? '.');
  const inputStat = await fs.stat(input);
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
  const importer = path.relative(projectRoot, packageDir) || '.';

  return {
    projectRoot,
    packageJsonPath,
    lockfilePath: lockfile.path,
    packageManager: lockfile.packageManager,
    importer: importer === '' ? '.' : importer
  };
}

export async function scanProject(
  projectPath: string | null | undefined,
  options: ScanProjectOptions & { cwd?: string } = {}
): Promise<PackageReference[]> {
  const context = await resolveProjectInput(projectPath, options.cwd);
  return scanResolvedProject(context, options);
}

export async function scanResolvedProject(
  context: ProjectContext,
  options: ScanProjectOptions = {}
): Promise<PackageReference[]> {
  if (context.packageManager === 'pnpm') {
    return scanPnpmDependencies(context, options);
  }
  if (context.packageManager === 'npm') {
    return scanNpmDependencies(context, options);
  }
  if (context.packageManager === 'bun') {
    return scanBunDependencies(context, options);
  }
  if (context.packageManager === 'yarn') {
    return scanYarnDependencies(context, options);
  }

  throw new Error(`${context.packageManager} lockfiles are not supported yet.`);
}

async function findNearestLockfile(startDir: string): Promise<{ path: string; packageManager: PackageManager } | null> {
  let current = startDir;

  while (true) {
    const candidates: Array<{ file: string; packageManager: PackageManager }> = [
      { file: 'pnpm-lock.yaml', packageManager: 'pnpm' },
      { file: 'package-lock.json', packageManager: 'npm' },
      { file: 'bun.lock', packageManager: 'bun' },
      { file: 'bun.lockb', packageManager: 'bun' },
      { file: 'yarn.lock', packageManager: 'yarn' }
    ];

    for (const candidate of candidates) {
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

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
