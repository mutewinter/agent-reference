import path from 'node:path';
import process from 'node:process';

import semver from 'semver';

import { materializePackage } from './core.ts';
import { resolveConfigPath, resolveReferencePath, pathExists } from './fs-utils.ts';
import { defaultStoreDir, ensureGitReferenceWorktree, resolvePackagePath } from './git.ts';
import { writeManifest } from './manifest.ts';
import { ambiguousInstalledMessage, pinFix, unresolvedProblem } from './problems.ts';
import { isWorkspaceVersion, workspaceVersionDirectory, workspaceVersionPath } from './pnpm-lock.ts';
import { loadReferenceContext, type LoadedReferenceContext } from './reference-context.ts';
import {
  parsePackageCoordinate,
  selectInstalledPackage,
  SUPPORTED_ECOSYSTEM,
  unsupportedEcosystemMessage
} from './package-utils.ts';
import { resolveRegistryVersion } from './registry.ts';
import type {
  ConfiguredReference,
  AgentReferenceProblem,
  GetReferenceResult,
  GitReferenceWorktreeResult,
  GitWorktreeOptions,
  GitWorktreeResult,
  PackageReference,
  PackageVersionSource,
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
      versionSource: null,
      path: resolvedPath,
      repositoryPath: null,
      repositoryUrl: null,
      checkoutRef: null,
      checkoutSha: null,
      refSource: null,
      confidence: null,
      description: reference.description,
      recorded: false,
      problem: null
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
      versionSource: null,
      path: result.worktreePath,
      repositoryPath: result.worktreePath,
      repositoryUrl: result.repositoryUrl,
      checkoutRef: result.checkoutRef,
      checkoutSha: result.checkoutSha,
      refSource: result.refSource,
      confidence: null,
      description: reference.description,
      recorded: true,
      problem: null
    };
  }

  const dependency = context.configPackages.packages.find((entry) => entry.name === reference.name);
  if (!dependency) {
    throw new Error(`packages.${reference.name} is declared but carries no version. Give it an exact version such as "1.2.3".`);
  }

  return materializeToResult(dependency, reference.name, dependency.name, registryOptions, worktreeOptions, {
    override: reference,
    record: recordedPackages,
    versionSource: 'config'
  });
}

async function getPackage(
  spec: string,
  context: LoadedReferenceContext,
  registryOptions: RegistryOptions,
  worktreeOptions: GitWorktreeOptions,
  recordedPackages: GitWorktreeResult[]
): Promise<GetReferenceResult> {
  const { ecosystem, name, version: requestedVersion } = parsePackageCoordinate(spec);
  if (ecosystem !== SUPPORTED_ECOSYSTEM) throw new Error(unsupportedEcosystemMessage(ecosystem, name));

  const { match, candidates } = selectInstalledPackage(name, context.installedPackages, context.project.importer);

  let dependency: PackageReference;
  let versionSource: PackageVersionSource;
  if (requestedVersion) {
    const exact = semver.valid(requestedVersion);
    const version = exact ?? (await resolveRegistryVersion(name, requestedVersion, registryOptions));
    dependency = adHocDependency(name, version, requestedVersion, match);
    versionSource = 'explicit';
  } else if (match) {
    dependency = match;
    versionSource = 'lockfile';
  } else if (candidates.length > 1) {
    throw new Error(ambiguousInstalledMessage(name, candidates));
  } else if (workspaceMatch(name, context)) {
    throw new Error(
      `${name} is a workspace package in this repository, at ${workspaceMatch(name, context)}. Its source is already on disk, so there is nothing to materialize; open that directory directly.`
    );
  } else {
    // Nothing here installs it, which is the "look at a library I might adopt" case rather
    // than an error. The result says where the version came from, so it cannot be mistaken
    // for the one this project uses.
    const version = await resolveRegistryVersion(name, 'latest', registryOptions);
    dependency = adHocDependency(name, version, 'latest', null);
    versionSource = 'registry';
  }

  const override = context.config?.packages.find((entry) => entry.name === name);
  return materializeToResult(dependency, spec, name, registryOptions, worktreeOptions, {
    // A pin belongs to the version it was made for: it must not redirect an explicit
    // historical request like name@old-version.
    override: override && requestedVersion ? { ...override, ref: null } : override,
    // Explicit and registry versions are one-off lookups; only the version this project
    // installs is worth recording as its current checkout.
    record: versionSource === 'lockfile' ? recordedPackages : null,
    versionSource
  });
}

/**
 * Where an in-repo workspace package lives, when that is what the name refers to. Absolute,
 * because the link string in the lockfile is relative to the importer that wrote it and this
 * message is read from wherever the agent ran the command.
 */
function workspaceMatch(name: string, context: LoadedReferenceContext): string | null {
  const entry = context.installedPackages.find(
    (candidate) => candidate.name === name && isWorkspaceVersion(candidate.version)
  );
  if (!entry) return null;

  const lockfilePath = context.project.lockfilePath;
  if (!lockfilePath) return workspaceVersionPath(entry.version);

  const importer = entry.importers.includes(context.project.importer)
    ? context.project.importer
    : entry.importers[0] ?? '.';
  return (
    workspaceVersionDirectory(path.dirname(lockfilePath), importer, entry.version) ??
    workspaceVersionPath(entry.version)
  );
}

function adHocDependency(
  name: string,
  version: string,
  specifier: string,
  installed: PackageReference | null
): PackageReference {
  return {
    name,
    version,
    specifier,
    packageManager: installed?.packageManager ?? 'config',
    dependencyTypes: [],
    importers: []
  };
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
    versionSource: PackageVersionSource;
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
    versionSource: options.versionSource,
    path: packagePath,
    repositoryPath: outcome.result.worktreePath,
    repositoryUrl: outcome.result.metadata.repositoryUrl,
    checkoutRef: outcome.result.checkoutRef,
    checkoutSha: outcome.result.checkoutSha,
    refSource: outcome.result.refSource,
    confidence: outcome.result.confidence,
    description: null,
    recorded: options.record !== null,
    problem: resultProblem(
      name,
      dependency.version,
      outcome.result,
      options.versionSource,
      worktreeOptions.storeDir,
      Boolean(options.override?.directory)
    )
  };
}

/**
 * A `get` that succeeds can still hand back something the caller would misread: the default
 * branch when no release commit matched, or upstream's latest when this project installs
 * nothing by that name. Both are reported here, with the same fix text `status` would give,
 * because `get` is the command an agent runs and the output it acts on.
 */
function resultProblem(
  name: string,
  version: string,
  result: GitWorktreeResult,
  versionSource: PackageVersionSource,
  storeDir: string,
  directoryPinned: boolean
): AgentReferenceProblem | null {
  if (result.confidence === 'fallback') {
    return {
      reference: `package:${name}`,
      severity: 'error',
      summary: `No release commit matched ${name}@${version}, so the default branch was checked out. The source at this path is NOT version ${version}.`,
      fix: pinFix(name, version, result.metadata.repositoryUrl, storeDir, 'agent-reference.json'),
      configPatch: { packages: { [name]: { version, ref: '<commit-or-tag>' } } }
    };
  }

  if (result.confidence === 'unverified' && !directoryPinned) {
    const directory = result.metadata.repositoryDirectory;
    const nearMiss = result.nameOnlyDirectory
      ? `, because nothing in it confirms both name and version (${result.nameOnlyDirectory}/ claims the name but states no matching version, so it is not the package)`
      : ', because no directory in it identifies itself as this package';
    const wherePath =
      directory && directory !== '.'
        ? `${directory}/ inside the checkout`
        : directory === '.'
          ? `the repository root, as packages.${name}.directory asks for`
          : `the repository root${nearMiss}`;
    return {
      reference: `package:${name}`,
      severity: 'warning',
      summary: `The ref for ${name}@${version} looks right, but no package.json confirmed the version. The path is ${wherePath}.`,
      fix: `Spot-check the source before trusting it as ${version}. If it is wrong, ${pinFix(name, version, result.metadata.repositoryUrl, storeDir, 'agent-reference.json')}`,
      configPatch: null
    };
  }

  if (versionSource === 'registry') {
    return {
      reference: `package:${name}`,
      severity: 'warning',
      summary: `Nothing in this project installs ${name}, so this is ${version}, the registry's latest, rather than a version this repository depends on.`,
      fix: `If you meant a specific version, ask for it: agent-reference get ${name}@<version>.`,
      configPatch: null
    };
  }

  return null;
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
    versionSource: null,
    path: result.worktreePath,
    repositoryPath: result.worktreePath,
    repositoryUrl: result.repositoryUrl,
    checkoutRef: result.checkoutRef,
    checkoutSha: result.checkoutSha,
    refSource: result.refSource,
    confidence: null,
    description: null,
    // An ad hoc repository is an exploration, not part of this project's declared state.
    recorded: false,
    problem: null
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


