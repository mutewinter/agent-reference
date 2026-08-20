import fs from 'node:fs/promises';

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

  const lockfile = await readBunLock(context.lockfilePath);

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

async function readBunLock(lockfilePath: string): Promise<BunLock> {
  const raw = await fs.readFile(lockfilePath, 'utf8');
  return JSON.parse(stripJsonCommentsAndTrailingCommas(raw)) as BunLock;
}

/**
 * bun.lock is JSONC. Stripping comments with regular expressions cannot tell a comment from
 * the same characters inside a string, and a dependency descriptor holding `//` or `,}` is
 * ordinary: any URL does. This walks the text instead, so only characters outside a string
 * are ever considered, and every byte of a string value survives verbatim.
 */
function stripJsonCommentsAndTrailingCommas(raw: string): string {
  let out = '';
  let inString = false;
  let escaped = false;

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index] as string;

    if (inString) {
      out += char;
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') {
      inString = true;
      out += char;
      continue;
    }

    const next = raw[index + 1];
    if (char === '/' && next === '/') {
      while (index < raw.length && raw[index] !== '\n') index += 1;
      out += '\n';
      continue;
    }
    if (char === '/' && next === '*') {
      index += 2;
      while (index < raw.length && !(raw[index] === '*' && raw[index + 1] === '/')) index += 1;
      index += 1;
      continue;
    }

    out += char;
  }

  // Safe now that strings are known: only structural commas are left to consider.
  return out.replace(/,(\s*[}\]])/g, '$1');
}
