import { mergeDependencyEntries, selectInstalledPackage } from './package-utils.ts';
import type {
  AgentReferenceConfig,
  PackageDrift,
  PackageManager,
  PackageReference,
} from './types.ts';

export interface ConfigPackageReferences {
  packages: PackageReference[];
  /** Entries whose pinned version is not what this project installs any more. */
  drift: PackageDrift[];
}

/**
 * Turns config package entries into references. Every entry carries an exact version, so
 * this is a mapping rather than a resolution: nothing here reads a lockfile or a registry,
 * and the answer cannot change between two runs on two machines.
 *
 * The lockfile is still read, for one thing only: saying so when a pin has fallen behind
 * what the project installs. That is a report, never a correction, because a pinned version
 * is a decision somebody made.
 */
export function resolveConfigPackageReferences(
  config: AgentReferenceConfig | undefined,
  installedPackages: PackageReference[],
  options: { importer?: string; packageManager?: PackageManager } = {},
): ConfigPackageReferences {
  if (!config || config.packages.length === 0) {
    return { packages: [], drift: [] };
  }

  const packages: PackageReference[] = [];
  const drift: PackageDrift[] = [];

  for (const entry of config.packages) {
    packages.push({
      name: entry.name,
      version: entry.version,
      specifier: entry.version,
      // The project's own package manager, because that is what would install this version.
      // Where the version came from is a different question, and `PackageVersionSource`
      // answers it.
      packageManager: options.packageManager ?? 'unknown',
      dependencyTypes: [],
      importers: ['agent-reference.json'],
    });

    const installed = selectInstalledPackage(
      entry.name,
      installedPackages,
      options.importer ?? '.',
    );
    const versions = [...new Set(installed.candidates.map((candidate) => candidate.version))];
    if (versions.length > 0 && !versions.includes(entry.version)) {
      drift.push({
        name: entry.name,
        pinned: entry.version,
        installed: versions,
        importers: [...new Set(installed.candidates.flatMap((candidate) => candidate.importers))],
      });
    }
  }

  return { packages: mergeDependencyEntries(packages), drift };
}
