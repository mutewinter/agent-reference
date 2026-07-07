import path from 'node:path';

import { readJsonFile } from './fs-utils.ts';
import { dependenciesFromPackageJsonDirectives } from './package-json.ts';
import { isExactRegistryVersion } from './package-utils.ts';
import type { PackageReference, ProjectContext } from './types.ts';

interface NpmPackageLock {
  lockfileVersion?: number;
  packages?: Record<string, { version?: string; link?: boolean }>;
  dependencies?: Record<string, { version?: string }>;
}

export async function scanNpmDependencies(context: ProjectContext): Promise<PackageReference[]> {
  const lockfile = await readJsonFile<NpmPackageLock>(context.lockfilePath);

  return dependenciesFromPackageJsonDirectives(context, ({ name }) => {
    const localPackage = lockfile.packages?.[nodeModulesPackagePath(context.importer, name)];
    const rootPackage = lockfile.packages?.[nodeModulesPackagePath('.', name)];
    const legacyPackage = lockfile.dependencies?.[name];
    const version = localPackage?.version ?? rootPackage?.version ?? legacyPackage?.version ?? null;

    return version && isExactRegistryVersion(version) ? version : null;
  });
}

function nodeModulesPackagePath(importer: string, name: string): string {
  const parts = importer === '.' ? [] : [importer];
  return path.join(...parts, 'node_modules', ...name.split('/'));
}
