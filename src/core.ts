import { writeAgentReferenceConfig } from './config.ts';
import { isInsideDirectory, resolveConfigPath } from './fs-utils.ts';
import {
  bareRepositoryPathFor,
  defaultStoreDir,
  ensureDependencyWorktree,
  ensureGitReferenceWorktree,
  manifestReferencePath,
  removeWorktree
} from './git.ts';
import { writeManifest } from './manifest.ts';
import { dependencyKey } from './package-utils.ts';
import { loadReferenceContext } from './reference-context.ts';
import { resolvePackageMetadata } from './registry.ts';
import { resolveProjectInput, scanResolvedProject } from './scanner.ts';
import type {
  AgentReferenceConfig,
  CloneReferencesOptions,
  CloneReferencesResult,
  PackageReference
} from './types.ts';

export function selectDependencies(dependencies: PackageReference[], selectors: string[]): PackageReference[] {
  const requested = new Set(selectors.flatMap(splitPackageSelectors));
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

  const selected = options.packages?.length
    ? selectDependencies(packageUniverse, options.packages)
    : options.all || config?.allPackages
      ? packageUniverse
      : configPackages.packages;

  const configuredGit = Object.entries(config?.git ?? {});
  if (selected.length === 0 && configuredGit.length === 0) {
    throw new Error(`No references selected. Use --all, --package <name>, or ${loadedConfig?.path ?? 'agent-reference.json'}.`);
  }

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
  const skipped: CloneReferencesResult['skipped'] = configPackages.missingInstalled.map((name) => ({
    name,
    version: null,
    reason: 'Configured as "installed" but not present in the active lockfile.'
  }));

  for (const dependency of selected) {
    const metadata = await resolvePackageMetadata(dependency, registryOptions);
    if (!metadata.repositoryUrl) {
      skipped.push({ name: dependency.name, version: dependency.version, reason: 'No repository URL in npm metadata.' });
      continue;
    }

    cloned.push(await ensureDependencyWorktree(dependency, metadata, worktreeOptions));
  }

  const clonedGit: CloneReferencesResult['clonedGit'] = [];
  for (const [name, spec] of configuredGit) {
    clonedGit.push(await ensureGitReferenceWorktree(name, spec, worktreeOptions));
  }

  const { manifestPath, superseded } = await writeManifest(projectRoot, cloned, clonedGit);
  for (const reference of superseded) {
    const supersededPath = manifestReferencePath(storeDir, worktreeRoot, reference);
    if (isInsideDirectory(projectRoot, supersededPath)) {
      await removeWorktree(bareRepositoryPathFor(storeDir, reference.repositoryUrl), supersededPath, options.gitBin);
    }
  }

  return { selected, cloned, clonedGit, skipped, manifestPath };
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
    packages: Object.fromEntries(selected.map((dependency) => [dependency.name, 'installed']))
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

function splitPackageSelectors(selector: string): string[] {
  return selector
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

