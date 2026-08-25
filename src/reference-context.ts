import {
  resolveConfigPackageReferences,
  type ConfigPackageReferences,
} from './config-dependencies.ts';
import { loadAgentReferenceConfig } from './config.ts';
import { resolveStoreDir } from './git.ts';
import { resolveProjectInput, scanResolvedProject } from './scanner.ts';
import type {
  AgentReferenceConfig,
  LoadedAgentReferenceConfig,
  PackageReference,
  ProjectContext,
  ScanProjectOptions,
} from './types.ts';

export interface LoadReferenceContextOptions extends ScanProjectOptions {
  registry?: string;
}

export interface LoadedReferenceContext {
  cwd: string;
  project: ProjectContext;
  loadedConfig: LoadedAgentReferenceConfig | null;
  config: AgentReferenceConfig | undefined;
  configPackages: ConfigPackageReferences;
  /** Every dependency the lockfile resolves, whether or not it is configured. */
  installedPackages: PackageReference[];
}

export async function loadReferenceContext(
  projectPath: string | null | undefined,
  options: LoadReferenceContextOptions = {},
): Promise<LoadedReferenceContext> {
  const cwd = options.cwd ?? process.cwd();
  const project = await resolveProjectInput(projectPath, cwd);
  const loadedConfig = await loadAgentReferenceConfig(project.projectRoot);
  const config = loadedConfig?.config;
  // Every importer, always. Reading only the nearest one made a dependency held by a
  // workspace package invisible from the repository root, which then resolved as though it
  // were not installed at all. Which of several versions to use is decided per lookup.
  const installedPackages = await scanResolvedProject(project, { ...options, allImporters: true });
  const configPackages = resolveConfigPackageReferences(config, installedPackages, {
    importer: project.importer,
    packageManager: project.packageManager,
  });

  return { cwd, project, loadedConfig, config, configPackages, installedPackages };
}

/**
 * The store a command should work against, without the lockfile scan a full context does.
 * `store` needs the config's `cacheDir` and nothing else about the project, and reading the
 * default store while every other command reads the configured one made it report an empty
 * store and prune checkouts belonging to unrelated projects.
 */
export async function resolveProjectStoreDir(
  projectPath: string | null | undefined,
  options: { cwd?: string; storeDir?: string } = {},
): Promise<string> {
  const cwd = options.cwd ?? process.cwd();
  const project = await resolveProjectInput(projectPath, cwd);
  const loaded = await loadAgentReferenceConfig(project.projectRoot).catch(() => null);
  return resolveStoreDir(project.projectRoot, cwd, options.storeDir ?? loaded?.config.cacheDir);
}
