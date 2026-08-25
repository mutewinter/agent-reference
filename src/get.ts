import path from 'node:path';
import process from 'node:process';

import semver from 'semver';

import { materializePackage } from './core.ts';
import { DEFAULT_CONFIG_FILE, DEFAULT_LOCAL_CONFIG_FILE } from './config.ts';
import { resolveReferencePath, pathExists } from './fs-utils.ts';
import { ensureGitReferenceWorktree, resolvePackagePath, resolveStoreDir } from './git.ts';
import { writeManifest } from './manifest.ts';
import {
  ambiguousInstalledMessage,
  getCommand,
  missingDirectoryProblem,
  pinFix,
  unresolvedProblem,
} from './problems.ts';
import {
  isWorkspaceVersion,
  workspaceVersionDirectory,
  workspaceVersionPath,
} from './pnpm-lock.ts';
import { loadReferenceContext, type LoadedReferenceContext } from './reference-context.ts';
import { configuredReferences, knownSelectorsMessage } from './sets.ts';
import { classifySource, derivedName, type ClassifiedSource } from './source.ts';
import {
  formatCoordinate,
  parsePackageCoordinate,
  selectInstalledPackage,
  SUPPORTED_ECOSYSTEM,
  unsupportedEcosystemMessage,
} from './package-utils.ts';
import { resolveRegistryVersion } from './registry.ts';
import type {
  ConfigScope,
  ConfiguredGitReference,
  ConfiguredReference,
  AgentReferenceProblem,
  GetReferenceResult,
  GitReferenceWorktreeResult,
  GitWorktreeOptions,
  GitWorktreeResult,
  PackageReference,
  PackageVersionSource,
  RegistryOptions,
  ScanProjectOptions,
} from './types.ts';

export interface GetReferencesOptions extends ScanProjectOptions, RegistryOptions {
  storeDir?: string;
}

/**
 * Materializes each spec and returns its readable path. This is the on-demand verb: nothing
 * is fetched until an agent asks, and one call fetches exactly what was asked for.
 *
 * A spec is resolved in this order: a configured name, which may be a set and then stands
 * for every reference in it; a git spec (`github:owner/repo`, `owner/repo`, or a git URL);
 * or a package (`name` or `name@version`), where the version comes from the explicit spec,
 * the lockfile, or the registry, in that order.
 */
export async function getReferences(
  projectPath: string | null | undefined,
  specs: string[],
  options: GetReferencesOptions = {},
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
  const worktreeOptions: GitWorktreeOptions = {
    projectRoot,
    storeDir: resolveStoreDir(projectRoot, cwd, options.storeDir ?? config?.cacheDir),
  };
  const registryOptions: RegistryOptions = {
    registry: options.registry ?? config?.registry,
    fetchImpl: options.fetchImpl,
    metadataMap: options.metadataMap,
  };

  const results: GetReferenceResult[] = [];
  const recordedPackages: GitWorktreeResult[] = [];
  const recordedGit: GitReferenceWorktreeResult[] = [];

  for (const spec of specs) {
    // A set is a reference that resolves to several paths, so naming one materializes every
    // member. Nothing else about the loop changes: each member returns its own result.
    const members = setMembers(spec, context);
    const configured = members ?? findConfiguredReference(spec, context);
    if (Array.isArray(configured)) {
      for (const member of configured) {
        results.push(
          await getConfigured(
            member,
            context,
            registryOptions,
            worktreeOptions,
            recordedPackages,
            recordedGit,
          ),
        );
      }
    } else if (configured) {
      results.push(
        await getConfigured(
          configured,
          context,
          registryOptions,
          worktreeOptions,
          recordedPackages,
          recordedGit,
        ),
      );
    } else {
      // The same classifier the config parser uses, so a spelling that works here works
      // there and resolves to the same thing.
      const source = classifySource(spec);
      if (source.kind === 'git') {
        results.push(await getAdHocGit(source, spec, worktreeOptions));
      } else if (source.kind === 'path') {
        results.push(await getAdHocPath(source.path, spec, projectRoot, context));
      } else {
        results.push(
          await getPackage(spec, context, registryOptions, worktreeOptions, recordedPackages),
        );
      }
    }
  }

  // Only canonical materializations are recorded: an explicit historical version must not
  // overwrite what status reports as this project's current checkout.
  if (recordedPackages.length > 0 || recordedGit.length > 0) {
    await writeManifest(projectRoot, worktreeOptions.storeDir, recordedPackages, recordedGit);
  }

  return results;
}

/**
 * One map, one namespace, so a name is looked up and nothing is qualified. Two references
 * cannot share a name any more; the config parser refuses that outright rather than leaving
 * an ambiguity for every later lookup to rediscover.
 */
function findConfiguredReference(
  spec: string,
  context: LoadedReferenceContext,
): ConfiguredReference | null {
  return configuredReferences(context.config).find((reference) => reference.name === spec) ?? null;
}

/** The members of the set this name stands for, or null when it does not name a set. */
function setMembers(spec: string, context: LoadedReferenceContext): ConfiguredReference[] | null {
  if (!context.config?.sets.some((set) => set.name === spec)) return null;
  return configuredReferences(context.config).filter((reference) => reference.sets.includes(spec));
}

async function getConfigured(
  reference: ConfiguredReference,
  context: LoadedReferenceContext,
  registryOptions: RegistryOptions,
  worktreeOptions: GitWorktreeOptions,
  recordedPackages: GitWorktreeResult[],
  recordedGit: GitReferenceWorktreeResult[],
): Promise<GetReferenceResult> {
  if (reference.kind === 'path') {
    const resolvedPath = resolveReferencePath(worktreeOptions.projectRoot, reference.path);
    if (!(await pathExists(resolvedPath))) {
      throw new Error(
        `references.${reference.name} points at ${resolvedPath}, which does not exist. A path reference is already on this machine and cannot be materialized; create or correct that path.`,
      );
    }
    return {
      kind: 'path',
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
      problem: null,
    };
  }

  if (reference.kind === 'git') {
    const result = await ensureGitReferenceWorktree(
      reference.name,
      reference.spec,
      reference.directory,
      worktreeOptions,
    );
    recordedGit.push(result);
    return {
      kind: 'git',
      name: reference.name,
      requested: reference.spec,
      version: null,
      versionSource: null,
      path: result.referencePath,
      repositoryPath: result.worktreePath,
      repositoryUrl: result.repositoryUrl,
      checkoutRef: result.checkoutRef,
      checkoutSha: result.checkoutSha,
      refSource: result.refSource,
      confidence: null,
      description: reference.description,
      recorded: true,
      problem: gitDirectoryProblem(reference, result),
    };
  }

  const dependency = context.configPackages.packages.find((entry) => entry.name === reference.name);
  if (!dependency) {
    throw new Error(
      `references.${reference.name} is declared but carries no version. Give it an exact version such as "npm:${reference.name}@1.2.3".`,
    );
  }

  return materializeToResult(
    dependency,
    reference.name,
    dependency.name,
    registryOptions,
    worktreeOptions,
    {
      override: reference,
      record: recordedPackages,
      versionSource: 'config',
    },
  );
}

async function getPackage(
  spec: string,
  context: LoadedReferenceContext,
  registryOptions: RegistryOptions,
  worktreeOptions: GitWorktreeOptions,
  recordedPackages: GitWorktreeResult[],
): Promise<GetReferenceResult> {
  const { ecosystem, name, version: requestedVersion } = parsePackageCoordinate(spec);
  if (ecosystem !== SUPPORTED_ECOSYSTEM)
    throw new Error(unsupportedEcosystemMessage(ecosystem, name));

  const { match, candidates } = selectInstalledPackage(
    name,
    context.installedPackages,
    context.project.importer,
  );

  let dependency: PackageReference;
  let versionSource: PackageVersionSource;
  if (requestedVersion) {
    const exact = semver.valid(requestedVersion);
    const version =
      exact ?? (await resolveRegistryVersion(name, requestedVersion, registryOptions));
    dependency = adHocDependency(name, version, requestedVersion, match);
    versionSource = 'explicit';
  } else if (match) {
    dependency = match;
    versionSource = 'lockfile';
  } else if (candidates.length > 1) {
    throw new Error(ambiguousInstalledMessage(name, candidates));
  } else if (workspaceMatch(name, context)) {
    throw new Error(
      `${name} is a workspace package in this repository, at ${workspaceMatch(name, context)}. Its source is already on disk, so there is nothing to materialize; open that directory directly.`,
    );
  } else {
    // Nothing here installs it, which is the "look at a library I might adopt" case rather
    // than an error. The result says where the version came from, so it cannot be mistaken
    // for the one this project uses.
    const version = await resolveRegistryVersion(name, 'latest', registryOptions).catch(
      (error: unknown) => {
        // A name nothing installs and no registry knows is usually a typo of something this
        // config declares. Blaming npm for it sends an agent to check its network instead.
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`${message}. ${knownSelectorsMessage(context.config)}`);
      },
    );
    dependency = adHocDependency(name, version, 'latest', null);
    versionSource = 'registry';
  }

  const override = context.config?.packages.find(
    (entry) => entry.ecosystem === ecosystem && entry.name === name,
  );
  return materializeToResult(dependency, spec, name, registryOptions, worktreeOptions, {
    // A pin belongs to the version it was made for: it must not redirect an explicit
    // historical request like name@old-version.
    override: override && requestedVersion ? { ...override, ref: null } : override,
    // Explicit and registry versions are one-off lookups; only the version this project
    // installs is worth recording as its current checkout.
    record: versionSource === 'lockfile' ? recordedPackages : null,
    versionSource,
  });
}

/**
 * Where an in-repo workspace package lives, when that is what the name refers to. Absolute,
 * because the link string in the lockfile is relative to the importer that wrote it and this
 * message is read from wherever the agent ran the command.
 */
function workspaceMatch(name: string, context: LoadedReferenceContext): string | null {
  const entry = context.installedPackages.find(
    (candidate) => candidate.name === name && isWorkspaceVersion(candidate.version),
  );
  if (!entry) return null;

  const lockfilePath = context.project.lockfilePath;
  if (!lockfilePath) return workspaceVersionPath(entry.version);

  const importer = entry.importers.includes(context.project.importer)
    ? context.project.importer
    : (entry.importers[0] ?? '.');
  return (
    workspaceVersionDirectory(path.dirname(lockfilePath), importer, entry.version) ??
    workspaceVersionPath(entry.version)
  );
}

function adHocDependency(
  name: string,
  version: string,
  specifier: string,
  installed: PackageReference | null,
): PackageReference {
  return {
    name,
    version,
    specifier,
    packageManager: installed?.packageManager ?? 'unknown',
    dependencyTypes: [],
    importers: [],
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
  },
): Promise<GetReferenceResult> {
  // An edit has to be made in the file this entry is in. A package declared in the local
  // config sent the agent to the committed one, where the edit is both a leak and a no-op:
  // the local entry wins by name, so the same problem comes back on the next run.
  const configFile = configFileFor(options.override?.scope ?? 'shared');
  const outcome = await materializePackage(
    dependency,
    options.override,
    registryOptions,
    worktreeOptions,
  );
  if ('failure' in outcome) {
    const problem = unresolvedProblem(outcome.failure, worktreeOptions.storeDir, configFile);
    throw new Error(`${problem.summary}\nfix: ${problem.fix}`);
  }

  options.record?.push(outcome.result);
  const packagePath = await resolvePackagePath(
    outcome.result.worktreePath,
    outcome.result.metadata.repositoryDirectory,
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
      Boolean(options.override?.directory),
      configFile,
    ),
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
  directoryPinned: boolean,
  configFile: string,
): AgentReferenceProblem | null {
  if (result.confidence === 'fallback') {
    return {
      reference: `package:${name}`,
      severity: 'error',
      summary: `No release commit matched ${name}@${version}, so the default branch was checked out. The source at this path is NOT version ${version}.`,
      // A mirror that could not be refreshed simply does not hold a commit published since
      // it was last fetched. Sending the agent to pin a tag it cannot see is work that
      // cannot succeed, so the retry comes first when that is what happened.
      fix: result.mirrorStale
        ? `The mirror could not be updated on this run, so the release commit may not be here yet rather than missing. With the remote reachable, run ${getCommand(name)} again. If it still misses, ${pinFix(name, version, result.metadata.repositoryUrl, storeDir, configFile)}`
        : pinFix(name, version, result.metadata.repositoryUrl, storeDir, configFile),
      configPatch: {
        references: { [name]: { source: formatCoordinate(name, version), ref: '<commit-or-tag>' } },
      },
      configFile,
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
          ? `the repository root, as references.${name}.directory asks for`
          : `the repository root${nearMiss}`;
    return {
      reference: `package:${name}`,
      severity: 'warning',
      summary: `The ref for ${name}@${version} looks right, but no package.json confirmed the version. The path is ${wherePath}.`,
      fix: `Spot-check the source before trusting it as ${version}. If it is wrong, ${pinFix(name, version, result.metadata.repositoryUrl, storeDir, configFile)}`,
      configPatch: null,
      configFile,
    };
  }

  if (versionSource === 'registry') {
    return {
      reference: `package:${name}`,
      severity: 'warning',
      summary: `Nothing in this project installs ${name}, so this is ${version}, the registry's latest, rather than a version this repository depends on.`,
      fix: `If you meant a specific version, ask for it: agent-reference get ${name}@<version>.`,
      configPatch: null,
    };
  }

  return null;
}

async function getAdHocGit(
  source: Extract<ClassifiedSource, { kind: 'git' }>,
  requested: string,
  worktreeOptions: GitWorktreeOptions,
): Promise<GetReferenceResult> {
  const name = derivedName(source);
  const spec = source.ref ? `${source.repository}#${source.ref}` : source.repository;
  const result = await ensureGitReferenceWorktree(name, spec, null, worktreeOptions);

  return {
    kind: 'git',
    name,
    requested,
    version: null,
    versionSource: null,
    path: result.referencePath,
    repositoryPath: result.worktreePath,
    repositoryUrl: result.repositoryUrl,
    checkoutRef: result.checkoutRef,
    checkoutSha: result.checkoutSha,
    refSource: result.refSource,
    confidence: null,
    description: null,
    // An ad hoc repository is an exploration, not part of this project's declared state.
    recorded: false,
    problem: null,
  };
}

/**
 * A path spec that nothing declares. It is already on this machine, so there is nothing to
 * materialize and the answer is the resolved path or a plain statement that it is not there.
 */
async function getAdHocPath(
  declaredPath: string,
  requested: string,
  projectRoot: string,
  context: LoadedReferenceContext,
): Promise<GetReferenceResult> {
  const resolvedPath = resolveReferencePath(projectRoot, declaredPath);
  if (!(await pathExists(resolvedPath))) {
    throw new Error(
      `${requested} resolves to ${resolvedPath}, which does not exist. ${knownSelectorsMessage(context.config)}`,
    );
  }

  return {
    kind: 'path',
    name: derivedName({ kind: 'path', path: declaredPath }),
    requested,
    version: null,
    versionSource: null,
    path: resolvedPath,
    repositoryPath: null,
    repositoryUrl: null,
    checkoutRef: null,
    checkoutSha: null,
    refSource: null,
    confidence: null,
    description: null,
    recorded: false,
    problem: null,
  };
}

/** Shared by `get` and `clone`, so a missing subtree is reported wherever it is discovered. */
export function gitDirectoryProblem(
  reference: ConfiguredGitReference,
  result: GitReferenceWorktreeResult,
): AgentReferenceProblem | null {
  if (!result.directoryMissing || !result.directory) return null;
  return missingDirectoryProblem(
    reference.name,
    reference.spec,
    result.directory,
    result.checkoutRef,
    result.worktreePath,
    configFileFor(reference.scope),
  );
}

/** An edit has to be made in the file the entry is in, which is not always the committed one. */
export function configFileFor(scope: ConfigScope): string {
  return scope === 'local' ? DEFAULT_LOCAL_CONFIG_FILE : DEFAULT_CONFIG_FILE;
}
