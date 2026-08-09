import fs from 'node:fs/promises';
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
