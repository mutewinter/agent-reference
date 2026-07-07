import fs from 'node:fs/promises';
import path from 'node:path';

import { pathExists, readJsonFile } from './fs-utils.ts';
import type { AgentReferenceConfig, LoadedAgentReferenceConfig } from './types.ts';

export const DEFAULT_CONFIG_FILE = 'agent-reference.json';
export const DEFAULT_LOCAL_CONFIG_FILE = 'agent-reference.local.json';

export async function loadAgentReferenceConfig(
  projectRoot: string,
  options: { configFile?: string | null } = {}
): Promise<LoadedAgentReferenceConfig | null> {
  const configPath = options.configFile
    ? path.resolve(projectRoot, options.configFile)
    : await findConfigFile(projectRoot, DEFAULT_CONFIG_FILE);
  const localPath = await findConfigFile(projectRoot, DEFAULT_LOCAL_CONFIG_FILE);

  if (!configPath && !localPath) return null;

  const baseConfig = configPath ? normalizeConfig(await readJsonFile(configPath), configPath) : {};
  const localConfig = localPath ? normalizeConfig(await readJsonFile(localPath), localPath) : {};

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

  if (!options.force && await pathExists(configPath)) {
    throw new Error(`${path.basename(configPath)} already exists. Use --force to overwrite it.`);
  }

  await fs.writeFile(configPath, `${JSON.stringify(normalizeConfig(config, configPath), null, 2)}\n`);
  return configPath;
}

function mergeConfigs(base: AgentReferenceConfig, local: AgentReferenceConfig): AgentReferenceConfig {
  return {
    packages: mergeMaps(base.packages, local.packages),
    folders: mergeMaps(base.folders, local.folders),
    git: mergeMaps(base.git, local.git),
    allPackages: local.allPackages ?? base.allPackages,
    allImporters: local.allImporters ?? base.allImporters,
    registry: local.registry ?? base.registry,
    worktreeDir: local.worktreeDir ?? base.worktreeDir,
    cacheDir: local.cacheDir ?? base.cacheDir
  };
}

function mergeMaps(
  base: Record<string, string> | undefined,
  local: Record<string, string> | undefined
): Record<string, string> | undefined {
  if (!base && !local) return undefined;
  return {
    ...(base ?? {}),
    ...(local ?? {})
  };
}

function normalizeConfig(value: unknown, configPath: string): AgentReferenceConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${configPath} must contain a JSON object.`);
  }

  const object = value as Record<string, unknown>;
  const normalized: AgentReferenceConfig = {};

  if (object.packages !== undefined) normalized.packages = normalizeStringMap(object.packages, configPath, 'packages');
  if (object.folders !== undefined) normalized.folders = normalizeStringMap(object.folders, configPath, 'folders');
  if (object.git !== undefined) normalized.git = normalizeStringMap(object.git, configPath, 'git');
  if (typeof object.allPackages === 'boolean') normalized.allPackages = object.allPackages;
  if (typeof object.allImporters === 'boolean') normalized.allImporters = object.allImporters;
  if (typeof object.registry === 'string') normalized.registry = object.registry;
  if (typeof object.worktreeDir === 'string') normalized.worktreeDir = object.worktreeDir;
  if (typeof object.cacheDir === 'string') normalized.cacheDir = object.cacheDir;

  return normalized;
}

function normalizeStringMap(value: unknown, configPath: string, field: string): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${configPath} ${field} must be an object mapping names to string values.`);
  }

  const entries = Object.entries(value as Record<string, unknown>);
  for (const [name, specifier] of entries) {
    if (typeof specifier !== 'string') {
      throw new Error(`${configPath} ${field}.${name} must be a string.`);
    }
  }

  return Object.fromEntries(entries) as Record<string, string>;
}

async function findConfigFile(projectRoot: string, fileName: string): Promise<string | null> {
  const configPath = path.join(projectRoot, fileName);
  return (await pathExists(configPath)) ? configPath : null;
}
