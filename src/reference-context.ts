import { resolveConfigPackageReferences, type ConfigPackageReferences } from './config-dependencies.ts';
import { loadAgentReferenceConfig } from './config.ts';
import { resolveProjectInput, scanResolvedProject } from './scanner.ts';
import type {
  AgentReferenceConfig,
  LoadedAgentReferenceConfig,
  ProjectContext,
  ScanProjectOptions
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
}

export async function loadReferenceContext(
  projectPath: string | null | undefined,
  options: LoadReferenceContextOptions = {}
): Promise<LoadedReferenceContext> {
  const cwd = options.cwd ?? process.cwd();
  const project = await resolveProjectInput(projectPath, cwd);
  const loadedConfig = await loadAgentReferenceConfig(project.projectRoot);
  const config = loadedConfig?.config;
  const installedPackages = await scanResolvedProject(project, {
    ...options,
    allImporters: options.allImporters || config?.allImporters
  });
  const configPackages = await resolveConfigPackageReferences(config, installedPackages, {
    registry: options.registry ?? config?.registry
  });

  return { cwd, project, loadedConfig, config, configPackages };
}
