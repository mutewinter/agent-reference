import fs from 'node:fs/promises';

import { isExactRegistryVersion } from './package-utils.ts';
import { dependenciesFromPackageJsonDirectives } from './lock-utils.ts';
import type { DepCloneDependency, ProjectContext, ScanProjectOptions } from './types.ts';

interface YarnLockEntry {
  descriptors: string[];
  version: string | null;
}

export async function scanYarnDependencies(
  context: ProjectContext,
  options: ScanProjectOptions = {}
): Promise<DepCloneDependency[]> {
  const lockEntries = parseYarnLock(await fs.readFile(context.lockfilePath, 'utf8'));

  return dependenciesFromPackageJsonDirectives(context, options, ({ name, specifier }) => {
    const candidates = yarnDescriptorCandidates(name, specifier);
    const match = lockEntries.find((entry) => entry.descriptors.some((descriptor) => candidates.has(descriptor)));
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
        version: null
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
    `${name}@npm:${specifier.replace(/^[~^]/, '')}`
  ]);
}

function parseYarnDescriptorLine(line: string): string[] {
  return splitTopLevelCommas(line)
    .map((descriptor) => descriptor.trim())
    .map(stripQuotes)
    .filter(Boolean);
}

function splitTopLevelCommas(value: string): string[] {
  const parts: string[] = [];
  let quote: string | null = null;
  let start = 0;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if ((char === '"' || char === "'") && value[index - 1] !== '\\') {
      quote = quote === char ? null : quote ?? char;
    }
    if (char === ',' && !quote) {
      parts.push(value.slice(start, index));
      start = index + 1;
    }
  }

  parts.push(value.slice(start));
  return parts;
}

function stripQuotes(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }

  return value;
}
