import fs from 'node:fs/promises';
import path from 'node:path';

import {
  isExactRegistryVersion,
  mergeDependencyEntries,
  parsePackageAtVersion,
  stripPnpmPeerSuffix,
} from './package-utils.ts';
import { DEPENDENCY_SECTIONS } from './package-json.ts';
import { splitOutsideQuotes, stripQuotes } from './text-utils.ts';
import type {
  PackageReference,
  DependencyType,
  LockfileProjectContext,
  ScanProjectOptions,
} from './types.ts';

type PnpmScalar = string | boolean | null;
interface PnpmObject {
  [key: string]: PnpmScalar | PnpmObject;
}
type PnpmImporterSnapshot = Partial<Record<DependencyType, Record<string, PnpmDependencyValue>>>;
type PnpmDependencyValue = string | { version?: string; specifier?: string };

export async function scanPnpmDependencies(
  context: LockfileProjectContext,
  options: ScanProjectOptions = {},
): Promise<PackageReference[]> {
  const text = await fs.readFile(context.lockfilePath, 'utf8');
  const importers =
    (parsePnpmLockText(text).importers as Record<string, PnpmImporterSnapshot> | undefined) ?? {};
  const selectedImporters: Array<[string, PnpmImporterSnapshot | undefined]> = options.allImporters
    ? Object.entries(importers)
    : [[context.importer, importers[context.importer]]];

  const entries: PackageReference[] = [];

  for (const [importer, snapshot] of selectedImporters) {
    if (!snapshot) {
      throw new Error(`No PNPM lockfile importer found for ${importer}`);
    }

    for (const dependencyType of DEPENDENCY_SECTIONS) {
      for (const [name, value] of Object.entries(snapshot[dependencyType] ?? {})) {
        const resolved = normalizePnpmDependencyValue(name, value);
        if (!resolved.version) continue;

        entries.push({
          name: resolved.name,
          version: resolved.version,
          specifier: resolved.specifier,
          packageManager: 'pnpm',
          dependencyTypes: [dependencyType],
          importers: [importer],
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
  value: PnpmDependencyValue,
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
  specifier: string | null,
): { name: string; version: string | null; specifier: string | null } {
  if (!rawVersion) return { name, version: null, specifier };

  let packageName = name;
  let version = stripPnpmPeerSuffix(rawVersion);
  if (!version) return { name: packageName, version: null, specifier };

  // Kept, not dropped. A workspace dependency has no registry version, but dropping it made
  // an in-repo package indistinguishable from one nothing installs, so asking for it sent a
  // `link:` string to the registry and came back 404. Callers that fetch skip these; callers
  // that answer questions about the project report them.
  if (isWorkspaceVersion(version)) {
    return { name: packageName, version, specifier };
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
      quote = quote === char ? null : (quote ?? char);
    }
    if (char === ':' && !quote) {
      return {
        key: content.slice(0, index).trim(),
        value: content.slice(index + 1).trim(),
      };
    }
  }
  return null;
}

function parseYamlScalar(rawValue: string): PnpmScalar | PnpmObject {
  const value = rawValue.trim();
  const unquoted = stripQuotes(value);
  if (unquoted !== value) return unquoted;

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
  for (const part of splitOutsideQuotes(body, ',')) {
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

function stripYamlComment(line: string): string {
  let quote: string | null = null;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const previous = line[index - 1];
    if ((char === '"' || char === "'") && line[index - 1] !== '\\') {
      quote = quote === char ? null : (quote ?? char);
    }
    if (
      char === '#' &&
      !quote &&
      (index === 0 || (previous !== undefined && /\s/.test(previous)))
    ) {
      return line.slice(0, index);
    }
  }

  return line;
}

const WORKSPACE_PROTOCOL = /^(?:link|file|workspace):/;

/** A dependency resolved inside this repository rather than from a registry. */
export function isWorkspaceVersion(version: string): boolean {
  return WORKSPACE_PROTOCOL.test(version);
}

export function workspaceVersionPath(version: string): string {
  return version.replace(WORKSPACE_PROTOCOL, '') || '.';
}

/**
 * The directory a workspace link points at, as an absolute path.
 *
 * A link is written relative to the importer that declares it, so one package reaches the
 * lockfile as a different string from every importer that depends on it: `link:../shared`
 * and `link:../../packages/shared` are the same directory said twice. Only resolving each
 * against its own importer makes them comparable, and only an absolute path is readable
 * from whichever directory the caller happened to run in.
 *
 * Null when the version names a range rather than a place, which `workspace:*` and
 * `workspace:^1.2.0` do. Those say a package is local without saying where.
 */
export function workspaceVersionDirectory(
  lockfileDir: string,
  importer: string,
  version: string,
): string | null {
  const target = workspaceVersionPath(version);
  const protocol = version.slice(0, version.indexOf(':'));
  if (protocol === 'workspace' && !target.startsWith('.') && !target.includes('/')) return null;

  return path.resolve(lockfileDir, importer, target);
}
