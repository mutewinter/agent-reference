import fs from 'node:fs/promises';

import { isExactRegistryVersion, parsePackageAtVersion } from './package-utils.ts';
import { dependenciesFromPackageJsonDirectives } from './lock-utils.ts';
import type { PackageReference, ProjectContext, ScanProjectOptions } from './types.ts';

interface BunLock {
  lockfileVersion?: number;
  workspaces?: Record<string, BunWorkspace>;
  packages?: Record<string, BunPackageEntry>;
}

interface BunWorkspace {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

type BunPackageEntry = [string, ...unknown[]];

export async function scanBunDependencies(
  context: ProjectContext,
  options: ScanProjectOptions = {}
): Promise<PackageReference[]> {
  if (context.lockfilePath.endsWith('bun.lockb')) {
    throw new Error('bun.lockb is binary and cannot be inspected. Generate bun.lock with Bun v1.2+ first.');
  }

  const lockfile = await readBunLock(context.lockfilePath);

  return dependenciesFromPackageJsonDirectives(context, options, ({ name }) => {
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

async function readBunLock(lockfilePath: string): Promise<BunLock> {
  const raw = await fs.readFile(lockfilePath, 'utf8');
  return JSON.parse(stripJsonCommentsAndTrailingCommas(raw)) as BunLock;
}

function stripJsonCommentsAndTrailingCommas(raw: string): string {
  return raw
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/,\s*([}\]])/g, '$1');
}
