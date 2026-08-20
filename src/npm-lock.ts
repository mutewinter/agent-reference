import path from 'node:path';

import { readJsonFile } from './fs-utils.ts';
import { dependenciesFromPackageJsonDirectives } from './package-json.ts';
import { isExactRegistryVersion } from './package-utils.ts';
import type { PackageReference, LockfileProjectContext } from './types.ts';

interface NpmPackageLock {
  lockfileVersion?: number;
  packages?: Record<string, { version?: string; link?: boolean }>;
  dependencies?: Record<string, { version?: string }>;
}

export async function scanNpmDependencies(context: LockfileProjectContext): Promise<PackageReference[]> {
  const lockfile = await readJsonFile<NpmPackageLock>(context.lockfilePath);

  return dependenciesFromPackageJsonDirectives(context, ({ name }) => {
    const localPackage = lockfile.packages?.[nodeModulesPackagePath(context.importer, name)];
    const rootPackage = lockfile.packages?.[nodeModulesPackagePath('.', name)];
    const legacyPackage = lockfile.dependencies?.[name];
    const version = localPackage?.version ?? rootPackage?.version ?? legacyPackage?.version ?? null;

    return version && isExactRegistryVersion(version) ? version : null;
  });
}

/**
 * package-lock.json keys are always slash-separated, on every platform. path.join emits
 * backslashes on Windows, so every lookup missed there and every npm dependency read as
 * not installed.
 */
function nodeModulesPackagePath(importer: string, name: string): string {
  const parts = importer === '.' ? [] : [importer];
  return path.posix.join(...parts, 'node_modules', ...name.split('/'));
}
