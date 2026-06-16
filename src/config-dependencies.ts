import path from 'node:path';

import { createDependencyEntry } from './lock-utils.ts';
import { dependencyKey, mergeDependencyEntries } from './package-utils.ts';
import { resolveRegistryVersion } from './registry-version.ts';
import type {
  AgentReferenceConfig,
  PackageReference,
  MetadataResolverOptions,
  ProjectContext
} from './types.ts';

export async function resolveConfigPackageReferences(
  config: AgentReferenceConfig | undefined,
  context: ProjectContext,
  installedPackages: PackageReference[],
  options: MetadataResolverOptions & { configPath?: string } = {}
): Promise<{
  packages: PackageReference[];
  missingInstalled: string[];
}> {
  if (!config?.packages) {
    return { packages: [], missingInstalled: [] };
  }

  const packages: PackageReference[] = [];
  const missingInstalled: string[] = [];
  const installedByName = new Map(installedPackages.map((dependency) => [dependency.name, dependency]));
  const configPath = options.configPath ?? path.join(context.projectRoot, 'agent-reference.json');

  for (const [name, specifier] of Object.entries(config.packages)) {
    if (specifier === 'installed') {
      const installed = installedByName.get(name);
      if (installed) {
        packages.push(installed);
      } else {
        missingInstalled.push(name);
      }
      continue;
    }

    const version = await resolveRegistryVersion(name, specifier, options);
    packages.push(createDependencyEntry({
      name,
      version,
      specifier,
      dependencyType: 'dependencies',
      packageManager: 'config',
      importer: 'agent-reference.json',
      projectRoot: context.projectRoot,
      packageJsonPath: configPath,
      lockfilePath: context.lockfilePath
    }));
  }

  return {
    packages: mergeDependencyEntries(packages),
    missingInstalled
  };
}

export function packageReferenceSelectors(config: AgentReferenceConfig | undefined): string[] {
  return Object.entries(config?.packages ?? {})
    .filter(([, specifier]) => specifier === 'installed')
    .map(([name]) => name);
}

export function exactPackageReferenceKey(reference: PackageReference): string {
  return dependencyKey(reference.name, reference.version);
}
