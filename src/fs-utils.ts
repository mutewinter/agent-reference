import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export function resolveConfigPath(projectRoot: string, cwd: string, configuredPath: string): string {
  if (path.isAbsolute(configuredPath)) return configuredPath;
  if (configuredPath.startsWith('.')) return path.resolve(projectRoot, configuredPath);
  return path.resolve(cwd, configuredPath);
}

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function readJsonFile<T>(filePath: string): Promise<T> {
  return JSON.parse(await fs.readFile(filePath, 'utf8')) as T;
}

/**
 * Shortens a home path to `~/...` for a human reading a terminal. Callers must pass
 * `tilde: false` whenever the output is piped: an agent may hand the path straight to a
 * file API, and `~` is not a path there.
 */
export function displayPath(
  value: string | null,
  options: { tilde: boolean; home?: string } = { tilde: false }
): string {
  if (!value) return '-';
  const prefix = (options.home ?? os.homedir()) + path.sep;
  if (!options.tilde || !value.startsWith(prefix)) return value;
  return `~${path.sep}${value.slice(prefix.length)}`;
}
