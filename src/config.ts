import path from 'node:path';

import { pathExists, readJsoncFile } from './fs-utils.ts';
import { isExactRegistryVersion, SUPPORTED_ECOSYSTEM } from './package-utils.ts';
import { classifySource, UnknownSourceError } from './source.ts';
import type { ClassifiedSource } from './source.ts';
import type {
  AgentReferenceConfig,
  ConfiguredReference,
  ConfiguredSet,
  LoadedAgentReferenceConfig,
} from './types.ts';

export const DEFAULT_CONFIG_FILE = 'agent-reference.json';
export const DEFAULT_LOCAL_CONFIG_FILE = 'agent-reference.local.json';

const TOP_LEVEL_KEYS = ['$schema', 'references', 'allImporters', 'registry', 'cacheDir'];
/** A reference: one name, one source, plus what has to be said about reaching it. */
const REFERENCE_KEYS = ['source', 'ref', 'repository', 'directory', 'description'];
/** A set: a heading, and the references it holds. Members are references, keyed the same way. */
const SET_KEYS = ['description', 'references'];

/**
 * A package coordinate is a fixed point, not a question. `installed` used to mean "whatever
 * the lockfile says", which resolved differently depending on the directory the command ran
 * in and, in a workspace, could name a version this project does not install. Ranges and
 * dist-tags have the same defect one step removed: they answer differently next week.
 */
const VERSION_HELP =
  'Run `agent-reference versions <name>` to see every version this project installs, then pin that number.';

function emptyConfig(): AgentReferenceConfig {
  return { packages: [], paths: [], git: [], sets: [] };
}

export async function loadAgentReferenceConfig(
  projectRoot: string,
): Promise<LoadedAgentReferenceConfig | null> {
  const configPath = await findConfigFile(projectRoot, DEFAULT_CONFIG_FILE);
  const localPath = await findConfigFile(projectRoot, DEFAULT_LOCAL_CONFIG_FILE);

  if (!configPath && !localPath) return null;

  const baseConfig = configPath
    ? parseConfig(await readConfigJson(configPath), configPath)
    : emptyConfig();
  const localConfig = localPath
    ? parseConfig(await readConfigJson(localPath), localPath)
    : emptyConfig();
  for (const reference of [...localConfig.packages, ...localConfig.paths, ...localConfig.git]) {
    reference.scope = 'local';
  }
  for (const set of localConfig.sets) {
    set.scope = 'local';
  }

  const config = mergeConfigs(baseConfig, localConfig);
  assertMergedNamesAreFree(config, configPath, localPath);

  return { path: configPath, localPath, config };
}

async function readConfigJson(configPath: string): Promise<unknown> {
  try {
    return await readJsoncFile<unknown>(configPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `${configPath} is not valid JSON: ${message}. Comments and trailing commas are accepted here, so the problem is something else.`,
      { cause: error },
    );
  }
}

export function parseConfig(value: unknown, configPath: string): AgentReferenceConfig {
  const object = expectObject(value, configPath, null);
  assertRenamedKeys(object, configPath);
  assertKnownKeys(object, TOP_LEVEL_KEYS, configPath, null);

  const config = emptyConfig();
  parseReferences(object.references, configPath, config);
  assertSetNamesAreFree(config, configPath);

  if (object.allImporters !== undefined)
    config.allImporters = expectBoolean(object.allImporters, configPath, 'allImporters');
  if (object.registry !== undefined)
    config.registry = expectString(object.registry, configPath, 'registry');
  if (object.cacheDir !== undefined)
    config.cacheDir = expectString(object.cacheDir, configPath, 'cacheDir');

  return config;
}

/**
 * One map, one namespace, one shape. A value is an object holding either `source` or
 * `references`: the first is a reference and the second is a set, which is the only rule a
 * writer carries. What kind of reference it is comes out of the source rather than being
 * declared, the way a path's file-or-folder shape already does.
 */
function parseReferences(value: unknown, configPath: string, config: AgentReferenceConfig): void {
  if (value === undefined || value === null) return;
  const object = expectObject(
    value,
    configPath,
    'references',
    'an object mapping names to sources',
  );

  for (const [name, entry] of Object.entries(object)) {
    if (!name.trim()) fail(configPath, 'references has an empty reference name.');
    const field = `references.${name}`;
    const shape = expectEntryObject(entry, configPath, field);

    if (shape.references !== undefined) {
      assertKnownKeys(shape, SET_KEYS, configPath, field);
      parseSet(name, shape, configPath, field, config);
      continue;
    }

    pushReference(config, parseReference(name, shape, configPath, field, []), configPath);
  }
}

/**
 * The shape rule, stated once and in the one place a writer meets it. A value that is not an
 * object is the shorthand this format used to accept, so each old spelling names what it
 * became rather than reporting the type it is not.
 */
function expectEntryObject(
  entry: unknown,
  configPath: string,
  field: string,
): Record<string, unknown> {
  if (typeof entry === 'string') {
    fail(
      configPath,
      `${field} is a bare source string. Every entry is an object now: write { "source": "${entry}", "description": "..." }. The description is what makes the reference worth having.`,
    );
  }
  if (Array.isArray(entry)) {
    fail(
      configPath,
      `${field} is an array. A set is an object with a "description" and a "references" object keyed by name: { "description": "...", "references": { "<name>": { "source": "...", "description": "..." } } }.`,
    );
  }
  const object = expectObject(entry, configPath, field, 'an object');
  assertRenamedKeys(object, configPath, field);
  if (object.source !== undefined && object.references !== undefined) {
    fail(
      configPath,
      `${field} has both "source" and "references". A reference names one source; a set holds several under "references". It cannot be both.`,
    );
  }
  if (object.source === undefined && object.references === undefined) {
    assertKnownKeys(object, [...REFERENCE_KEYS, 'references'], configPath, field);
    fail(
      configPath,
      `${field} has neither "source" nor "references". A reference names one source; a set holds a "references" object of them.`,
    );
  }
  return object;
}

/** A set is a reference that resolves to several paths. Its key is its name, like any other. */
function parseSet(
  name: string,
  entry: Record<string, unknown>,
  configPath: string,
  field: string,
  config: AgentReferenceConfig,
): void {
  const members = expectObject(
    entry.references,
    configPath,
    `${field}.references`,
    'an object mapping names to sources, the same shape as the top-level map',
  );

  config.sets.push({
    name,
    description: requireDescription(entry.description, configPath, field),
    scope: 'shared',
  });

  for (const [memberName, member] of Object.entries(members)) {
    const memberField = `${field}.references.${memberName}`;
    if (!memberName.trim()) fail(configPath, `${field}.references has an empty reference name.`);
    const shape = expectEntryObject(member, configPath, memberField);
    if (shape.references !== undefined) {
      fail(
        configPath,
        `${memberField} is a set inside a set. A set holds references, never other sets; give this one its own name in "references".`,
      );
    }
    pushReference(
      config,
      parseReference(memberName, shape, configPath, memberField, [name]),
      configPath,
    );
  }
}

/** One reference, wherever it was written. Its key is its name, at either level. */
function parseReference(
  name: string,
  object: Record<string, unknown>,
  configPath: string,
  field: string,
  sets: string[],
): ConfiguredReference {
  assertKnownKeys(object, REFERENCE_KEYS, configPath, field);
  if (object.source === undefined) {
    fail(
      configPath,
      `${field}.source is required. Write it the way you would pass it to get: a path, github:owner/repo, a git URL, or npm:name@version.`,
    );
  }
  const spec = requireNonEmpty(
    expectString(object.source, configPath, `${field}.source`),
    configPath,
    `${field}.source`,
  );
  const ref = optionalString(object.ref, configPath, `${field}.ref`);
  const repository = optionalString(object.repository, configPath, `${field}.repository`);
  const directory = optionalString(object.directory, configPath, `${field}.directory`);
  const description = requireDescription(object.description, configPath, field);

  const source = classify(spec, configPath, `${field}.source`);
  const referenceName = requireNonEmpty(name, configPath, field);

  if (source.kind === 'path') {
    rejectKey(ref, 'ref', field, configPath, 'a checkout read where it lives has no other ref');
    rejectKey(repository, 'repository', field, configPath, 'the source is already the location');
    rejectKey(directory, 'directory', field, configPath, 'point the source at the subfolder');
    return {
      kind: 'path',
      name: referenceName,
      scope: 'shared',
      path: source.path,
      description,
      sets,
    };
  }

  if (source.kind === 'git') {
    rejectKey(
      repository,
      'repository',
      field,
      configPath,
      'the source is already the repository, and "repository" only overrides what a registry reported for a package',
    );
    if (ref && source.ref && ref !== source.ref) {
      fail(
        configPath,
        `${field} sets ref "${ref}" but the source already pins "#${source.ref}". Use one or the other.`,
      );
    }
    const resolved = ref ?? source.ref;
    return {
      kind: 'git',
      name: referenceName,
      scope: 'shared',
      repository: source.repository,
      ref: resolved,
      spec: resolved ? `${source.repository}#${resolved}` : source.repository,
      directory,
      description,
      sets,
    };
  }

  // A package reference resolves through a registry and is audited against a lockfile, both
  // of which key on the package's own name. Letting the handle differ would mean carrying
  // two names for one entry, so the key is the name and the error says how to spell it.
  if (name !== source.name) {
    fail(
      configPath,
      `${field} is named "${name}" but its source is the package ${source.name}. A package reference is keyed by its package name: write "${source.name}": { "source": "${spec}", … }. To give a source a name of your own, point it at the repository instead.`,
    );
  }

  if (!source.version) {
    fail(
      configPath,
      `${field} names no version. A package source carries an exact one, as in "${SUPPORTED_ECOSYSTEM}:${source.name}@1.2.3". ${VERSION_HELP}`,
    );
  }
  if (!isExactRegistryVersion(source.version)) {
    fail(
      configPath,
      `${field} pins "${source.version}", which is not an exact version. Ranges, dist-tags, and "installed" are not accepted: a config entry has to mean the same thing on every machine and next month. ${VERSION_HELP}`,
    );
  }

  return {
    kind: 'package',
    name: referenceName,
    ecosystem: source.ecosystem,
    scope: 'shared',
    version: source.version,
    ref,
    repository,
    directory,
    description,
    sets,
  };
}

function classify(spec: string, configPath: string, field: string): ClassifiedSource {
  try {
    return classifySource(spec);
  } catch (error) {
    if (error instanceof UnknownSourceError) fail(configPath, `${field}: ${error.message}`);
    throw error;
  }
}

/** A key that does nothing where it was written is a config that is quietly wrong. */
function rejectKey(
  value: string | null,
  key: string,
  field: string,
  configPath: string,
  why: string,
): void {
  if (value === null) return;
  fail(configPath, `${field}.${key} does nothing for this source: ${why}.`);
}

/**
 * Names are one namespace now. The same source listed in two sets is repetition and merges
 * into one reference carrying both labels; two declarations pointing somewhere different is
 * a conflict to name rather than to resolve.
 */
function pushReference(
  config: AgentReferenceConfig,
  reference: ConfiguredReference,
  configPath: string,
): void {
  const existing = findByName(config, reference.name);
  if (!existing) {
    if (reference.kind === 'package') config.packages.push(reference);
    else if (reference.kind === 'path') config.paths.push(reference);
    else config.git.push(reference);
    return;
  }

  if (existing.kind !== reference.kind || identity(existing) !== identity(reference)) {
    fail(
      configPath,
      `"${reference.name}" is declared more than once and the two point somewhere different. Give one of them its own "name".`,
    );
  }

  existing.sets = [
    ...existing.sets,
    ...reference.sets.filter((label) => !existing.sets.includes(label)),
  ];
}

function findByName(config: AgentReferenceConfig, name: string): ConfiguredReference | undefined {
  return [...config.packages, ...config.paths, ...config.git].find(
    (reference) => reference.name === name,
  );
}

function identity(reference: ConfiguredReference): string {
  if (reference.kind === 'package') {
    return [
      reference.ecosystem,
      reference.version,
      reference.ref,
      reference.repository,
      reference.directory,
    ].join(' ');
  }
  if (reference.kind === 'path') return reference.path;
  return [reference.spec, reference.directory].join(' ');
}

/**
 * A set name and a reference name are the same kind of handle, so they cannot both be
 * taken. Checked after the whole map is read, because a set may be declared above the
 * member that collides with it.
 */
function assertSetNamesAreFree(config: AgentReferenceConfig, configPath: string): void {
  for (const set of config.sets) {
    const clash = findByName(config, set.name);
    if (clash) {
      fail(
        configPath,
        `"${set.name}" is both a set and a ${clash.kind} reference. One name means one thing here: rename the set, or give that member its own "name".`,
      );
    }
  }
}

export function setLabel(set: ConfiguredSet): string {
  return set.name;
}

/**
 * A set and a reference cannot share a name, and the two files parse
 * separately, so this collision only exists after the merge. It is not an
 * override the way two references are: one resolves to a path and the other to
 * several, so there is nothing to prefer. Both filenames are named, because the
 * fix is in whichever of them the reader does not have open.
 */
function assertMergedNamesAreFree(
  config: AgentReferenceConfig,
  configPath: string | null,
  localPath: string | null,
): void {
  const shared = configPath ?? DEFAULT_CONFIG_FILE;
  const local = localPath ?? DEFAULT_LOCAL_CONFIG_FILE;

  for (const set of config.sets) {
    const clash = findByName(config, set.name);
    if (!clash) continue;
    const setFile = set.scope === 'local' ? local : shared;
    const referenceFile = clash.scope === 'local' ? local : shared;
    if (setFile === referenceFile) continue;
    throw new Error(
      `"${set.name}" is a set in ${setFile} and a ${clash.kind} reference in ${referenceFile}. One name means one thing across both files: rename one of them.`,
    );
  }
}

/**
 * The one field that is not about reaching the source. It is required because it is the
 * whole value of a reference to a future agent: a name it already has says nothing about
 * when the thing behind it is worth opening.
 */
function requireDescription(value: unknown, configPath: string, field: string): string {
  if (value === undefined || value === null) {
    fail(
      configPath,
      `${field}.description is required. Say when to read this and what it answers, in a sentence; the name alone is what the agent already has.`,
    );
  }
  const description = expectString(value, configPath, `${field}.description`).trim();
  if (!description) fail(configPath, `${field}.description must not be empty.`);
  return description;
}

function optionalString(value: unknown, configPath: string, field: string): string | null {
  if (value === undefined || value === null) return null;
  return expectString(value, configPath, field).trim() || null;
}

/**
 * The local file wins by name, which is the rule the guide states and two
 * comments repeat. It only held inside a kind: the three arrays merged
 * separately, so a local path and a committed package sharing a name both
 * survived, `get` answered with whichever it looked at first, and `status`
 * printed two rows for one name. Overriding now spans all three.
 */
function mergeConfigs(
  base: AgentReferenceConfig,
  local: AgentReferenceConfig,
): AgentReferenceConfig {
  const sets = [...base.sets];
  for (const set of local.sets) {
    if (!sets.some((existing) => existing.name === set.name)) sets.push(set);
  }

  // Only a local entry of a different kind drops the committed one here; a local
  // entry of the same kind replaces it in place further down, which keeps the
  // reference where it was in the file rather than moving it to the end.
  const overriddenKind = new Map(
    [...local.packages, ...local.paths, ...local.git].map((entry) => [entry.name, entry.kind]),
  );
  const kept = <T extends ConfiguredReference>(entries: T[]): T[] =>
    entries.filter((entry) => (overriddenKind.get(entry.name) ?? entry.kind) === entry.kind);

  const cacheDir = local.cacheDir ?? base.cacheDir;

  return {
    packages: mergeByName(kept(base.packages), local.packages),
    paths: mergeByName(kept(base.paths), local.paths),
    git: mergeByName(kept(base.git), local.git),
    sets,
    allImporters: local.allImporters ?? base.allImporters,
    registry: local.registry ?? base.registry,
    cacheDir,
    cacheDirScope:
      cacheDir === undefined ? undefined : local.cacheDir === undefined ? 'shared' : 'local',
  };
}

function mergeByName<T extends { name: string }>(base: T[], local: T[]): T[] {
  const byName = new Map(base.map((entry) => [entry.name, entry]));
  for (const entry of local) {
    byName.set(entry.name, entry);
  }
  return [...byName.values()];
}

function expectObject(
  value: unknown,
  configPath: string,
  field: string | null,
  expectation = 'a JSON object',
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

/**
 * The keys that became one map. "unknown key packages" would be true and useless: every
 * entry inside keeps its name, its description and its options, so say where they go rather
 * than leaving an agent to guess which of the valid keys replaced four of them. `name` is
 * here for the same reason: it was how a set member earned a handle, and now the key is.
 */
const MIGRATION_HELP: Record<string, string> = {
  folders:
    'a path is a source, so an entry becomes "docs": { "source": "./docs", "description": "..." }',
  paths:
    'a path is a source, so an entry becomes "docs": { "source": "./docs", "description": "..." }',
  packages:
    'the version moves into the source, so an entry becomes "zod": { "source": "npm:zod@3.22.0", "description": "..." }, beside the optional "ref" and "directory"',
  git: 'the repository moves into the source, so an entry becomes "pi": { "source": "github:earendil-works/pi", "description": "..." }, beside the optional "ref" and "directory"',
  sets: 'a set is a reference holding several, keyed by its name: "harnesses": { "description": "...", "references": { "pi": { "source": "...", "description": "..." } } }',
  name: 'a set member is keyed by its name now, exactly as a top-level entry is, so the key replaces this field',
};

function assertRenamedKeys(
  object: Record<string, unknown>,
  configPath: string,
  field: string | null = null,
): void {
  for (const [previous, help] of Object.entries(MIGRATION_HELP)) {
    if (object[previous] === undefined) continue;
    const location = field ? `${field}.${previous}` : previous;
    fail(
      configPath,
      `${location} was folded into one "references" map keyed by name: ${help}. Nothing else about the entry changes.`,
    );
  }
}

function assertKnownKeys(
  object: Record<string, unknown>,
  known: string[],
  configPath: string,
  field: string | null,
): void {
  for (const key of Object.keys(object)) {
    if (known.includes(key)) continue;
    const location = field ? `${field}.${key}` : key;
    const suggestion = closestKey(key, known);
    fail(
      configPath,
      `unknown key ${location}.${suggestion ? ` Did you mean "${suggestion}"?` : ''} Valid keys: ${known.join(', ')}.`,
    );
  }
}

function closestKey(key: string, known: string[]): string | null {
  const lower = key.toLowerCase();
  let best: { key: string; distance: number } | null = null;

  for (const candidate of known) {
    const distance = editDistance(lower, candidate.toLowerCase());
    if (
      distance <= Math.max(2, Math.floor(candidate.length / 3)) &&
      (!best || distance < best.distance)
    ) {
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
