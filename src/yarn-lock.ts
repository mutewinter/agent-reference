import fs from 'node:fs/promises';

import { dependenciesFromPackageJsonDirectives } from './package-json.ts';
import { isExactRegistryVersion } from './package-utils.ts';
import { splitOutsideQuotes, stripQuotes } from './text-utils.ts';
import type { PackageReference, LockfileProjectContext } from './types.ts';

interface YarnLockEntry {
  descriptors: string[];
  version: string | null;
}

export async function scanYarnDependencies(
  context: LockfileProjectContext,
): Promise<PackageReference[]> {
  const lockEntries = parseYarnLock(await fs.readFile(context.lockfilePath, 'utf8'));

  return dependenciesFromPackageJsonDirectives(context, ({ name, specifier }) => {
    const candidates = yarnDescriptorCandidates(name, specifier);
    const match = lockEntries.find((entry) =>
      entry.descriptors.some((descriptor) => candidates.has(descriptor)),
    );
    return match?.version && isExactRegistryVersion(match.version) ? match.version : null;
  });
}

export function parseYarnLock(text: string): YarnLockEntry[] {
  const entries: YarnLockEntry[] = [];
  let current: YarnLockEntry | null = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line || line.startsWith('#')) continue;

    if (!rawLine.startsWith(' ') && line.endsWith(':')) {
      if (current) entries.push(current);
      current = {
        descriptors: parseYarnDescriptorLine(line.slice(0, -1)),
        version: null,
      };
      continue;
    }

    if (!current) continue;

    const versionMatch = line.trim().match(/^version:?\s+"?([^"\s]+)"?$/);
    if (versionMatch?.[1]) {
      current.version = versionMatch[1];
    }
  }

  if (current) entries.push(current);
  return entries;
}

function yarnDescriptorCandidates(name: string, specifier: string): Set<string> {
  return new Set([
    `${name}@${specifier}`,
    `${name}@npm:${specifier}`,
    `${name}@npm:${specifier.replace(/^[~^]/, '')}`,
  ]);
}

function parseYarnDescriptorLine(line: string): string[] {
  return splitOutsideQuotes(line, ',')
    .map((descriptor) => stripQuotes(descriptor.trim()))
    .filter(Boolean);
}
