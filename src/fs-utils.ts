import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { parseJsonc } from './jsonc.ts';

export function resolveConfigPath(
  projectRoot: string,
  cwd: string,
  configuredPath: string,
): string {
  if (path.isAbsolute(configuredPath)) return configuredPath;
  if (configuredPath.startsWith('.')) return path.resolve(projectRoot, configuredPath);
  return path.resolve(cwd, configuredPath);
}

/** Path references accept `~/`, absolute, and project-relative forms. */
/**
 * Where a declared path actually is. `~` is expanded here and nowhere else, in every
 * spelling the source grammar accepts: bare, and with either separator, because a Windows
 * config may reasonably write `~\code\thing`. Matching only `~/` left the other two
 * resolving against the project root, which silently invents a directory literally named
 * `~` beside it.
 */
export function resolveReferencePath(projectRoot: string, requested: string): string {
  const home = /^~([/\\](.*))?$/u.exec(requested);
  if (home) return home[2] ? path.join(os.homedir(), home[2]) : os.homedir();
  if (path.isAbsolute(requested)) return requested;
  return path.resolve(projectRoot, requested);
}

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * What a declared path turned out to be on disk, or null when nothing is there. A path
 * reference names a coordinate; whether it is a file or a folder is a fact about this
 * machine, so it is observed here rather than declared in the config.
 */
export async function pathKind(target: string): Promise<'file' | 'folder' | null> {
  try {
    const stat = await fs.stat(target);
    return stat.isDirectory() ? 'folder' : 'file';
  } catch {
    return null;
  }
}

export async function readJsonFile<T>(filePath: string): Promise<T> {
  return JSON.parse(await fs.readFile(filePath, 'utf8')) as T;
}

/** For the files people edit by hand, where a comment beside an entry has to survive. */
export async function readJsoncFile<T>(filePath: string): Promise<T> {
  return parseJsonc<T>(await fs.readFile(filePath, 'utf8'));
}

/**
 * Shortens a home path to `~/...` for a human reading a terminal. Callers must pass
 * `tilde: false` whenever the output is piped: an agent may hand the path straight to a
 * file API, and `~` is not a path there.
 */
export function displayPath(
  value: string | null,
  { tilde = false, home }: { tilde?: boolean; home?: string } = {},
): string {
  if (!value) return '-';
  const prefix = (home ?? os.homedir()) + path.sep;
  if (!tilde || !value.startsWith(prefix)) return value;
  return `~${path.sep}${value.slice(prefix.length)}`;
}
