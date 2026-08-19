import { readJsonFile } from './fs-utils.ts';
import { mergeDependencyEntries } from './package-utils.ts';
import type { DependencyType, PackageReference, ProjectContext } from './types.ts';

export const DEPENDENCY_SECTIONS: DependencyType[] = [
  'dependencies',
  'devDependencies',
  'optionalDependencies'
];

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

export function directPackageJsonDependencies(packageJson: PackageJson): PackageJsonDependency[] {
  const entries: PackageJsonDependency[] = [];

  for (const dependencyType of DEPENDENCY_SECTIONS) {
    for (const [name, specifier] of Object.entries(packageJson[dependencyType] ?? {})) {
      entries.push({ name, specifier, dependencyType });
    }
  }

  return entries;
}

export async function dependenciesFromPackageJsonDirectives(
  context: ProjectContext,
  resolveVersion: (dependency: PackageJsonDependency) => string | null
): Promise<PackageReference[]> {
  // These scanners read the lockfile through package.json's direct dependencies, so a
  // lockfile with no package.json next to it yields nothing rather than an error.
  if (!context.packageJsonPath) return [];
  const packageJson = await readJsonFile<PackageJson>(context.packageJsonPath);
  const entries: PackageReference[] = [];

  for (const dependency of directPackageJsonDependencies(packageJson)) {
    const version = resolveVersion(dependency);
    if (!version) continue;

    entries.push({
      name: dependency.name,
      version,
      specifier: dependency.specifier,
      packageManager: context.packageManager,
      dependencyTypes: [dependency.dependencyType],
      importers: [context.importer]
    });
  }

  return mergeDependencyEntries(entries);
}
