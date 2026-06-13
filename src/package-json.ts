import fs from 'node:fs/promises';

import type { DependencyType } from './types.ts';

export interface PackageJsonDependency {
  name: string;
  specifier: string;
  dependencyType: DependencyType;
}

export interface PackageJson {
  name?: string;
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  workspaces?: string[] | { packages?: string[] };
}

export async function readPackageJson(packageJsonPath: string): Promise<PackageJson> {
  const raw = await fs.readFile(packageJsonPath, 'utf8');
  return JSON.parse(raw) as PackageJson;
}

export function directPackageJsonDependencies(
  packageJson: PackageJson,
  include: DependencyType[]
): PackageJsonDependency[] {
  const entries: PackageJsonDependency[] = [];

  for (const dependencyType of include) {
    const dependencies = packageJson[dependencyType] ?? {};
    for (const [name, specifier] of Object.entries(dependencies)) {
      entries.push({
        name,
        specifier,
        dependencyType
      });
    }
  }

  return entries;
}
