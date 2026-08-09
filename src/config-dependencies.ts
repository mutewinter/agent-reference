import { mergeDependencyEntries } from './package-utils.ts';
import { resolveRegistryVersion } from './registry.ts';
import type { AgentReferenceConfig, PackageReference, RegistryOptions } from './types.ts';

export interface ConfigPackageReferences {
  packages: PackageReference[];
  missingInstalled: string[];
}

export async function resolveConfigPackageReferences(
  config: AgentReferenceConfig | undefined,
  installedPackages: PackageReference[],
  options: RegistryOptions = {}
): Promise<ConfigPackageReferences> {
  if (!config || config.packages.length === 0) {
    return { packages: [], missingInstalled: [] };
  }

  const packages: PackageReference[] = [];
  const missingInstalled: string[] = [];
  const installedByName = new Map(installedPackages.map((dependency) => [dependency.name, dependency]));

  for (const entry of config.packages) {
    if (entry.version === 'installed') {
      const installed = installedByName.get(entry.name);
      if (installed) {
        packages.push(installed);
      } else {
        missingInstalled.push(entry.name);
      }
      continue;
    }

    packages.push({
      name: entry.name,
      version: await resolveRegistryVersion(entry.name, entry.version, options),
      specifier: entry.version,
      packageManager: 'config',
      dependencyTypes: [],
      importers: ['agent-reference.json']
    });
  }

  return {
    packages: mergeDependencyEntries(packages),
    missingInstalled
  };
}
