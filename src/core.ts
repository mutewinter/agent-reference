import path from 'node:path';

import { resolveConfigPackageReferences } from './config-dependencies.ts';
import { loadAgentReferenceConfig, writeAgentReferenceConfig } from './config.ts';
import { ensureDependencyWorktree, ensureGitReferenceWorktree } from './git.ts';
import { RegistryMetadataResolver } from './metadata.ts';
import { dependencyKey, mergeDependencyEntries } from './package-utils.ts';
import { resolveProjectInput, scanProject, scanResolvedProject } from './scanner.ts';
import { writeAgentFiles, writeManifest } from './manifest.ts';
import type {
  CloneReferencesOptions,
  CloneReferencesResult,
  AgentReferenceConfig,
  PackageReference,
  GitWorktreeResult,
  ListDependenciesOptions,
  MetadataResolver
} from './types.ts';

export async function listDependencies(
  projectPath: string | null | undefined,
  options: ListDependenciesOptions = {}
): Promise<PackageReference[]> {
  return scanProject(projectPath, options);
}

export function selectDependencies(
  dependencies: PackageReference[],
  options: { packages?: string[]; all?: boolean } = {}
): PackageReference[] {
  if (options.all) return dependencies;

  const requested = new Set((options.packages ?? []).flatMap(splitPackageSelectors));
  if (requested.size === 0) return [];

  const selected = dependencies.filter((dependency) => {
    const exact = dependencyKey(dependency.name, dependency.version);
    return requested.has(dependency.name) || requested.has(exact);
  });

  const matched = new Set<string>();
  for (const dependency of selected) {
    matched.add(dependency.name);
    matched.add(dependencyKey(dependency.name, dependency.version));
  }

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
  const cwd = options.cwd ?? process.cwd();
  const context = await resolveProjectInput(projectPath, cwd);
  const loadedConfig = await loadAgentReferenceConfig(context.projectRoot, {
    configFile: options.configFile
  });
  const config = loadedConfig?.config;
  const scanned = await scanResolvedProject(context, {
    ...options,
    allImporters: options.allImporters || config?.allImporters
  });
  const configPackages = await resolveConfigPackageReferences(config, context, scanned, {
    registry: options.registry ?? config?.registry,
    configPath: loadedConfig?.path ?? undefined
  });
  const dependencyUniverse = mergeDependencyEntries([...scanned, ...configPackages.packages]);
  const hasExplicitPackageSelection = Boolean(options.packages && options.packages.length > 0);
  const configuredPackages = hasExplicitPackageSelection
    ? options.packages
    : Object.keys(config?.packages ?? {});
  const configuredAll = options.all || config?.allPackages || false;
  let selected = selectDependencies(dependencyUniverse, {
    packages: configuredPackages,
    all: configuredAll
  });
  if (!hasExplicitPackageSelection && !configuredAll && configPackages.packages.length > 0) {
    selected = mergeDependencyEntries([...selected, ...configPackages.packages]);
  }

  const configuredGit = Object.entries(config?.git ?? {});
  if (selected.length === 0 && configuredGit.length === 0) {
    throw new Error(`No references selected. Use --all, --package <name>, or ${loadedConfig?.path ?? 'agent-reference.json'}.`);
  }

  const resolver: MetadataResolver =
    options.metadataResolver ??
    new RegistryMetadataResolver({
      registry: options.registry ?? config?.registry,
      metadataMap: options.metadataMap
    });
  const projectRoot = context.projectRoot;
  const cloned: GitWorktreeResult[] = [];
  const clonedGit: CloneReferencesResult['clonedGit'] = [];
  const skipped: CloneReferencesResult['skipped'] = [];
  const bareStoreDir = options.bareStoreDir ?? config?.cacheDir;
  const worktreeRoot = options.worktreeRoot ?? config?.worktreeDir;
  const resolvedBareStoreDir = bareStoreDir ? resolveConfigPath(projectRoot, cwd, bareStoreDir) : undefined;

  for (const dependency of selected) {
    const metadata = await resolver.resolve(dependency);
    if (!metadata.repositoryUrl) {
      skipped.push({ dependency, reason: 'No repository URL in npm metadata.' });
      continue;
    }

    cloned.push(
      await ensureDependencyWorktree(dependency, metadata, {
        projectRoot,
        bareStoreDir: resolvedBareStoreDir,
        worktreeRoot: worktreeRoot ? resolveConfigPath(projectRoot, cwd, worktreeRoot) : undefined,
        gitBin: options.gitBin,
        force: options.force
      })
    );
  }

  for (const [name, spec] of configuredGit) {
    clonedGit.push(await ensureGitReferenceWorktree(name, spec, {
      projectRoot,
      bareStoreDir: resolvedBareStoreDir,
      gitBin: options.gitBin,
      force: options.force
    }));
  }

  const manifestPath = await writeManifest(projectRoot, cloned, clonedGit);
  await writeAgentFiles(projectRoot);

  return {
    scanned: dependencyUniverse,
    selected,
    cloned,
    clonedGit,
    skipped,
    manifestPath
  };
}

export async function initConfig(
  projectPath: string | null | undefined,
  options: CloneReferencesOptions = {}
): Promise<{ configPath: string; config: AgentReferenceConfig; selected: PackageReference[] }> {
  const cwd = options.cwd ?? process.cwd();
  const context = await resolveProjectInput(projectPath, cwd);
  const scanned = await scanResolvedProject(context, options);
  const selected = selectDependencies(scanned, {
    packages: options.packages,
    all: options.all
  });

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

function resolveConfigPath(projectRoot: string, cwd: string, configuredPath: string): string {
  if (path.isAbsolute(configuredPath)) return configuredPath;
  if (configuredPath.startsWith('.')) return path.resolve(projectRoot, configuredPath);
  return path.resolve(cwd, configuredPath);
}
