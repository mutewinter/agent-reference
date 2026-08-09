import { emptyConfig, writeAgentReferenceConfig } from './config.ts';
import { isInsideDirectory, resolveConfigPath } from './fs-utils.ts';
import {
  bareRepositoryPathFor,
  defaultStoreDir,
  ensureDependencyWorktree,
  ensureGitAvailable,
  ensureGitReferenceWorktree,
  manifestReferencePath,
  removeWorktree
} from './git.ts';
import { describeSelection, selectionFilter, splitSelectors } from './groups.ts';
import { writeManifest } from './manifest.ts';
import { dependencyKey, mergeDependencyEntries } from './package-utils.ts';
import { loadReferenceContext } from './reference-context.ts';
import { resolvePackageMetadata } from './registry.ts';
import { normalizeConfiguredRepository } from './repository.ts';
import { resolveProjectInput, scanResolvedProject } from './scanner.ts';
import type {
  AgentReferenceConfig,
  CloneReferencesOptions,
  CloneReferencesResult,
  ConfiguredGitReference,
  ConfiguredPackageReference,
  DependencyMetadata,
  GitWorktreeOptions,
  PackageReference,
  RegistryOptions,
  UnresolvedManifestReference,
  UnresolvedReason
} from './types.ts';

export function selectDependencies(dependencies: PackageReference[], selectors: string[]): PackageReference[] {
  const requested = new Set(splitSelectors(selectors));
  if (requested.size === 0) return [];

  const selected = dependencies.filter(
    (dependency) => requested.has(dependency.name) || requested.has(dependencyKey(dependency.name, dependency.version))
  );

  const matched = new Set(
    selected.flatMap((dependency) => [dependency.name, dependencyKey(dependency.name, dependency.version)])
  );
  const missing = [...requested].filter((selector) => !matched.has(selector));
  if (missing.length > 0) {
    throw new Error(`No installed dependency matched: ${missing.join(', ')}`);
  }

  return selected;
}

export async function cloneReferences(
  projectPath: string | null | undefined,
  options: CloneReferencesOptions = {}
): Promise<CloneReferencesResult> {
  const { config, configPackages, cwd, loadedConfig, packageUniverse, project } = await loadReferenceContext(
    projectPath,
    options
  );

  const { packages: selected, git: selectedGit, folders } = selectCloneTargets(
    config,
    configPackages.packages,
    packageUniverse,
    options
  );

  if (selected.length === 0 && selectedGit.length === 0 && folders.length === 0) {
    throw new Error(
      `No references selected. Use --all, --package <name>, --group <name>, or ${loadedConfig?.path ?? 'agent-reference.json'}.`
    );
  }

  await ensureGitAvailable(options.gitBin);

  const registryOptions = {
    registry: options.registry ?? config?.registry,
    fetchImpl: options.fetchImpl,
    metadataMap: options.metadataMap
  };
  const projectRoot = project.projectRoot;
  const configuredStore = options.storeDir ?? config?.cacheDir;
  const storeDir = configuredStore ? resolveConfigPath(projectRoot, cwd, configuredStore) : defaultStoreDir();
  const configuredWorktreeRoot = options.worktreeRoot ?? config?.worktreeDir;
  const worktreeRoot = configuredWorktreeRoot
    ? resolveConfigPath(projectRoot, cwd, configuredWorktreeRoot)
    : undefined;
  const worktreeOptions = {
    projectRoot,
    storeDir,
    worktreeRoot,
    gitBin: options.gitBin,
    force: options.force
  };

  const cloned: CloneReferencesResult['cloned'] = [];
  const unresolved: UnresolvedManifestReference[] = [];
  const skipped: CloneReferencesResult['skipped'] = configPackages.missingInstalled.map((name) => ({
    name,
    version: null,
    reason: 'Configured as "installed" but not present in the active lockfile.'
  }));
  const overrides = new Map((config?.packages ?? []).map((entry) => [entry.name, entry]));

  for (const dependency of selected) {
    const override = overrides.get(dependency.name);
    // One unresolvable package must not abort the references that would have worked.
    const failure = await cloneOnePackage(dependency, override, registryOptions, worktreeOptions, cloned);
    if (failure) {
      unresolved.push(failure);
      skipped.push({ name: dependency.name, version: dependency.version, reason: failure.detail });
    }
  }

  const clonedGit: CloneReferencesResult['clonedGit'] = [];
  for (const reference of selectedGit) {
    clonedGit.push(await ensureGitReferenceWorktree(reference.name, reference.spec, worktreeOptions));
  }

  const { manifestPath, superseded } = await writeManifest(projectRoot, cloned, clonedGit, unresolved);
  for (const reference of superseded) {
    const supersededPath = manifestReferencePath(storeDir, worktreeRoot, reference);
    if (isInsideDirectory(projectRoot, supersededPath)) {
      await removeWorktree(bareRepositoryPathFor(storeDir, reference.repositoryUrl), supersededPath, options.gitBin);
    }
  }

  return { selected, cloned, clonedGit, folders, skipped, unresolved, manifestPath };
}

/**
 * Materializes one package, returning a recordable failure instead of throwing so a single
 * bad reference cannot take down the whole run, and so `status` can explain it later.
 */
async function cloneOnePackage(
  dependency: PackageReference,
  override: ConfiguredPackageReference | undefined,
  registryOptions: RegistryOptions,
  worktreeOptions: GitWorktreeOptions,
  cloned: CloneReferencesResult['cloned']
): Promise<UnresolvedManifestReference | null> {
  const unresolvable = (reason: UnresolvedReason, detail: string, repositoryUrl: string | null = null) => ({
    kind: 'package' as const,
    name: dependency.name,
    version: dependency.version,
    reason,
    detail,
    repositoryUrl,
    pinnedRef: override?.ref ?? null,
    repository: override?.repository ?? null
  });

  let metadata: DependencyMetadata;
  if (override?.repository && override.ref) {
    // Fully pinned: no registry round trip, so unpublished and private packages work.
    metadata = { repositoryUrl: null, repositoryDirectory: override.directory ?? null, gitHead: null };
  } else {
    try {
      metadata = await resolvePackageMetadata(dependency, registryOptions);
    } catch (error) {
      if (!override?.repository) {
        return unresolvable('registry-error', error instanceof Error ? error.message : String(error));
      }
      metadata = { repositoryUrl: null, repositoryDirectory: null, gitHead: null };
    }
  }

  const repositoryUrl = override?.repository
    ? normalizeConfiguredRepository(override.repository, worktreeOptions.projectRoot)
    : metadata.repositoryUrl;
  if (!repositoryUrl) {
    return unresolvable('no-repository', `npm metadata for ${dependency.name}@${dependency.version} has no repository field.`);
  }

  const resolvedMetadata: DependencyMetadata = {
    ...metadata,
    repositoryUrl,
    repositoryDirectory: override?.directory ?? metadata.repositoryDirectory
  };

  try {
    cloned.push(
      await ensureDependencyWorktree(dependency, resolvedMetadata, {
        ...worktreeOptions,
        pinnedRef: override?.ref ?? null
      })
    );
    return null;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return unresolvable(override?.ref ? 'unresolved-ref' : 'clone-failed', detail, repositoryUrl);
  }
}

/** Folder references need no cloning, but a folder-only group must not read as "nothing matched". */
function selectCloneTargets(
  config: AgentReferenceConfig | undefined,
  configPackages: PackageReference[],
  packageUniverse: PackageReference[],
  options: CloneReferencesOptions
): { packages: PackageReference[]; git: ConfiguredGitReference[]; folders: string[] } {
  const configuredGit = config?.git ?? [];
  const configuredFolders = config?.folders ?? [];
  const filter = selectionFilter(config, options);
  const explicitPackages = options.packages?.length ? selectDependencies(packageUniverse, options.packages) : [];

  if (filter) {
    const packages = mergeDependencyEntries([
      ...explicitPackages,
      ...packageUniverse.filter((dependency) => filter('package', dependency.name))
    ]);
    const git = configuredGit.filter((reference) => filter('git', reference.name));
    const folders = configuredFolders.filter((reference) => filter('folder', reference.name));

    if (packages.length === 0 && git.length === 0 && folders.length === 0) {
      throw new Error(`Nothing matched ${describeSelection(options)}.`);
    }

    return { packages, git, folders: folders.map((folder) => folder.name) };
  }

  if (explicitPackages.length > 0) {
    return { packages: explicitPackages, git: [], folders: [] };
  }

  const packages = options.all || config?.allPackages ? packageUniverse : configPackages;
  return { packages, git: configuredGit, folders: configuredFolders.map((folder) => folder.name) };
}

export async function initConfig(
  projectPath: string | null | undefined,
  options: CloneReferencesOptions = {}
): Promise<{ configPath: string; config: AgentReferenceConfig; selected: PackageReference[] }> {
  const context = await resolveProjectInput(projectPath, options.cwd);
  const scanned = await scanResolvedProject(context, options);
  const selected = options.all ? scanned : selectDependencies(scanned, options.packages ?? []);

  if (!options.all && selected.length === 0) {
    throw new Error('No references selected. Use --all or --package <name>.');
  }

  const config: AgentReferenceConfig = {
    ...emptyConfig(),
    packages: selected.map((dependency) => ({
      kind: 'package' as const,
      name: dependency.name,
      version: 'installed',
      ref: null,
      repository: null,
      directory: null,
      description: null,
      groups: []
    }))
  };

  if (options.all) config.allPackages = true;
  if (options.allImporters) config.allImporters = true;
  if (options.registry) config.registry = options.registry;
  if (options.worktreeRoot) config.worktreeDir = options.worktreeRoot;

  const configPath = await writeAgentReferenceConfig(context.projectRoot, config, {
    configFile: options.configFile,
    force: options.force
  });

  return { configPath, config, selected };
}
