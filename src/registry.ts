import semver from 'semver';

import { readJsonFile } from './fs-utils.ts';
import {
  repositoryDirectoryFromManifestRepository,
  repositoryUrlFromManifestRepository
} from './repository.ts';
import type { DependencyMetadata, MetadataMap, NpmPackageManifest, RegistryOptions } from './types.ts';

interface Packument {
  versions?: Record<string, unknown>;
  'dist-tags'?: Record<string, string>;
}

export async function resolvePackageMetadata(
  dependency: { name: string; version: string },
  options: RegistryOptions = {}
): Promise<DependencyMetadata> {
  const key = `${dependency.name}@${dependency.version}`;
  const mapped = options.metadataMap?.[key];
  if (mapped) return toDependencyMetadata(mapped);

  const manifest = await fetchRegistryJson<NpmPackageManifest>(
    `${encodePackageName(dependency.name)}/${dependency.version}`,
    options,
    `Registry lookup failed for ${key}`
  );
  return toDependencyMetadata(manifest);
}

export async function resolveRegistryVersion(
  name: string,
  specifier: string,
  options: RegistryOptions = {}
): Promise<string> {
  const exact = semver.valid(specifier);
  if (exact) return exact;

  const packument = await fetchRegistryJson<Packument>(
    encodePackageName(name),
    options,
    `Registry version lookup failed for ${name}`
  );

  const distTagVersion = packument['dist-tags']?.[specifier];
  if (distTagVersion && semver.valid(distTagVersion)) {
    return distTagVersion;
  }

  const versions = Object.keys(packument.versions ?? {}).filter((version) => semver.valid(version));
  const match = semver.maxSatisfying(versions, specifier);
  if (match) return match;

  throw new Error(`Unable to resolve ${name}@${specifier} to an exact registry version.`);
}

export async function loadMetadataFile(metadataFile: string | null | undefined): Promise<MetadataMap | null> {
  if (!metadataFile) return null;
  return readJsonFile<MetadataMap>(metadataFile);
}

function toDependencyMetadata(manifest: NpmPackageManifest): DependencyMetadata {
  return {
    repositoryUrl: repositoryUrlFromManifestRepository(manifest.repository ?? null),
    repositoryDirectory: repositoryDirectoryFromManifestRepository(manifest.repository ?? null),
    gitHead: manifest.gitHead ?? null
  };
}

async function fetchRegistryJson<T>(resource: string, options: RegistryOptions, errorPrefix: string): Promise<T> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (!fetchImpl) {
    throw new Error('No fetch implementation is available for npm registry metadata.');
  }

  const registry = (options.registry ?? 'https://registry.npmjs.org').replace(/\/+$/, '');
  const response = await fetchImpl(`${registry}/${resource}`, {
    headers: {
      accept: 'application/vnd.npm.install-v1+json, application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`${errorPrefix}: HTTP ${response.status}`);
  }

  return (await response.json()) as T;
}

function encodePackageName(name: string): string {
  if (name.startsWith('@')) {
    return name.replace('/', '%2f');
  }
  return encodeURIComponent(name);
}
