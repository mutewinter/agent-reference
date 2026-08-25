import { isWorkspaceVersion } from './pnpm-lock.ts';
import type { PackageReference } from './types.ts';

export function dependencyKey(name: string, version: string): string {
  return `${name}@${version}`;
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
  const candidates = [`${name}@${version}`, `${leafName}@${version}`, `v${version}`, version];

  return [...new Set(candidates)];
}

export interface InstalledSelection {
  /** The one version to use, or null when there is nothing to use or nothing to choose by. */
  match: PackageReference | null;
  /** Every version of this name the lockfile installs, across all workspace importers. */
  candidates: PackageReference[];
}

/**
 * A lockfile holds one dependency list per workspace importer, so a name can be installed at
 * several versions at once. Preferring the importer the command ran in keeps the obvious
 * answer obvious, and anything left over is reported rather than guessed: the alternatives
 * are picking whichever version sorts first, or asking the registry for `latest`, and both
 * hand back a version this project does not install without saying so.
 */
export function selectInstalledPackage(
  name: string,
  packages: PackageReference[],
  importer: string,
): InstalledSelection {
  // Workspace links are part of the answer to "what is installed" but never to "what should
  // be fetched": the source is already in the repository.
  const candidates = packages.filter(
    (entry) => entry.name === name && !isWorkspaceVersion(entry.version),
  );
  if (candidates.length <= 1) return { match: candidates[0] ?? null, candidates };

  return {
    match: candidates.find((entry) => entry.importers.includes(importer)) ?? null,
    candidates,
  };
}

export function mergeDependencyEntries(entries: PackageReference[]): PackageReference[] {
  const byKey = new Map<string, PackageReference>();

  for (const entry of entries) {
    const key = dependencyKey(entry.name, entry.version);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        ...entry,
        dependencyTypes: [...entry.dependencyTypes],
        importers: [...entry.importers],
      });
      continue;
    }

    for (const dependencyType of entry.dependencyTypes) {
      if (!existing.dependencyTypes.includes(dependencyType)) {
        existing.dependencyTypes.push(dependencyType);
      }
    }
    for (const importer of entry.importers) {
      if (!existing.importers.includes(importer)) {
        existing.importers.push(importer);
      }
    }
  }

  return [...byKey.values()].toSorted((a, b) => {
    const byName = a.name.localeCompare(b.name);
    return byName || a.version.localeCompare(b.version);
  });
}

/**
 * Ecosystems a coordinate can name. Only npm resolves today, but the prefix is accepted and
 * printed now rather than retrofitted later: `requests` is a PyPI package and `request` is an
 * npm one, so a bare name stops being unambiguous the moment a second ecosystem exists, and
 * by then coordinates are sitting in committed configs and in agents' habits.
 */
export const SUPPORTED_ECOSYSTEM = 'npm';
export const KNOWN_ECOSYSTEMS: string[] = ['npm', 'pypi', 'crates', 'gem', 'go'];

export interface PackageCoordinate {
  ecosystem: string;
  name: string;
  version: string | null;
}

export function parsePackageCoordinate(spec: string): PackageCoordinate {
  let ecosystem = SUPPORTED_ECOSYSTEM;
  let rest = spec;

  const colon = spec.indexOf(':');
  if (colon > 0 && KNOWN_ECOSYSTEMS.includes(spec.slice(0, colon))) {
    ecosystem = spec.slice(0, colon);
    rest = spec.slice(colon + 1);
  }

  const at = rest.lastIndexOf('@');
  if (at > 0) return { ecosystem, name: rest.slice(0, at), version: rest.slice(at + 1) || null };
  return { ecosystem, name: rest, version: null };
}

/**
 * A `packages` key, which is a coordinate with the version left out because the value holds
 * it. Unlike `parsePackageCoordinate` this keeps an unrecognized prefix as an ecosystem
 * claim rather than folding it into the name: in a config file a key is written once and
 * read forever, so `foo:bar` has to fail loudly instead of becoming a package nothing can
 * ever resolve. A bare key means npm, which is what every key written before the prefix
 * existed already meant.
 */
export function parsePackageKey(key: string): PackageCoordinate {
  let ecosystem = SUPPORTED_ECOSYSTEM;
  let rest = key;

  const colon = key.indexOf(':');
  if (colon > 0) {
    ecosystem = key.slice(0, colon);
    rest = key.slice(colon + 1);
  }

  // Scoped names carry a leading `@` that is not a version separator, which is why this
  // looks for the last one past index zero.
  const at = rest.lastIndexOf('@');
  if (at > 0) return { ecosystem, name: rest.slice(0, at), version: rest.slice(at + 1) };
  return { ecosystem, name: rest, version: null };
}

/** The canonical spelling, printed back so an agent picks up the unambiguous form. */
export function formatCoordinate(name: string, version: string | null): string {
  return version ? `${SUPPORTED_ECOSYSTEM}:${name}@${version}` : `${SUPPORTED_ECOSYSTEM}:${name}`;
}

/** How a package reference is spelled as a `packages` key: bare for npm, prefixed otherwise. */
export function formatPackageKey(ecosystem: string, name: string): string {
  return ecosystem === SUPPORTED_ECOSYSTEM ? name : `${ecosystem}:${name}`;
}

export function unknownEcosystemMessage(ecosystem: string): string {
  return (
    `"${ecosystem}:" is not an ecosystem. agent-reference knows ${KNOWN_ECOSYSTEMS.join(', ')}, ` +
    `and a key with no prefix means ${SUPPORTED_ECOSYSTEM}.`
  );
}

export function unsupportedEcosystemMessage(ecosystem: string, name: string): string {
  return (
    `${ecosystem}: coordinates are not supported yet. agent-reference resolves ${SUPPORTED_ECOSYSTEM} packages today. ` +
    `Point it at the source repository instead: agent-reference get github:<owner>/<repo>#<tag>, ` +
    `or give ${name} a repository source in agent-reference.json with the ref you want.`
  );
}
