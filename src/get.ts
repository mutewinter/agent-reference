import path from 'node:path';
import process from 'node:process';

import semver from 'semver';

import { materializePackage } from './core.ts';
import { resolveConfigPath, resolveReferencePath, pathExists } from './fs-utils.ts';
import { defaultStoreDir, ensureGitReferenceWorktree, resolvePackagePath } from './git.ts';
import { writeManifest } from './manifest.ts';
import { unresolvedProblem } from './problems.ts';
import { loadReferenceContext, type LoadedReferenceContext } from './reference-context.ts';
import { resolveRegistryVersion } from './registry.ts';
import type {
  ConfiguredReference,
  GetReferenceResult,
  GitReferenceWorktreeResult,
  GitWorktreeOptions,
  GitWorktreeResult,
  PackageReference,
  RegistryOptions,
  ScanProjectOptions
} from './types.ts';

export interface GetReferencesOptions extends ScanProjectOptions, RegistryOptions {
  storeDir?: string;
}

/**
 * Materializes each spec and returns its readable path. This is the on-demand verb: nothing
 * is fetched until an agent asks, and one call fetches exactly what was asked for.
 *
 * A spec is resolved in this order: a configured reference name (optionally qualified as
 * `kind:name`), a git spec (`github:owner/repo`, `owner/repo`, a git URL, or `file:`), or a
 * package (`name` or `name@version`), where the version comes from the explicit spec, the
 * lockfile, or the registry, in that order.
 */
export async function getReferences(
  projectPath: string | null | undefined,
  specs: string[],
  options: GetReferencesOptions = {}
): Promise<GetReferenceResult[]> {
  if (specs.length === 0) {
    throw new Error('get needs a reference name, package[@version], or repository spec.');
  }

  const cwd = options.cwd ?? process.cwd();
  // Any directory works: without a config or lockfile the context is simply empty, and git
  // specs plus registry-resolved packages need neither.
  const context = await loadReferenceContext(projectPath, options);
  const config = context.config;
  const projectRoot = context.project.projectRoot;
  const configuredStore = options.storeDir ?? config?.cacheDir;
  const worktreeOptions: GitWorktreeOptions = {
    projectRoot,
    storeDir: configuredStore ? resolveConfigPath(projectRoot, cwd, configuredStore) : defaultStoreDir()
  };
  const registryOptions: RegistryOptions = {
    registry: options.registry ?? config?.registry,
    fetchImpl: options.fetchImpl,
    metadataMap: options.metadataMap
  };

  const results: GetReferenceResult[] = [];
  const recordedPackages: GitWorktreeResult[] = [];
  const recordedGit: GitReferenceWorktreeResult[] = [];

  for (const spec of specs) {
    const configured = findConfiguredReference(spec, context);
    if (configured) {
      results.push(await getConfigured(configured, context, registryOptions, worktreeOptions, recordedPackages, recordedGit));
    } else if (isGitSpec(spec)) {
      results.push(await getAdHocGit(spec, worktreeOptions));
    } else {
      results.push(await getPackage(spec, context, registryOptions, worktreeOptions, recordedPackages));
    }
  }

  // Only canonical materializations are recorded: an explicit historical version must not
  // overwrite what status reports as this project's current checkout.
  if (recordedPackages.length > 0 || recordedGit.length > 0) {
    await writeManifest(projectRoot, worktreeOptions.storeDir, recordedPackages, recordedGit);
  }

  return results;
}

function findConfiguredReference(spec: string, context: LoadedReferenceContext): ConfiguredReference | null {
  const references = [
    ...(context.config?.packages ?? []),
    ...(context.config?.folders ?? []),
    ...(context.config?.git ?? [])
  ];

  const colon = spec.indexOf(':');
  if (colon > 0) {
    const kind = spec.slice(0, colon);
    const name = spec.slice(colon + 1);
    return references.find((reference) => reference.kind === kind && reference.name === name) ?? null;
  }

  const matches = references.filter((reference) => reference.name === spec);
  if (matches.length > 1) {
    throw new Error(
      `"${spec}" names ${matches.length} configured references. Qualify it: ${matches
        .map((match) => `${match.kind}:${match.name}`)
        .join(' or ')}.`
    );
  }
  return matches[0] ?? null;
}

async function getConfigured(
  reference: ConfiguredReference,
  context: LoadedReferenceContext,
  registryOptions: RegistryOptions,
  worktreeOptions: GitWorktreeOptions,
  recordedPackages: GitWorktreeResult[],
  recordedGit: GitReferenceWorktreeResult[]
): Promise<GetReferenceResult> {
  if (reference.kind === 'folder') {
    const resolvedPath = resolveReferencePath(worktreeOptions.projectRoot, reference.path);
    if (!(await pathExists(resolvedPath))) {
      throw new Error(
        `folders.${reference.name} points at ${resolvedPath}, which does not exist. Folder references cannot be materialized; create or correct that path.`
      );
    }
    return {
      kind: 'folder',
      name: reference.name,
      requested: reference.path,
      version: null,
      path: resolvedPath,
      repositoryPath: null,
      repositoryUrl: null,
      checkoutRef: null,
      checkoutSha: null,
      refSource: null,
      confidence: null,
      description: reference.description,
      recorded: false
    };
  }

  if (reference.kind === 'git') {
    const result = await ensureGitReferenceWorktree(reference.name, reference.spec, worktreeOptions);
    recordedGit.push(result);
    return {
      kind: 'git',
      name: reference.name,
      requested: reference.spec,
      version: null,
      path: result.worktreePath,
      repositoryPath: result.worktreePath,
      repositoryUrl: result.repositoryUrl,
      checkoutRef: result.checkoutRef,
      checkoutSha: result.checkoutSha,
      refSource: result.refSource,
      confidence: null,
      description: reference.description,
      recorded: true
    };
  }

  const dependency = context.configPackages.packages.find((entry) => entry.name === reference.name);
  if (!dependency) {
    throw new Error(
      `packages.${reference.name} is configured as "${reference.version}" but is not in the active lockfile. Install it, or change the entry to an exact version.`
    );
  }

  return materializeToResult(dependency, reference.name, dependency.name, registryOptions, worktreeOptions, {
    override: reference,
    record: recordedPackages
  });
}

async function getPackage(
  spec: string,
  context: LoadedReferenceContext,
  registryOptions: RegistryOptions,
  worktreeOptions: GitWorktreeOptions,
  recordedPackages: GitWorktreeResult[]
): Promise<GetReferenceResult> {
  const { name, version: requestedVersion } = parsePackageSpec(spec);
  const installed = context.installedPackages.find((entry) => entry.name === name) ?? null;

  let dependency: PackageReference;
  if (!requestedVersion && installed) {
    dependency = installed;
  } else {
    const specifier = requestedVersion ?? 'latest';
    const exact = semver.valid(requestedVersion ?? '');
    const version = exact ?? (await resolveRegistryVersion(name, specifier, registryOptions));
    dependency = {
      name,
      version,
      specifier,
      packageManager: installed?.packageManager ?? 'config',
      dependencyTypes: [],
      importers: []
    };
  }

  const override = context.config?.packages.find((entry) => entry.name === name);
  return materializeToResult(dependency, spec, name, registryOptions, worktreeOptions, {
    // A pin belongs to the version it was made for: it must not redirect an explicit
    // historical request like name@old-version.
    override: override && requestedVersion ? { ...override, ref: null } : override,
    // Explicit versions are one-off lookups; only the project's current version is state.
    record: requestedVersion || !installed ? null : recordedPackages
  });
}

async function materializeToResult(
  dependency: PackageReference,
  requested: string,
  name: string,
  registryOptions: RegistryOptions,
  worktreeOptions: GitWorktreeOptions,
  options: {
    override: Parameters<typeof materializePackage>[1];
    record: GitWorktreeResult[] | null;
  }
): Promise<GetReferenceResult> {
  const outcome = await materializePackage(dependency, options.override, registryOptions, worktreeOptions);
  if ('failure' in outcome) {
    const problem = unresolvedProblem(outcome.failure, worktreeOptions.storeDir, 'agent-reference.json');
    throw new Error(`${problem.summary}\nfix: ${problem.fix}`);
  }

  options.record?.push(outcome.result);
  const packagePath = await resolvePackagePath(
    outcome.result.worktreePath,
    outcome.result.metadata.repositoryDirectory
  );

  return {
    kind: 'package',
    name,
    requested,
    version: dependency.version,
    path: packagePath,
    repositoryPath: outcome.result.worktreePath,
    repositoryUrl: outcome.result.metadata.repositoryUrl,
    checkoutRef: outcome.result.checkoutRef,
    checkoutSha: outcome.result.checkoutSha,
    refSource: outcome.result.refSource,
    confidence: outcome.result.confidence,
    description: null,
    recorded: options.record !== null
  };
}

async function getAdHocGit(spec: string, worktreeOptions: GitWorktreeOptions): Promise<GetReferenceResult> {
  const normalized = normalizeGitShorthand(spec);
  const name = repoNameFromSpec(normalized);
  const result = await ensureGitReferenceWorktree(name, normalized, worktreeOptions);

  return {
    kind: 'git',
    name,
    requested: spec,
    version: null,
    path: result.worktreePath,
    repositoryPath: result.worktreePath,
    repositoryUrl: result.repositoryUrl,
    checkoutRef: result.checkoutRef,
    checkoutSha: result.checkoutSha,
    refSource: result.refSource,
    confidence: null,
    description: null,
    // An ad hoc repository is an exploration, not part of this project's declared state.
    recorded: false
  };
}

function isGitSpec(spec: string): boolean {
  if (/^(github:|git@|file:|ssh:|git\+|https?:\/\/)/.test(spec)) return true;
  if (spec.replace(/#.*$/, '').endsWith('.git')) return true;
  // `owner/repo` is not a valid npm name (only scoped names contain a slash), so the
  // shorthand agents type for GitHub cannot collide with a package.
  return !spec.startsWith('@') && /^[\w.-]+\/[\w.-]+(#[\w./-]+)?$/.test(spec);
}

function normalizeGitShorthand(spec: string): string {
  if (/^[\w.-]+\/[\w.-]+(#[\w./-]+)?$/.test(spec) && !spec.startsWith('@')) {
    return `github:${spec}`;
  }
  return spec;
}

function repoNameFromSpec(spec: string): string {
  const withoutRef = spec.replace(/#.*$/, '');
  const base = path.posix.basename(withoutRef.replace(/\\/g, '/'));
  return base.replace(/\.git$/, '') || withoutRef;
}

function parsePackageSpec(spec: string): { name: string; version: string | null } {
  const at = spec.lastIndexOf('@');
  if (at > 0) {
    return { name: spec.slice(0, at), version: spec.slice(at + 1) || null };
  }
  return { name: spec, version: null };
}
