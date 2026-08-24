import path from 'node:path';

import { readJsonFile } from './fs-utils.ts';
import { dependenciesFromPackageJsonDirectives } from './package-json.ts';
import { isExactRegistryVersion } from './package-utils.ts';
import type { PackageReference, LockfileProjectContext } from './types.ts';

interface NpmPackageLock {
  lockfileVersion?: number;
  packages?: Record<string, { version?: string; link?: boolean; resolved?: string }>;
  dependencies?: Record<string, { version?: string }>;
}

export async function scanNpmDependencies(context: LockfileProjectContext): Promise<PackageReference[]> {
  const lockfile = await readJsonFile<NpmPackageLock>(context.lockfilePath);

  return dependenciesFromPackageJsonDirectives(context, ({ name }) => {
    const localPackage = lockfile.packages?.[nodeModulesPackagePath(context.importer, name)];
    const rootPackage = lockfile.packages?.[nodeModulesPackagePath('.', name)];

    // A workspace member is recorded as a link carrying no version. Dropping it made an
    // in-repo package indistinguishable from one nothing installs, so asking for it went to
    // the registry and came back with an unrelated upstream latest. pnpm keeps these; so
    // does this, and the callers that fetch skip them the same way.
    const linked = workspaceLink(localPackage ?? rootPackage, context.importer);
    if (linked) return linked;

    const legacyPackage = lockfile.dependencies?.[name];
    const version = localPackage?.version ?? rootPackage?.version ?? legacyPackage?.version ?? null;

    return version && isExactRegistryVersion(version) ? version : null;
  });
}

/**
 * package-lock.json writes a link relative to its own directory, while a link's meaning is
 * relative to the importer that declared it, which is how every reader of these versions
 * resolves one. Rewriting it here is what makes the npm form comparable with the pnpm form.
 */
function workspaceLink(
  entry: { link?: boolean; resolved?: string } | undefined,
  importer: string
): string | null {
  if (!entry?.link || !entry.resolved) return null;
  const fromImporter = importer === '.' ? entry.resolved : path.posix.relative(importer, entry.resolved);
  return `link:${fromImporter || '.'}`;
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
