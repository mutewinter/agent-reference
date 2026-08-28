import { configuredReference, DEFAULT_CONFIG_FILE, referencesOfKind } from './config.ts';
import {
  ensureDependencyWorktree,
  ensureGitAvailable,
  ensureGitReferenceWorktree,
  resolveStoreDir,
  UnsafeGitValueError,
} from './git.ts';
import { missingSelectionMessage, selectionFilter } from './sets.ts';
import { writeManifest } from './manifest.ts';
import { configFileFor, gitDirectoryProblem } from './get.ts';
import { gitUnresolvedProblem, unresolvedProblem } from './problems.ts';
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
  UnresolvedReason,
} from './types.ts';

export async function cloneReferences(
  projectPath: string | null | undefined,
  options: CloneReferencesOptions = {},
): Promise<CloneReferencesResult> {
  const { config, configPackages, cwd, loadedConfig, project } = await loadReferenceContext(
    projectPath,
    options,
  );

  const selection = selectionFilter(config, options);
  const selected = (name: string): boolean => !selection || selection.matches(name);
  const packages = configPackages.packages.filter((entry) => selected(entry.name));
  const gitReferences = referencesOfKind(config, 'git').filter((entry) => selected(entry.name));
  const paths = referencesOfKind(config, 'path')
    .filter((entry) => selected(entry.name))
    .map((entry) => entry.name);

  // Every selector has to hit something. One typo among several names was dropped in
  // silence, so the run reported success for a reference it never touched.
  const missing = selection?.unmatched() ?? [];
  if (missing.length > 0) throw new Error(missingSelectionMessage(missing, config));

  if (packages.length === 0 && gitReferences.length === 0 && paths.length === 0) {
    throw new Error(
      `No references configured. Add entries to the "references" map in ${loadedConfig?.path ?? DEFAULT_CONFIG_FILE}.`,
    );
  }

  await ensureGitAvailable();

  const registryOptions = {
    registry: options.registry ?? config?.registry,
    fetchImpl: options.fetchImpl,
    metadataMap: options.metadataMap,
  };
  const worktreeOptions: GitWorktreeOptions = {
    projectRoot: project.projectRoot,
    storeDir: resolveStoreDir(project.projectRoot, cwd, options.storeDir ?? config?.cacheDir),
  };

  const cloned: CloneReferencesResult['cloned'] = [];
  const unresolved: UnresolvedManifestReference[] = [];
  const skipped: CloneReferencesResult['skipped'] = [];
  const override = (name: string): ConfiguredPackageReference | undefined =>
    configuredReference(config, 'package', name) ?? undefined;

  for (const dependency of packages) {
    // One unresolvable package must not abort the references that would have worked.
    const outcome = await materializePackage(
      dependency,
      override(dependency.name),
      registryOptions,
      worktreeOptions,
    );
    if ('failure' in outcome) {
      unresolved.push(outcome.failure);
      skipped.push({
        name: dependency.name,
        version: dependency.version,
        reason: outcome.failure.detail,
      });
    } else {
      cloned.push(outcome.result);
    }
  }

  const clonedGit: CloneReferencesResult['clonedGit'] = [];
  const gitFailures: AgentReferenceProblem[] = [];
  for (const reference of gitReferences) {
    // Same bargain the package loop makes: one unreachable remote must not discard the
    // references that already worked, which throwing here would, manifest and all.
    try {
      clonedGit.push(
        await ensureGitReferenceWorktree(
          reference.name,
          reference.spec,
          reference.directory,
          worktreeOptions,
        ),
      );
    } catch (error) {
      // git's stderr on its way to a terminal, like the package path's detail.
      const detail = sanitizeRelayed(error instanceof Error ? error.message : String(error));
      gitFailures.push(
        gitUnresolvedProblem(
          reference.name,
          reference.spec,
          detail,
          configFileFor(reference.scope),
        ),
      );
      skipped.push({ name: reference.name, version: null, reason: detail });
    }
  }

  const manifestPath = await writeManifest(
    project.projectRoot,
    worktreeOptions.storeDir,
    cloned,
    clonedGit,
    unresolved,
  );

  return {
    cloned,
    clonedGit,
    paths,
    skipped,
    unresolved,
    // Reported here as well as in `status`: an agent acts on the output it just got back.
    problems: [
      ...unresolved.map((failure) =>
        // The file this package was declared in, not always the committed one.
        unresolvedProblem(
          failure,
          worktreeOptions.storeDir,
          configFileFor(override(failure.name)?.scope ?? 'shared'),
        ),
      ),
      ...gitFailures,
      ...gitReferences
        .map((reference) => {
          const result = clonedGit.find((entry) => entry.name === reference.name);
          return result ? gitDirectoryProblem(reference, result) : null;
        })
        .filter((problem): problem is AgentReferenceProblem => problem !== null),
    ],
    manifestPath,
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
  worktreeOptions: GitWorktreeOptions,
): Promise<{ result: GitWorktreeResult } | { failure: UnresolvedManifestReference }> {
  const unresolvable = (
    reason: UnresolvedReason,
    detail: string,
    repositoryUrl: string | null = null,
  ) => ({
    failure: {
      kind: 'package' as const,
      name: dependency.name,
      version: dependency.version,
      reason,
      // git's stderr and registry errors are third-party text on their way to a terminal.
      detail: sanitizeRelayed(detail),
      repositoryUrl,
      pinnedRef: override?.ref ?? null,
      repository: override?.repository ?? null,
    },
  });

  let metadata: DependencyMetadata;
  if (override?.repository && override.ref) {
    // Fully pinned: no registry round trip, so unpublished and private packages work.
    metadata = {
      repositoryUrl: null,
      repositoryDirectory: override.directory ?? null,
      gitHead: null,
    };
  } else {
    try {
      metadata = await resolvePackageMetadata(dependency, registryOptions);
    } catch (error) {
      if (!override?.repository) {
        return unresolvable(
          'registry-error',
          error instanceof Error ? error.message : String(error),
        );
      }
      metadata = { repositoryUrl: null, repositoryDirectory: null, gitHead: null };
    }
  }

  const repositoryUrl = override?.repository
    ? normalizeConfiguredRepository(override.repository, worktreeOptions.projectRoot)
    : metadata.repositoryUrl;
  if (!repositoryUrl) {
    return unresolvable(
      'no-repository',
      `npm metadata for ${dependency.name}@${dependency.version} has no repository field.`,
    );
  }

  try {
    const result = await ensureDependencyWorktree(
      dependency,
      { ...metadata, repositoryUrl },
      {
        ...worktreeOptions,
        pinnedRef: override?.ref ?? null,
        pinnedDirectory: override?.directory ?? null,
      },
    );
    return { result };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    // A value refused on safety grounds is its own failure: blaming the ref's existence, or
    // pointing at a mirror that was never created, sends an agent to fix the wrong thing.
    if (error instanceof UnsafeGitValueError)
      return unresolvable('rejected', detail, repositoryUrl);
    return unresolvable(override?.ref ? 'unresolved-ref' : 'clone-failed', detail, repositoryUrl);
  }
}
