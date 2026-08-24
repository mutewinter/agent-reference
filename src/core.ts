import path from 'node:path';

import { DEFAULT_CONFIG_FILE } from './config.ts';
import { resolveConfigPath } from './fs-utils.ts';
import {
  defaultStoreDir,
  ensureDependencyWorktree,
  ensureGitAvailable,
  ensureGitReferenceWorktree,
  UnsafeGitValueError
} from './git.ts';
import {
  describeSelection,
  knownSelectorsMessage,
  selectionFilter,
  splitSelectors,
  unknownCommandHint
} from './sets.ts';
import { writeManifest } from './manifest.ts';
import { gitDirectoryProblem } from './get.ts';
import { unresolvedProblem } from './problems.ts';
import { loadReferenceContext } from './reference-context.ts';
import { resolvePackageMetadata } from './registry.ts';
import { normalizeConfiguredRepository } from './repository.ts';
import { sanitizeRelayed } from './text-utils.ts';
import type {
  AgentReferenceProblem,
  CloneReferencesOptions,
  CloneReferencesResult,
  ConfiguredPackageReference,
  DependencyMetadata,
  GitWorktreeOptions,
  GitWorktreeResult,
  PackageReference,
  RegistryOptions,
  UnresolvedManifestReference,
  UnresolvedReason
} from './types.ts';

export async function cloneReferences(
  projectPath: string | null | undefined,
  options: CloneReferencesOptions = {}
): Promise<CloneReferencesResult> {
  const { config, configPackages, cwd, loadedConfig, project } = await loadReferenceContext(projectPath, options);

  const filter = selectionFilter(config, options);
  const packages = configPackages.packages.filter((entry) => !filter || filter('package', entry.name));
  const gitReferences = (config?.git ?? []).filter((entry) => !filter || filter('git', entry.name));
  const paths = (config?.paths ?? [])
    .filter((entry) => !filter || filter('path', entry.name))
    .map((entry) => entry.name);

  if (packages.length === 0 && gitReferences.length === 0 && paths.length === 0) {
    throw new Error(
      filter
        ? [
            `Nothing matched ${describeSelection(options)}.`,
            knownSelectorsMessage(config),
            unknownCommandHint(splitSelectors(options.references))
          ]
            .filter(Boolean)
            .join(' ')
        : `No references configured. Add packages, paths, or git entries to ${loadedConfig?.path ?? DEFAULT_CONFIG_FILE}.`
    );
  }

  await ensureGitAvailable();

  const registryOptions = {
    registry: options.registry ?? config?.registry,
    fetchImpl: options.fetchImpl,
    metadataMap: options.metadataMap
  };
  const configuredStore = options.storeDir ?? config?.cacheDir;
  const worktreeOptions: GitWorktreeOptions = {
    projectRoot: project.projectRoot,
    storeDir: configuredStore ? resolveConfigPath(project.projectRoot, cwd, configuredStore) : defaultStoreDir()
  };

  const cloned: CloneReferencesResult['cloned'] = [];
  const unresolved: UnresolvedManifestReference[] = [];
  const skipped: CloneReferencesResult['skipped'] = [];
  const overrides = new Map((config?.packages ?? []).map((entry) => [entry.name, entry]));

  for (const dependency of packages) {
    // One unresolvable package must not abort the references that would have worked.
    const outcome = await materializePackage(dependency, overrides.get(dependency.name), registryOptions, worktreeOptions);
    if ('failure' in outcome) {
      unresolved.push(outcome.failure);
      skipped.push({ name: dependency.name, version: dependency.version, reason: outcome.failure.detail });
    } else {
      cloned.push(outcome.result);
    }
  }

  const clonedGit: CloneReferencesResult['clonedGit'] = [];
  for (const reference of gitReferences) {
    clonedGit.push(
      await ensureGitReferenceWorktree(reference.name, reference.spec, reference.directory, worktreeOptions)
    );
  }

  const manifestPath = await writeManifest(project.projectRoot, worktreeOptions.storeDir, cloned, clonedGit, unresolved);
  const configFile = path.basename(loadedConfig?.path ?? DEFAULT_CONFIG_FILE);

  return {
    cloned,
    clonedGit,
    paths,
    skipped,
    unresolved,
    // Reported here as well as in `status`: an agent acts on the output it just got back.
    problems: [
      ...unresolved.map((failure) => unresolvedProblem(failure, worktreeOptions.storeDir, configFile)),
      ...gitReferences
        .map((reference) => {
          const result = clonedGit.find((entry) => entry.name === reference.name);
          return result ? gitDirectoryProblem(reference, result) : null;
        })
        .filter((problem): problem is AgentReferenceProblem => problem !== null)
    ],
    manifestPath
  };
}

/**
 * Materializes one package, returning a recordable failure instead of throwing so a single
 * bad reference cannot take down the whole run, and so `status` can explain it later.
 */
export async function materializePackage(
  dependency: PackageReference,
  override: ConfiguredPackageReference | undefined,
  registryOptions: RegistryOptions,
  worktreeOptions: GitWorktreeOptions
): Promise<{ result: GitWorktreeResult } | { failure: UnresolvedManifestReference }> {
  const unresolvable = (reason: UnresolvedReason, detail: string, repositoryUrl: string | null = null) => ({
    failure: {
      kind: 'package' as const,
      name: dependency.name,
      version: dependency.version,
      reason,
      // git's stderr and registry errors are third-party text on their way to a terminal.
      detail: sanitizeRelayed(detail),
      repositoryUrl,
      pinnedRef: override?.ref ?? null,
      repository: override?.repository ?? null
    }
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

  try {
    const result = await ensureDependencyWorktree(
      dependency,
      { ...metadata, repositoryUrl },
      { ...worktreeOptions, pinnedRef: override?.ref ?? null, pinnedDirectory: override?.directory ?? null }
    );
    return { result };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    // A value refused on safety grounds is its own failure: blaming the ref's existence, or
    // pointing at a mirror that was never created, sends an agent to fix the wrong thing.
    if (error instanceof UnsafeGitValueError) return unresolvable('rejected', detail, repositoryUrl);
    return unresolvable(override?.ref ? 'unresolved-ref' : 'clone-failed', detail, repositoryUrl);
  }
}
