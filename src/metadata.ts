import fs from 'node:fs/promises';

import {
  repositoryDirectoryFromManifestRepository,
  repositoryUrlFromManifestRepository
} from './repository.ts';
import type {
  PackageReference,
  DependencyMetadata,
  MetadataMap,
  MetadataResolverOptions,
  NpmPackageManifest
} from './types.ts';

export class RegistryMetadataResolver {
  readonly registry: string;
  readonly fetchImpl: typeof fetch;
  readonly metadataMap: MetadataMap | null;

  constructor(options: MetadataResolverOptions = {}) {
    this.registry = normalizeRegistryUrl(options.registry ?? 'https://registry.npmjs.org');
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.metadataMap = options.metadataMap ?? null;
  }

  async resolve(dependency: PackageReference): Promise<DependencyMetadata> {
    return resolvePackageMetadata(dependency, {
      registry: this.registry,
      fetchImpl: this.fetchImpl,
      metadataMap: this.metadataMap
    });
  }
}

export async function resolvePackageMetadata(
  dependency: PackageReference,
  options: MetadataResolverOptions = {}
): Promise<DependencyMetadata> {
  const key = `${dependency.name}@${dependency.version}`;
  const metadataMap = options.metadataMap ?? null;
  if (metadataMap?.[key]) {
    return normalizePackageMetadata(metadataMap[key], dependency);
  }

  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (!fetchImpl) {
    throw new Error('No fetch implementation is available for npm registry metadata.');
  }

  const registry = normalizeRegistryUrl(options.registry ?? 'https://registry.npmjs.org');
  const url = `${registry}/${encodePackageName(dependency.name)}/${dependency.version}`;
  const response = await fetchImpl(url, {
    headers: {
      accept: 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Registry lookup failed for ${key}: HTTP ${response.status}`);
  }

  const manifest = (await response.json()) as NpmPackageManifest;
  return normalizePackageMetadata(manifest, dependency);
}

export function normalizePackageMetadata(
  manifest: NpmPackageManifest,
  dependency: Partial<PackageReference> = {}
): DependencyMetadata {
  const repositoryUrl = manifest.repositoryUrl
    ? manifest.repositoryUrl
    : repositoryUrlFromManifestRepository(manifest.repository ?? null);

  return {
    name: manifest.name ?? dependency.name ?? '',
    version: manifest.version ?? dependency.version ?? '',
    repositoryUrl,
    repositoryDirectory:
      manifest.repositoryDirectory ?? repositoryDirectoryFromManifestRepository(manifest.repository ?? null),
    gitHead: manifest.gitHead ?? manifest._resolvedGitHead ?? null,
    dist: manifest.dist ?? null,
    rawRepository: manifest.repository ?? null
  };
}

export async function loadMetadataFile(metadataFile: string | null | undefined): Promise<MetadataMap | null> {
  if (!metadataFile) return null;
  const raw = await fs.readFile(metadataFile, 'utf8');
  return JSON.parse(raw) as MetadataMap;
}

function encodePackageName(name: string): string {
  if (name.startsWith('@')) {
    return name.replace('/', '%2f');
  }
  return encodeURIComponent(name);
}

function normalizeRegistryUrl(registry: string): string {
  return registry.replace(/\/+$/, '');
}
