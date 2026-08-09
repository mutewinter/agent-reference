import fs from 'node:fs/promises';
import path from 'node:path';

import { pathExists, readJsonFile } from './fs-utils.ts';
import type {
  AgentReferenceConfig,
  ConfiguredFolderReference,
  ConfiguredGitReference,
  ConfiguredGroup,
  ConfiguredPackageReference,
  LoadedAgentReferenceConfig
} from './types.ts';

export const DEFAULT_CONFIG_FILE = 'agent-reference.json';
export const DEFAULT_LOCAL_CONFIG_FILE = 'agent-reference.local.json';
export const CONFIG_SCHEMA_URL = 'https://unpkg.com/agent-reference/schema/agent-reference.schema.json';

const TOP_LEVEL_KEYS = [
  '$schema',
  'packages',
  'folders',
  'git',
  'groups',
  'allPackages',
  'allImporters',
  'registry',
  'worktreeDir',
  'cacheDir'
];
const PACKAGE_KEYS = ['version', 'ref', 'repository', 'directory', 'description', 'groups'];
const FOLDER_KEYS = ['path', 'description', 'groups'];
const GIT_KEYS = ['repository', 'ref', 'description', 'groups'];
const GROUP_KEYS = ['description', 'references'];

export function emptyConfig(): AgentReferenceConfig {
  return { packages: [], folders: [], git: [], groups: [] };
}

export async function loadAgentReferenceConfig(
  projectRoot: string,
  options: { configFile?: string | null } = {}
): Promise<LoadedAgentReferenceConfig | null> {
  const configPath = options.configFile
    ? path.resolve(projectRoot, options.configFile)
    : await findConfigFile(projectRoot, DEFAULT_CONFIG_FILE);
  const localPath = await findConfigFile(projectRoot, DEFAULT_LOCAL_CONFIG_FILE);

  if (!configPath && !localPath) return null;

  const baseConfig = configPath ? parseConfig(await readConfigJson(configPath), configPath) : emptyConfig();
  const localConfig = localPath ? parseConfig(await readConfigJson(localPath), localPath) : emptyConfig();

  return {
    path: configPath,
    localPath,
    config: mergeConfigs(baseConfig, localConfig)
  };
}

export async function writeAgentReferenceConfig(
  projectRoot: string,
  config: AgentReferenceConfig,
  options: { configFile?: string | null; force?: boolean } = {}
): Promise<string> {
  const configPath = options.configFile
    ? path.resolve(projectRoot, options.configFile)
    : path.join(projectRoot, DEFAULT_CONFIG_FILE);

  if (!options.force && (await pathExists(configPath))) {
    throw new Error(`${path.basename(configPath)} already exists. Use --force to overwrite it.`);
  }

  await fs.writeFile(configPath, `${JSON.stringify(serializeConfig(config), null, 2)}\n`);
  return configPath;
}

async function readConfigJson(configPath: string): Promise<unknown> {
  try {
    return await readJsonFile<unknown>(configPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${configPath} is not valid JSON: ${message}`);
  }
}

export function parseConfig(value: unknown, configPath: string): AgentReferenceConfig {
  const object = expectObject(value, configPath, null);
  assertKnownKeys(object, TOP_LEVEL_KEYS, configPath, null);

  const config = emptyConfig();

  for (const [name, entry] of recordEntries(object.packages, configPath, 'packages')) {
    config.packages.push(parsePackageEntry(name, entry, configPath));
  }
  for (const [name, entry] of recordEntries(object.folders, configPath, 'folders')) {
    config.folders.push(parseFolderEntry(name, entry, configPath));
  }
  for (const [name, entry] of recordEntries(object.git, configPath, 'git')) {
    config.git.push(parseGitEntry(name, entry, configPath));
  }
  for (const [name, entry] of recordEntries(object.groups, configPath, 'groups')) {
    config.groups.push(parseGroupEntry(name, entry, configPath));
  }

  if (object.allPackages !== undefined) config.allPackages = expectBoolean(object.allPackages, configPath, 'allPackages');
  if (object.allImporters !== undefined) config.allImporters = expectBoolean(object.allImporters, configPath, 'allImporters');
  if (object.registry !== undefined) config.registry = expectString(object.registry, configPath, 'registry');
  if (object.worktreeDir !== undefined) config.worktreeDir = expectString(object.worktreeDir, configPath, 'worktreeDir');
  if (object.cacheDir !== undefined) config.cacheDir = expectString(object.cacheDir, configPath, 'cacheDir');

  return config;
}

function parsePackageEntry(name: string, entry: unknown, configPath: string): ConfiguredPackageReference {
  const field = `packages.${name}`;
  if (typeof entry === 'string') {
    return {
      kind: 'package',
      name,
      version: requireNonEmpty(entry, configPath, field),
      ref: null,
      repository: null,
      directory: null,
      description: null,
      groups: []
    };
  }

  const object = expectObject(entry, configPath, field, 'a version string or an object');
  assertKnownKeys(object, PACKAGE_KEYS, configPath, field);
  if (object.version === undefined) {
    fail(configPath, `${field}.version is required. Use "installed", an exact version, a range, or a dist-tag.`);
  }

  return {
    kind: 'package',
    name,
    version: requireNonEmpty(expectString(object.version, configPath, `${field}.version`), configPath, `${field}.version`),
    ref: optionalString(object.ref, configPath, `${field}.ref`),
    repository: optionalString(object.repository, configPath, `${field}.repository`),
    directory: optionalString(object.directory, configPath, `${field}.directory`),
    description: parseDescription(object.description, configPath, field),
    groups: parseNameList(object.groups, configPath, field, 'groups')
  };
}

function parseFolderEntry(name: string, entry: unknown, configPath: string): ConfiguredFolderReference {
  const field = `folders.${name}`;
  if (typeof entry === 'string') {
    return { kind: 'folder', name, path: requireNonEmpty(entry, configPath, field), description: null, groups: [] };
  }

  const object = expectObject(entry, configPath, field, 'a path string or an object');
  assertKnownKeys(object, FOLDER_KEYS, configPath, field);
  if (object.path === undefined) {
    fail(configPath, `${field}.path is required.`);
  }

  return {
    kind: 'folder',
    name,
    path: requireNonEmpty(expectString(object.path, configPath, `${field}.path`), configPath, `${field}.path`),
    description: parseDescription(object.description, configPath, field),
    groups: parseNameList(object.groups, configPath, field, 'groups')
  };
}

function parseGitEntry(name: string, entry: unknown, configPath: string): ConfiguredGitReference {
  const field = `git.${name}`;
  if (typeof entry === 'string') {
    return gitReference(name, requireNonEmpty(entry, configPath, field), null, null, [], configPath, field);
  }

  const object = expectObject(entry, configPath, field, 'a repository string or an object');
  assertKnownKeys(object, GIT_KEYS, configPath, field);
  if (object.repository === undefined) {
    fail(configPath, `${field}.repository is required. Use github:owner/repo, a git URL, or file:../repo.`);
  }

  return gitReference(
    name,
    requireNonEmpty(expectString(object.repository, configPath, `${field}.repository`), configPath, `${field}.repository`),
    object.ref === undefined || object.ref === null ? null : expectString(object.ref, configPath, `${field}.ref`),
    parseDescription(object.description, configPath, field),
    parseNameList(object.groups, configPath, field, 'groups'),
    configPath,
    field
  );
}

function gitReference(
  name: string,
  repositorySpec: string,
  explicitRef: string | null,
  description: string | null,
  groups: string[],
  configPath: string,
  field: string
): ConfiguredGitReference {
  const hashIndex = repositorySpec.lastIndexOf('#');
  const repository = hashIndex === -1 ? repositorySpec : repositorySpec.slice(0, hashIndex);
  const inlineRef = hashIndex === -1 ? null : repositorySpec.slice(hashIndex + 1) || null;

  if (explicitRef && inlineRef && explicitRef !== inlineRef) {
    fail(configPath, `${field} sets ref "${explicitRef}" but repository already pins "#${inlineRef}". Use one or the other.`);
  }
  if (!repository) {
    fail(configPath, `${field} needs a repository before the "#" ref.`);
  }

  const ref = explicitRef ?? inlineRef;
  return { kind: 'git', name, repository, ref, spec: gitSpec(repository, ref), description, groups };
}

export function gitSpec(repository: string, ref: string | null): string {
  return ref ? `${repository}#${ref}` : repository;
}

function parseGroupEntry(name: string, entry: unknown, configPath: string): ConfiguredGroup {
  const field = `groups.${name}`;
  if (typeof entry === 'string') {
    return { name, description: entry.trim() || null, references: [] };
  }

  const object = expectObject(entry, configPath, field, 'a description string or an object');
  assertKnownKeys(object, GROUP_KEYS, configPath, field);

  return {
    name,
    description: parseDescription(object.description, configPath, field),
    references: parseNameList(object.references, configPath, field, 'references')
  };
}

function parseDescription(value: unknown, configPath: string, field: string): string | null {
  if (value === undefined || value === null) return null;
  return expectString(value, configPath, `${field}.description`).trim() || null;
}

function optionalString(value: unknown, configPath: string, field: string): string | null {
  if (value === undefined || value === null) return null;
  return expectString(value, configPath, field).trim() || null;
}

function parseNameList(value: unknown, configPath: string, field: string, key: string): string[] {
  if (value === undefined || value === null) return [];
  const values = typeof value === 'string' ? [value] : value;
  if (!Array.isArray(values)) {
    fail(configPath, `${field}.${key} must be a string or an array of strings.`);
  }

  const names: string[] = [];
  for (const item of values) {
    const name = expectString(item, configPath, `${field}.${key}[]`).trim();
    if (name && !names.includes(name)) names.push(name);
  }
  return names;
}

function mergeConfigs(base: AgentReferenceConfig, local: AgentReferenceConfig): AgentReferenceConfig {
  return {
    packages: mergeByName(base.packages, local.packages),
    folders: mergeByName(base.folders, local.folders),
    git: mergeByName(base.git, local.git),
    groups: mergeByName(base.groups, local.groups),
    allPackages: local.allPackages ?? base.allPackages,
    allImporters: local.allImporters ?? base.allImporters,
    registry: local.registry ?? base.registry,
    worktreeDir: local.worktreeDir ?? base.worktreeDir,
    cacheDir: local.cacheDir ?? base.cacheDir
  };
}

function mergeByName<T extends { name: string }>(base: T[], local: T[]): T[] {
  const byName = new Map(base.map((entry) => [entry.name, entry]));
  for (const entry of local) {
    byName.set(entry.name, entry);
  }
  return [...byName.values()];
}

function serializeConfig(config: AgentReferenceConfig): Record<string, unknown> {
  const serialized: Record<string, unknown> = { $schema: CONFIG_SCHEMA_URL };

  if (config.packages.length > 0) {
    serialized.packages = Object.fromEntries(
      config.packages.map((entry) => [
        entry.name,
        compact(
          entry.version,
          entry,
          {
            version: entry.version,
            ...(entry.ref ? { ref: entry.ref } : {}),
            ...(entry.repository ? { repository: entry.repository } : {}),
            ...(entry.directory ? { directory: entry.directory } : {})
          },
          Boolean(entry.ref || entry.repository || entry.directory)
        )
      ])
    );
  }
  if (config.folders.length > 0) {
    serialized.folders = Object.fromEntries(
      config.folders.map((entry) => [entry.name, compact(entry.path, entry, { path: entry.path })])
    );
  }
  if (config.git.length > 0) {
    serialized.git = Object.fromEntries(
      config.git.map((entry) => [
        entry.name,
        compact(
          entry.spec,
          entry,
          entry.ref ? { repository: entry.repository, ref: entry.ref } : { repository: entry.repository }
        )
      ])
    );
  }
  if (config.groups.length > 0) {
    serialized.groups = Object.fromEntries(
      config.groups.map((group) => [
        group.name,
        group.references.length > 0
          ? { ...(group.description ? { description: group.description } : {}), references: group.references }
          : (group.description ?? '')
      ])
    );
  }

  if (config.allPackages) serialized.allPackages = true;
  if (config.allImporters) serialized.allImporters = true;
  if (config.registry) serialized.registry = config.registry;
  if (config.worktreeDir) serialized.worktreeDir = config.worktreeDir;
  if (config.cacheDir) serialized.cacheDir = config.cacheDir;

  return serialized;
}

/** Shorthand only round-trips when the entry carries nothing the string cannot express. */
function compact(
  shorthand: string,
  entry: { description: string | null; groups: string[] },
  longhand: Record<string, string>,
  forceLonghand = false
): string | Record<string, unknown> {
  if (!forceLonghand && !entry.description && entry.groups.length === 0) return shorthand;
  return {
    ...longhand,
    ...(entry.description ? { description: entry.description } : {}),
    ...(entry.groups.length > 0 ? { groups: entry.groups } : {})
  };
}

function recordEntries(value: unknown, configPath: string, field: string): Array<[string, unknown]> {
  if (value === undefined || value === null) return [];
  const object = expectObject(value, configPath, field, 'an object mapping names to references');
  for (const name of Object.keys(object)) {
    if (!name.trim()) fail(configPath, `${field} has an empty reference name.`);
  }
  return Object.entries(object);
}

function expectObject(
  value: unknown,
  configPath: string,
  field: string | null,
  expectation = 'a JSON object'
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(configPath, `${field ? `${field} must be` : 'the file must contain'} ${expectation}.`);
  }
  return value as Record<string, unknown>;
}

function expectString(value: unknown, configPath: string, field: string): string {
  if (typeof value !== 'string') fail(configPath, `${field} must be a string.`);
  return value;
}

function expectBoolean(value: unknown, configPath: string, field: string): boolean {
  if (typeof value !== 'boolean') fail(configPath, `${field} must be a boolean.`);
  return value;
}

function requireNonEmpty(value: string, configPath: string, field: string): string {
  if (!value.trim()) fail(configPath, `${field} must not be empty.`);
  return value;
}

function assertKnownKeys(
  object: Record<string, unknown>,
  known: string[],
  configPath: string,
  field: string | null
): void {
  for (const key of Object.keys(object)) {
    if (known.includes(key)) continue;
    const location = field ? `${field}.${key}` : key;
    const suggestion = closestKey(key, known);
    fail(
      configPath,
      `unknown key ${location}.${suggestion ? ` Did you mean "${suggestion}"?` : ''} Valid keys: ${known.join(', ')}.`
    );
  }
}

function closestKey(key: string, known: string[]): string | null {
  const lower = key.toLowerCase();
  let best: { key: string; distance: number } | null = null;

  for (const candidate of known) {
    const distance = editDistance(lower, candidate.toLowerCase());
    if (distance <= Math.max(2, Math.floor(candidate.length / 3)) && (!best || distance < best.distance)) {
      best = { key: candidate, distance };
    }
  }

  return best?.key ?? null;
}

function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const substitution = (previous[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1);
      current[j] = Math.min((current[j - 1] ?? 0) + 1, (previous[j] ?? 0) + 1, substitution);
    }
    previous = current;
  }

  return previous[b.length] ?? 0;
}

function fail(configPath: string, message: string): never {
  throw new Error(`${configPath}: ${message}`);
}

async function findConfigFile(projectRoot: string, fileName: string): Promise<string | null> {
  const configPath = path.join(projectRoot, fileName);
  return (await pathExists(configPath)) ? configPath : null;
}
