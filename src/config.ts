import fs from 'node:fs/promises';
import path from 'node:path';

import type { DepCloneConfig, LoadedDepCloneConfig } from './types.ts';

export const DEFAULT_CONFIG_FILE = 'depclone.config.json';
const CONFIG_FILES = [DEFAULT_CONFIG_FILE, '.depclonerc.json'];

export async function loadDepCloneConfig(
  projectRoot: string,
  options: { configFile?: string | null } = {}
): Promise<LoadedDepCloneConfig | null> {
  const configPath = options.configFile
    ? path.resolve(projectRoot, options.configFile)
    : await findConfigFile(projectRoot);

  if (!configPath) return null;

  const raw = await fs.readFile(configPath, 'utf8');
  const parsed = JSON.parse(raw) as unknown;
  return {
    path: configPath,
    config: normalizeConfig(parsed, configPath)
  };
}

export async function writeDepCloneConfig(
  projectRoot: string,
  config: DepCloneConfig,
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

function normalizeConfig(value: unknown, configPath: string): DepCloneConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${configPath} must contain a JSON object.`);
  }

  const object = value as Record<string, unknown>;
  const references = object.references;
  if (references !== undefined && (!Array.isArray(references) || references.some((item) => typeof item !== 'string'))) {
    throw new Error(`${configPath} references must be an array of package selectors.`);
  }

  const normalized: DepCloneConfig = {
    schemaVersion: 1
  };

  if (references) normalized.references = references;
  if (typeof object.all === 'boolean') normalized.all = object.all;
  if (typeof object.allImporters === 'boolean') normalized.allImporters = object.allImporters;
  if (typeof object.registry === 'string') normalized.registry = object.registry;
  if (typeof object.worktreeDir === 'string') normalized.worktreeDir = object.worktreeDir;
  if (typeof object.cacheDir === 'string') normalized.cacheDir = object.cacheDir;

  return normalized;
}

async function findConfigFile(projectRoot: string): Promise<string | null> {
  for (const fileName of CONFIG_FILES) {
    const configPath = path.join(projectRoot, fileName);
    if (await pathExists(configPath)) return configPath;
  }

  return null;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
