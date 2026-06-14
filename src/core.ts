import path from 'node:path';

import { resolveConfigDependencies } from './config-dependencies.ts';
import { loadDepCloneConfig, writeDepCloneConfig } from './config.ts';
import { ensureDependencyWorktree } from './git.ts';
import { RegistryMetadataResolver } from './metadata.ts';
import { dependencyKey, mergeDependencyEntries } from './package-utils.ts';
import { resolveProjectInput, scanProject, scanResolvedProject } from './scanner.ts';
import { writeAgentFiles, writeManifest } from './manifest.ts';
import type {
  CloneDependencyOptions,
  CloneDependencyResult,
  DepCloneConfig,
  DepCloneDependency,
  GitWorktreeResult,
  ListDependenciesOptions,
  MetadataResolver
} from './types.ts';

export async function listDependencies(
  projectPath: string | null | undefined,
  options: ListDependenciesOptions = {}
): Promise<DepCloneDependency[]> {
  return scanProject(projectPath, options);
}

export function selectDependencies(
  dependencies: DepCloneDependency[],
  options: { packages?: string[]; all?: boolean } = {}
): DepCloneDependency[] {
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

export async function cloneDependencies(
  projectPath: string | null | undefined,
  options: CloneDependencyOptions = {}
): Promise<CloneDependencyResult> {
  const cwd = options.cwd ?? process.cwd();
  const context = await resolveProjectInput(projectPath, cwd);
  const loadedConfig = await loadDepCloneConfig(context.projectRoot, {
    configFile: options.configFile
  });
  const config = loadedConfig?.config;
  const scanned = await scanResolvedProject(context, {
    ...options,
    allImporters: options.allImporters || config?.allImporters
  });
  const configDependencies = await resolveConfigDependencies(config, context, {
    registry: options.registry ?? config?.registry,
    configPath: loadedConfig?.path
  });
  const dependencyUniverse = mergeDependencyEntries([...scanned, ...configDependencies]);
  const hasExplicitPackageSelection = Boolean(options.packages && options.packages.length > 0);
  const configuredPackages = hasExplicitPackageSelection
    ? options.packages
    : config?.references;
  const configuredAll = options.all || config?.all || config?.references?.includes('*') || false;
  let selected = selectDependencies(dependencyUniverse, {
    packages: configuredPackages,
    all: configuredAll
  });
  if (!hasExplicitPackageSelection && !configuredAll && configDependencies.length > 0) {
    selected = mergeDependencyEntries([...selected, ...configDependencies]);
  }

  if (selected.length === 0) {
    throw new Error(`No dependencies selected. Use --all, --package <name>, or ${loadedConfig?.path ?? 'depclone.config.json'}.`);
  }

  const resolver: MetadataResolver =
    options.metadataResolver ??
    new RegistryMetadataResolver({
      registry: options.registry ?? config?.registry,
      metadataMap: options.metadataMap
    });
  const projectRoot = context.projectRoot;
  const cloned: GitWorktreeResult[] = [];
  const skipped: CloneDependencyResult['skipped'] = [];
  const bareStoreDir = options.bareStoreDir ?? config?.cacheDir;
  const worktreeRoot = options.worktreeRoot ?? config?.worktreeDir;

  for (const dependency of selected) {
    const metadata = await resolver.resolve(dependency);
    if (!metadata.repositoryUrl) {
      skipped.push({ dependency, reason: 'No repository URL in npm metadata.' });
      continue;
    }

    cloned.push(
      await ensureDependencyWorktree(dependency, metadata, {
        projectRoot,
        bareStoreDir: bareStoreDir ? resolveConfigPath(projectRoot, cwd, bareStoreDir) : undefined,
        worktreeRoot: worktreeRoot ? resolveConfigPath(projectRoot, cwd, worktreeRoot) : undefined,
        gitBin: options.gitBin,
        force: options.force
      })
    );
  }

  const manifestPath = await writeManifest(projectRoot, cloned);
  await writeAgentFiles(projectRoot);

  return {
    scanned: dependencyUniverse,
    selected,
    cloned,
    skipped,
    manifestPath
  };
}

export async function initConfig(
  projectPath: string | null | undefined,
  options: CloneDependencyOptions = {}
): Promise<{ configPath: string; config: DepCloneConfig; selected: DepCloneDependency[] }> {
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

  const config: DepCloneConfig = {
    schemaVersion: 1,
    references: options.all ? [] : selected.map((dependency) => dependency.name)
  };

  if (options.all) config.all = true;
  if (options.allImporters) config.allImporters = true;
  if (options.registry) config.registry = options.registry;
  if (options.worktreeRoot) config.worktreeDir = options.worktreeRoot;

  const configPath = await writeDepCloneConfig(context.projectRoot, config, {
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
