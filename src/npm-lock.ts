import fs from 'node:fs/promises';

import { isExactRegistryVersion } from './package-utils.ts';
import { dependenciesFromPackageJsonDirectives, nodeModulesPackagePath } from './lock-utils.ts';
import type { DepCloneDependency, ProjectContext, ScanProjectOptions } from './types.ts';

interface NpmPackageLock {
  lockfileVersion?: number;
  packages?: Record<string, NpmPackageLockPackage>;
  dependencies?: Record<string, NpmLegacyDependency>;
}

interface NpmPackageLockPackage {
  version?: string;
  link?: boolean;
}

interface NpmLegacyDependency {
  version?: string;
}

export async function scanNpmDependencies(
  context: ProjectContext,
  options: ScanProjectOptions = {}
): Promise<DepCloneDependency[]> {
  const lockfile = await readNpmPackageLock(context.lockfilePath);

  return dependenciesFromPackageJsonDirectives(context, options, ({ name }) => {
    const packagePath = nodeModulesPackagePath(context.importer, name);
    const localPackage = lockfile.packages?.[packagePath];
    const rootPackage = lockfile.packages?.[nodeModulesPackagePath('.', name)];
    const legacyPackage = lockfile.dependencies?.[name];
    const version = localPackage?.version ?? rootPackage?.version ?? legacyPackage?.version ?? null;

    return version && isExactRegistryVersion(version) ? version : null;
  });
}

async function readNpmPackageLock(lockfilePath: string): Promise<NpmPackageLock> {
  const raw = await fs.readFile(lockfilePath, 'utf8');
  return JSON.parse(raw) as NpmPackageLock;
}
