import { readJsoncFile } from './fs-utils.ts';
import { dependenciesFromPackageJsonDirectives } from './package-json.ts';
import { isExactRegistryVersion, parsePackageAtVersion } from './package-utils.ts';
import type { PackageReference, LockfileProjectContext } from './types.ts';

interface BunLock {
  lockfileVersion?: number;
  packages?: Record<string, [string, ...unknown[]]>;
}

export async function scanBunDependencies(context: LockfileProjectContext): Promise<PackageReference[]> {
  if (context.lockfilePath.endsWith('bun.lockb')) {
    throw new Error('bun.lockb is binary and cannot be inspected. Generate bun.lock with Bun v1.2+ first.');
  }

  const lockfile = await readJsoncFile<BunLock>(context.lockfilePath);

  return dependenciesFromPackageJsonDirectives(context, ({ name }) => {
    const entry = lockfile.packages?.[name];
    const descriptor = Array.isArray(entry) ? entry[0] : null;
    if (typeof descriptor !== 'string') return null;

    const parsed = parseBunPackageDescriptor(descriptor);
    return parsed?.name === name && isExactRegistryVersion(parsed.version) ? parsed.version : null;
  });
}

function parseBunPackageDescriptor(descriptor: string): { name: string; version: string } | null {
  const normalized = descriptor.startsWith('npm:') ? descriptor.slice(4) : descriptor;
  const parsed = parsePackageAtVersion(normalized);
  if (parsed) return parsed;

  const npmIndex = normalized.lastIndexOf('@npm:');
  if (npmIndex > 0) {
    return parsePackageAtVersion(`${normalized.slice(0, npmIndex)}@${normalized.slice(npmIndex + '@npm:'.length)}`);
  }

  return null;
}
