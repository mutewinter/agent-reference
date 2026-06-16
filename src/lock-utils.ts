import path from 'node:path';

import { DEPENDENCY_SECTIONS, mergeDependencyEntries } from './package-utils.ts';
import { directPackageJsonDependencies, readPackageJson } from './package-json.ts';
import type {
  PackageReference,
  DependencyType,
  PackageManager,
  ProjectContext,
  ScanProjectOptions
} from './types.ts';

export async function dependenciesFromPackageJsonDirectives(
  context: ProjectContext,
  options: ScanProjectOptions,
  resolveVersion: (dependency: {
    name: string;
    specifier: string;
    dependencyType: DependencyType;
    importer: string;
  }) => string | null
): Promise<PackageReference[]> {
  const include = options.include ?? DEPENDENCY_SECTIONS;
  const packageJson = await readPackageJson(context.packageJsonPath);
  const entries: PackageReference[] = [];

  for (const dependency of directPackageJsonDependencies(packageJson, include)) {
    const version = resolveVersion({ ...dependency, importer: context.importer });
    if (!version) continue;

    entries.push(createDependencyEntry({
      ...dependency,
      version,
      packageManager: context.packageManager,
      importer: context.importer,
      projectRoot: context.projectRoot,
      packageJsonPath: context.packageJsonPath,
      lockfilePath: context.lockfilePath
    }));
  }

  return mergeDependencyEntries(entries);
}

export function createDependencyEntry(input: {
  name: string;
  alias?: string | null;
  version: string;
  specifier: string | null;
  dependencyType: DependencyType;
  packageManager: PackageManager;
  importer: string;
  projectRoot: string;
  packageJsonPath: string;
  lockfilePath: string;
}): PackageReference {
  return {
    name: input.name,
    alias: input.alias ?? null,
    version: input.version,
    specifier: input.specifier,
    dependencyType: input.dependencyType,
    dependencyTypes: [input.dependencyType],
    importer: input.importer,
    importers: [input.importer],
    packageManager: input.packageManager,
    packageJsonPath: input.packageJsonPath,
    packageJsonPaths: [input.packageJsonPath],
    lockfilePath: input.lockfilePath
  };
}

export function nodeModulesPackagePath(importer: string, name: string): string {
  const parts = importer === '.' ? [] : [importer];
  return path.join(...parts, 'node_modules', ...name.split('/'));
}
