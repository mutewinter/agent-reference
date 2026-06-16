import type { PackageReference, DependencyType } from './types.ts';

export const DEPENDENCY_SECTIONS: DependencyType[] = [
  'dependencies',
  'devDependencies',
  'optionalDependencies'
];

export function dependencyKey(name: string, version: string): string {
  return `${name}@${version}`;
}

export function slugifyPackageName(name: string): string {
  return name
    .replaceAll('/', '__')
    .replace(/[^a-zA-Z0-9@._-]/g, '_');
}

export function slugifyVersion(version: string): string {
  return String(version).replace(/[^a-zA-Z0-9._+-]/g, '_');
}

export function stripPnpmPeerSuffix(version: string | null | undefined): string | null {
  if (!version) return null;
  return String(version).split('(')[0] ?? null;
}

export function isExactRegistryVersion(version: string): boolean {
  return /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(String(version));
}

export function parsePackageAtVersion(value: string): { name: string; version: string } | null {
  const atIndex = value.startsWith('@') ? value.indexOf('@', 1) : value.lastIndexOf('@');
  if (atIndex <= 0) return null;

  const name = value.slice(0, atIndex);
  const version = value.slice(atIndex + 1);
  if (!name || !isExactRegistryVersion(version)) return null;

  return { name, version };
}

export function tagCandidatesForDependency(name: string, version: string): string[] {
  const leafName = name.includes('/') ? (name.split('/').at(-1) ?? name) : name;
  const candidates = [
    `${name}@${version}`,
    `${leafName}@${version}`,
    `v${version}`,
    version
  ];

  return [...new Set(candidates)];
}

export function mergeDependencyEntries(entries: PackageReference[]): PackageReference[] {
  const byKey = new Map<string, PackageReference>();

  for (const entry of entries) {
    const key = dependencyKey(entry.name, entry.version);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        ...entry,
        dependencyTypes: [entry.dependencyType],
        importers: [entry.importer],
        packageJsonPaths: entry.packageJsonPath ? [entry.packageJsonPath] : []
      });
      continue;
    }

    if (!existing.dependencyTypes.includes(entry.dependencyType)) {
      existing.dependencyTypes.push(entry.dependencyType);
    }
    if (!existing.importers.includes(entry.importer)) {
      existing.importers.push(entry.importer);
    }
    if (entry.packageJsonPath && !existing.packageJsonPaths.includes(entry.packageJsonPath)) {
      existing.packageJsonPaths.push(entry.packageJsonPath);
    }
  }

  return [...byKey.values()].sort((a, b) => {
    const byName = a.name.localeCompare(b.name);
    return byName || a.version.localeCompare(b.version);
  });
}
