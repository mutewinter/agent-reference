import path from 'node:path';

import { pathExists, readJsonFile } from './fs-utils.ts';
import { isExactRegistryVersion, parsePackageAtVersion } from './package-utils.ts';
import { repositoryNameFromSpec } from './repository.ts';
import type {
  AgentReferenceConfig,
  ConfiguredFolderReference,
  ConfiguredGitReference,
  ConfiguredPackageReference,
  ConfiguredReference,
  ConfiguredSet,
  LoadedAgentReferenceConfig
} from './types.ts';

export const DEFAULT_CONFIG_FILE = 'agent-reference.json';
export const DEFAULT_LOCAL_CONFIG_FILE = 'agent-reference.local.json';

const TOP_LEVEL_KEYS = [
  '$schema',
  'packages',
  'folders',
  'git',
  'sets',
  'allImporters',
  'registry',
  'cacheDir'
];
/**
 * A package entry is a coordinate, not a question. `installed` used to mean "whatever the
 * lockfile says", which resolved differently depending on the directory the command ran in
 * and, in a workspace, could name a version this project does not install. Ranges and
 * dist-tags have the same defect one step removed: they answer differently next week.
 */
const VERSION_HELP =
  'Run `agent-reference versions <name>` to see every version this project installs, then pin that number.';

function requirePackageVersion(value: unknown, configPath: string, field: string): string {
  if (value === undefined || value === null) {
    fail(configPath, `${field} is required and must be an exact version such as "1.2.3". ${VERSION_HELP}`);
  }

  const version = requireNonEmpty(expectString(value, configPath, field), configPath, field);
  if (!isExactRegistryVersion(version)) {
    fail(
      configPath,
      `${field} is "${version}", which is not an exact version. Ranges, dist-tags, and "installed" are not accepted: a config entry has to mean the same thing on every machine and next month. ${VERSION_HELP}`
    );
  }

  return version;
}

const PACKAGE_KEYS = ['version', 'ref', 'repository', 'directory', 'description'];
const FOLDER_KEYS = ['path', 'description'];
const GIT_KEYS = ['repository', 'ref', 'description'];
const SET_KEYS = ['name', 'description', 'packages', 'folders', 'git'];
const SET_FOLDER_KEYS = ['path', 'name', 'description'];
const SET_GIT_KEYS = ['repository', 'ref', 'name', 'description'];
const SET_PACKAGE_KEYS = ['name', 'version', 'ref', 'repository', 'directory', 'description'];

function emptyConfig(): AgentReferenceConfig {
  return { packages: [], folders: [], git: [], sets: [] };
}

export async function loadAgentReferenceConfig(projectRoot: string): Promise<LoadedAgentReferenceConfig | null> {
  const configPath = await findConfigFile(projectRoot, DEFAULT_CONFIG_FILE);
  const localPath = await findConfigFile(projectRoot, DEFAULT_LOCAL_CONFIG_FILE);

  if (!configPath && !localPath) return null;

  const baseConfig = configPath ? parseConfig(await readConfigJson(configPath), configPath) : emptyConfig();
  const localConfig = localPath ? parseConfig(await readConfigJson(localPath), localPath) : emptyConfig();
  for (const reference of [...localConfig.packages, ...localConfig.folders, ...localConfig.git]) {
    reference.scope = 'local';
  }

  return {
    path: configPath,
    localPath,
    config: mergeConfigs(baseConfig, localConfig)
  };
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
  parseSets(object.sets, configPath, config);
  mergeDuplicateReferences(config, configPath);

  if (object.allImporters !== undefined) config.allImporters = expectBoolean(object.allImporters, configPath, 'allImporters');
  if (object.registry !== undefined) config.registry = expectString(object.registry, configPath, 'registry');
  if (object.cacheDir !== undefined) config.cacheDir = expectString(object.cacheDir, configPath, 'cacheDir');

  return config;
}

/**
 * A set is a labeled list: a required description saying what the collection is for, and
 * members declared inline, mirroring how humans actually keep these lists. Member names
 * derive from the path or repository basename unless overridden.
 */
function parseSets(value: unknown, configPath: string, config: AgentReferenceConfig): void {
  if (value === undefined || value === null) return;
  if (!Array.isArray(value)) fail(configPath, 'sets must be an array of set objects.');

  for (const [index, entry] of value.entries()) {
    const field = `sets[${index}]`;
    const object = expectObject(entry, configPath, field);
    assertKnownKeys(object, SET_KEYS, configPath, field);
    if (object.description === undefined) {
      fail(configPath, `${field}.description is required: it is the heading that says what this set is for.`);
    }

    const description = requireNonEmpty(
      expectString(object.description, configPath, `${field}.description`),
      configPath,
      `${field}.description`
    );
    const name = optionalString(object.name, configPath, `${field}.name`);
    const set: ConfiguredSet = { name, description };
    const label = setLabel(set);
    config.sets.push(set);

    for (const [itemIndex, item] of memberEntries(object.folders, configPath, `${field}.folders`)) {
      config.folders.push(parseSetFolder(item, configPath, `${field}.folders[${itemIndex}]`, label));
    }
    for (const [itemIndex, item] of memberEntries(object.git, configPath, `${field}.git`)) {
      config.git.push(parseSetGit(item, configPath, `${field}.git[${itemIndex}]`, label));
    }
    for (const [itemIndex, item] of memberEntries(object.packages, configPath, `${field}.packages`)) {
      config.packages.push(parseSetPackage(item, configPath, `${field}.packages[${itemIndex}]`, label));
    }
  }
}

export function setLabel(set: ConfiguredSet): string {
  return set.name ?? set.description;
}

function parseSetFolder(
  item: unknown,
  configPath: string,
  field: string,
  label: string
): ConfiguredFolderReference {
  if (typeof item === 'string') {
    const folderPath = requireNonEmpty(item, configPath, field);
    return {
      kind: 'folder',
      name: basenameOf(folderPath),
      scope: 'shared',
      path: folderPath,
      description: null,
      sets: [label]
    };
  }

  const object = expectObject(item, configPath, field, 'a path string or an object');
  assertKnownKeys(object, SET_FOLDER_KEYS, configPath, field);
  if (object.path === undefined) fail(configPath, `${field}.path is required.`);
  const folderPath = requireNonEmpty(expectString(object.path, configPath, `${field}.path`), configPath, `${field}.path`);

  return {
    kind: 'folder',
    name: optionalString(object.name, configPath, `${field}.name`) ?? basenameOf(folderPath),
    scope: 'shared',
    path: folderPath,
    description: parseDescription(object.description, configPath, field),
    sets: [label]
  };
}

function parseSetGit(item: unknown, configPath: string, field: string, label: string): ConfiguredGitReference {
  if (typeof item === 'string') {
    const spec = requireNonEmpty(item, configPath, field);
    const reference = gitReference(repositoryNameFromSpec(spec), spec, null, null, configPath, field);
    reference.sets = [label];
    return reference;
  }

  const object = expectObject(item, configPath, field, 'a repository string or an object');
  assertKnownKeys(object, SET_GIT_KEYS, configPath, field);
  if (object.repository === undefined) {
    fail(configPath, `${field}.repository is required. Use github:owner/repo, a git URL, or file:../repo.`);
  }
  const repository = requireNonEmpty(
    expectString(object.repository, configPath, `${field}.repository`),
    configPath,
    `${field}.repository`
  );

  const reference = gitReference(
    optionalString(object.name, configPath, `${field}.name`) ?? repositoryNameFromSpec(repository),
    repository,
    object.ref === undefined || object.ref === null ? null : expectString(object.ref, configPath, `${field}.ref`),
    parseDescription(object.description, configPath, field),
    configPath,
    field
  );
  reference.sets = [label];
  return reference;
}

function parseSetPackage(
  item: unknown,
  configPath: string,
  field: string,
  label: string
): ConfiguredPackageReference {
  if (typeof item === 'string') {
    const parsed = parsePackageAtVersion(requireNonEmpty(item, configPath, field));
    if (!parsed) {
      fail(configPath, `${field} must be "name@version" with an exact version, such as "react@18.2.0". ${VERSION_HELP}`);
    }
    return {
      kind: 'package',
      name: parsed.name,
      scope: 'shared',
      version: parsed.version,
      ref: null,
      repository: null,
      directory: null,
      description: null,
      sets: [label]
    };
  }

  const object = expectObject(item, configPath, field, 'a package name string or an object');
  assertKnownKeys(object, SET_PACKAGE_KEYS, configPath, field);
  if (object.name === undefined) fail(configPath, `${field}.name is required.`);

  return {
    kind: 'package',
    name: requireNonEmpty(expectString(object.name, configPath, `${field}.name`), configPath, `${field}.name`),
    scope: 'shared',
    version: requirePackageVersion(object.version, configPath, `${field}.version`),
    ref: optionalString(object.ref, configPath, `${field}.ref`),
    repository: optionalString(object.repository, configPath, `${field}.repository`),
    directory: optionalString(object.directory, configPath, `${field}.directory`),
    description: parseDescription(object.description, configPath, field),
    sets: [label]
  };
}

/**
 * The same reference may be listed in several sets, or in a set and at top level; that is
 * repetition, not conflict, and merges into one reference belonging to every set. Two
 * declarations disagreeing about what the name points at is a real conflict.
 */
function mergeDuplicateReferences(config: AgentReferenceConfig, configPath: string): void {
  config.packages = mergeKind(config.packages, configPath, (entry) =>
    [entry.version, entry.ref, entry.repository, entry.directory].join('\u0000')
  );
  config.folders = mergeKind(config.folders, configPath, (entry) => entry.path);
  config.git = mergeKind(config.git, configPath, (entry) => entry.spec);
}

function mergeKind<T extends ConfiguredReference>(
  entries: T[],
  configPath: string,
  identity: (entry: T) => string
): T[] {
  const byName = new Map<string, T>();

  for (const entry of entries) {
    const existing = byName.get(entry.name);
    if (!existing) {
      byName.set(entry.name, entry);
      continue;
    }
    if (identity(existing) !== identity(entry)) {
      fail(
        configPath,
        `${entry.kind} "${entry.name}" is declared more than once with different targets. Give one of them an explicit "name".`
      );
    }
    existing.sets = [...existing.sets, ...entry.sets.filter((label) => !existing.sets.includes(label))];
    existing.description ??= entry.description;
  }

  return [...byName.values()];
}

function basenameOf(folderPath: string): string {
  const normalized = folderPath.replace(/\\/g, '/').replace(/\/+$/, '');
  const base = path.posix.basename(normalized);
  return base && base !== '.' && base !== '~' ? base : normalized;
}

function memberEntries(value: unknown, configPath: string, field: string): Array<[number, unknown]> {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) fail(configPath, `${field} must be an array.`);
  return value.map((item, index) => [index, item]);
}

function parsePackageEntry(name: string, entry: unknown, configPath: string): ConfiguredPackageReference {
  const field = `packages.${name}`;
  if (typeof entry === 'string') {
    return {
      kind: 'package',
      name,
      scope: 'shared',
      version: requirePackageVersion(entry, configPath, field),
      ref: null,
      repository: null,
      directory: null,
      description: null,
      sets: []
    };
  }

  const object = expectObject(entry, configPath, field, 'a version string or an object');
  assertKnownKeys(object, PACKAGE_KEYS, configPath, field);

  return {
    kind: 'package',
    name,
    scope: 'shared',
    version: requirePackageVersion(object.version, configPath, `${field}.version`),
    ref: optionalString(object.ref, configPath, `${field}.ref`),
    repository: optionalString(object.repository, configPath, `${field}.repository`),
    directory: optionalString(object.directory, configPath, `${field}.directory`),
    description: parseDescription(object.description, configPath, field),
    sets: []
  };
}

function parseFolderEntry(name: string, entry: unknown, configPath: string): ConfiguredFolderReference {
  const field = `folders.${name}`;
  if (typeof entry === 'string') {
    return { kind: 'folder', name, scope: 'shared', path: requireNonEmpty(entry, configPath, field), description: null, sets: [] };
  }

  const object = expectObject(entry, configPath, field, 'a path string or an object');
  assertKnownKeys(object, FOLDER_KEYS, configPath, field);
  if (object.path === undefined) {
    fail(configPath, `${field}.path is required.`);
  }

  return {
    kind: 'folder',
    name,
    scope: 'shared',
    path: requireNonEmpty(expectString(object.path, configPath, `${field}.path`), configPath, `${field}.path`),
    description: parseDescription(object.description, configPath, field),
    sets: []
  };
}

function parseGitEntry(name: string, entry: unknown, configPath: string): ConfiguredGitReference {
  const field = `git.${name}`;
  if (typeof entry === 'string') {
    return gitReference(name, requireNonEmpty(entry, configPath, field), null, null, configPath, field);
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
    configPath,
    field
  );
}

function gitReference(
  name: string,
  repositorySpec: string,
  explicitRef: string | null,
  description: string | null,
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
  return { kind: 'git', name, scope: 'shared', repository, ref, spec: gitSpec(repository, ref), description, sets: [] };
}

function gitSpec(repository: string, ref: string | null): string {
  return ref ? `${repository}#${ref}` : repository;
}

function parseDescription(value: unknown, configPath: string, field: string): string | null {
  if (value === undefined || value === null) return null;
  return expectString(value, configPath, `${field}.description`).trim() || null;
}

function optionalString(value: unknown, configPath: string, field: string): string | null {
  if (value === undefined || value === null) return null;
  return expectString(value, configPath, field).trim() || null;
}

function mergeConfigs(base: AgentReferenceConfig, local: AgentReferenceConfig): AgentReferenceConfig {
  const sets = [...base.sets];
  for (const set of local.sets) {
    if (!sets.some((existing) => setLabel(existing) === setLabel(set))) sets.push(set);
  }

  const cacheDir = local.cacheDir ?? base.cacheDir;

  return {
    packages: mergeByName(base.packages, local.packages),
    folders: mergeByName(base.folders, local.folders),
    git: mergeByName(base.git, local.git),
    sets,
    allImporters: local.allImporters ?? base.allImporters,
    registry: local.registry ?? base.registry,
    cacheDir,
    cacheDirScope: cacheDir === undefined ? undefined : local.cacheDir === undefined ? 'shared' : 'local'
  };
}

function mergeByName<T extends { name: string }>(base: T[], local: T[]): T[] {
  const byName = new Map(base.map((entry) => [entry.name, entry]));
  for (const entry of local) {
    byName.set(entry.name, entry);
  }
  return [...byName.values()];
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
