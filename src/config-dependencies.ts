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
  if (!config?.packages) {
    return { packages: [], missingInstalled: [] };
  }

  const packages: PackageReference[] = [];
  const missingInstalled: string[] = [];
  const installedByName = new Map(installedPackages.map((dependency) => [dependency.name, dependency]));

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

    packages.push({
      name,
      version: await resolveRegistryVersion(name, specifier, options),
      specifier,
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
