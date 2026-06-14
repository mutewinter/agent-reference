import semver from 'semver';

export interface RegistryVersionResolverOptions {
  registry?: string;
  fetchImpl?: typeof fetch;
}

interface Packument {
  versions?: Record<string, unknown>;
  'dist-tags'?: Record<string, string>;
}

export async function resolveRegistryVersion(
  name: string,
  specifier: string,
  options: RegistryVersionResolverOptions = {}
): Promise<string> {
  const exact = semver.valid(specifier);
  if (exact) return exact;

  const packument = await fetchPackument(name, options);
  const distTagVersion = packument['dist-tags']?.[specifier];
  if (distTagVersion && semver.valid(distTagVersion)) {
    return distTagVersion;
  }

  const versions = Object.keys(packument.versions ?? {}).filter((version) => semver.valid(version));
  const match = semver.maxSatisfying(versions, specifier);
  if (match) return match;

  throw new Error(`Unable to resolve ${name}@${specifier} to an exact registry version.`);
}

async function fetchPackument(name: string, options: RegistryVersionResolverOptions): Promise<Packument> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (!fetchImpl) {
    throw new Error('No fetch implementation is available for npm registry metadata.');
  }

  const registry = (options.registry ?? 'https://registry.npmjs.org').replace(/\/+$/, '');
  const response = await fetchImpl(`${registry}/${encodePackageName(name)}`, {
    headers: {
      accept: 'application/vnd.npm.install-v1+json, application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Registry version lookup failed for ${name}: HTTP ${response.status}`);
  }

  return (await response.json()) as Packument;
}

function encodePackageName(name: string): string {
  if (name.startsWith('@')) {
    return name.replace('/', '%2f');
  }
  return encodeURIComponent(name);
}
