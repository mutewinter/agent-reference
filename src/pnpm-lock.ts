import fs from 'node:fs/promises';
import path from 'node:path';

import {
  DEPENDENCY_SECTIONS,
  isExactRegistryVersion,
  mergeDependencyEntries,
  parsePackageAtVersion,
  stripPnpmPeerSuffix
} from './package-utils.ts';
import type { PackageReference, DependencyType, ProjectContext, ScanProjectOptions } from './types.ts';

type PnpmScalar = string | boolean | null;
interface PnpmObject {
  [key: string]: PnpmScalar | PnpmObject;
}
type PnpmImporterSnapshot = Partial<Record<DependencyType, Record<string, PnpmDependencyValue>>>;
type PnpmDependencyValue = string | { version?: string; specifier?: string };

export async function readPnpmImporters(lockfilePath: string): Promise<Record<string, PnpmImporterSnapshot>> {
  const text = await fs.readFile(lockfilePath, 'utf8');
  const parsed = parsePnpmLockText(text);
  return (parsed.importers as Record<string, PnpmImporterSnapshot> | undefined) ?? {};
}

export async function scanPnpmDependencies(
  context: ProjectContext,
  options: ScanProjectOptions = {}
): Promise<PackageReference[]> {
  const importers = await readPnpmImporters(context.lockfilePath);
  const selectedImporters: Array<[string, PnpmImporterSnapshot | undefined]> = options.allImporters
    ? Object.entries(importers)
    : [[context.importer, importers[context.importer]]];

  const include = options.include ?? DEPENDENCY_SECTIONS;
  const entries: PackageReference[] = [];

  for (const [importer, snapshot] of selectedImporters) {
    if (!snapshot) {
      throw new Error(`No PNPM lockfile importer found for ${importer}`);
    }

    for (const dependencyType of include) {
      const dependencies = snapshot[dependencyType] ?? {};
      for (const [name, value] of Object.entries(dependencies)) {
        const resolved = normalizePnpmDependencyValue(name, value);
        if (!resolved.version) continue;

        entries.push({
          name: resolved.name,
          alias: resolved.name === name ? null : name,
          version: resolved.version,
          specifier: resolved.specifier,
          dependencyType,
          dependencyTypes: [dependencyType],
          importer,
          importers: [importer],
          packageManager: 'pnpm',
          packageJsonPath: path.join(context.projectRoot, importer === '.' ? '' : importer, 'package.json'),
          packageJsonPaths: [path.join(context.projectRoot, importer === '.' ? '' : importer, 'package.json')],
          lockfilePath: context.lockfilePath
        });
      }
    }
  }

  return mergeDependencyEntries(entries);
}

export function parsePnpmLockText(text: string): PnpmObject {
  const root: PnpmObject = {};
  const stack = [{ indent: -1, value: root }];

  for (const rawLine of text.split(/\r?\n/)) {
    const withoutComment = stripYamlComment(rawLine);
    if (!withoutComment.trim()) continue;

    const indent = withoutComment.match(/^ */)?.[0].length ?? 0;
    const line = withoutComment.trimEnd();
    const content = line.trimStart();

    if (content.startsWith('- ')) {
      continue;
    }

    const mapping = splitYamlMapping(content);
    if (!mapping) continue;

    while ((stack.at(-1)?.indent ?? -1) >= indent) {
      stack.pop();
    }

    const parent = stack.at(-1)?.value;
    if (!parent) continue;
    const key = parseYamlScalar(mapping.key);
    if (typeof key !== 'string') continue;

    if (mapping.value === '') {
      const child: PnpmObject = {};
      parent[key] = child;
      stack.push({ indent, value: child });
      continue;
    }

    parent[key] = parseYamlScalar(mapping.value);
  }

  return root;
}

function normalizePnpmDependencyValue(
  name: string,
  value: PnpmDependencyValue
): { name: string; version: string | null; specifier: string | null } {
  if (typeof value === 'string') {
    return normalizeVersionValue(name, value, null);
  }

  if (value && typeof value === 'object') {
    return normalizeVersionValue(name, value.version, value.specifier ?? null);
  }

  return { name, version: null, specifier: null };
}

function normalizeVersionValue(
  name: string,
  rawVersion: string | undefined,
  specifier: string | null
): { name: string; version: string | null; specifier: string | null } {
  if (!rawVersion) return { name, version: null, specifier };

  let packageName = name;
  let version = stripPnpmPeerSuffix(rawVersion);
  if (!version) return { name: packageName, version: null, specifier };

  if (version.startsWith('link:') || version.startsWith('file:') || version.startsWith('workspace:')) {
    return { name: packageName, version: null, specifier };
  }

  if (version.startsWith('npm:')) {
    const parsed = parsePackageAtVersion(version.slice(4));
    if (parsed) {
      packageName = parsed.name;
      version = parsed.version;
    }
  } else if (!isExactRegistryVersion(version) && version.includes('@')) {
    const parsed = parsePackageAtVersion(version);
    if (parsed) {
      packageName = parsed.name;
      version = parsed.version;
    }
  }

  if (!isExactRegistryVersion(version)) {
    return { name: packageName, version: null, specifier };
  }

  return { name: packageName, version, specifier };
}

function splitYamlMapping(content: string): { key: string; value: string } | null {
  let quote: string | null = null;
  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    if ((char === '"' || char === "'") && content[index - 1] !== '\\') {
      quote = quote === char ? null : quote ?? char;
    }
    if (char === ':' && !quote) {
      return {
        key: content.slice(0, index).trim(),
        value: content.slice(index + 1).trim()
      };
    }
  }
  return null;
}

function parseYamlScalar(rawValue: string): PnpmScalar | PnpmObject {
  const value = rawValue.trim();

  if (
    (value.startsWith("'") && value.endsWith("'")) ||
    (value.startsWith('"') && value.endsWith('"'))
  ) {
    return value.slice(1, -1);
  }

  if (value.startsWith('{') && value.endsWith('}')) {
    return parseInlineObject(value.slice(1, -1));
  }

  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;

  return value;
}

function parseInlineObject(body: string): PnpmObject {
  const object: PnpmObject = {};
  for (const part of splitInlineParts(body)) {
    const mapping = splitYamlMapping(part.trim());
    if (mapping) {
      const key = parseYamlScalar(mapping.key);
      if (typeof key === 'string') {
        object[key] = parseYamlScalar(mapping.value);
      }
    }
  }
  return object;
}

function splitInlineParts(body: string): string[] {
  const parts: string[] = [];
  let quote: string | null = null;
  let start = 0;

  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    if ((char === '"' || char === "'") && body[index - 1] !== '\\') {
      quote = quote === char ? null : quote ?? char;
    }
    if (char === ',' && !quote) {
      parts.push(body.slice(start, index));
      start = index + 1;
    }
  }

  parts.push(body.slice(start));
  return parts;
}

function stripYamlComment(line: string): string {
  let quote: string | null = null;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const previous = line[index - 1];
    if ((char === '"' || char === "'") && line[index - 1] !== '\\') {
      quote = quote === char ? null : quote ?? char;
    }
    if (char === '#' && !quote && (index === 0 || (previous !== undefined && /\s/.test(previous)))) {
      return line.slice(0, index);
    }
  }

  return line;
}
