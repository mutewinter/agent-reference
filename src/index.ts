export { parseArgv } from './args.ts';
export { scanBunDependencies } from './bun-lock.ts';
export { DEFAULT_CONFIG_FILE, loadDepCloneConfig, writeDepCloneConfig } from './config.ts';
export { cloneDependencies, initConfig, listDependencies, selectDependencies } from './core.ts';
export { ensureDependencyWorktree, runGit } from './git.ts';
export { readManifest, writeAgentFiles, writeManifest } from './manifest.ts';
export {
  loadMetadataFile,
  normalizePackageMetadata,
  resolvePackageMetadata,
  RegistryMetadataResolver
} from './metadata.ts';
export { scanNpmDependencies } from './npm-lock.ts';
export { parsePnpmLockText, readPnpmImporters, scanPnpmDependencies } from './pnpm-lock.ts';
export {
  normalizeGitRepositoryUrl,
  repositoryCacheParts,
  repositoryUrlFromManifestRepository
} from './repository.ts';
export { parseYarnLock, scanYarnDependencies } from './yarn-lock.ts';
export { getStatusReport } from './status.ts';
export type {
  CloneDependencyOptions,
  CloneDependencyResult,
  DepCloneConfig,
  DepCloneDependency,
  DepCloneManifest,
  DepCloneStatusEntry,
  DepCloneStatusReport,
  DepCloneStatusState,
  DependencyMetadata,
  GitWorktreeOptions,
  GitWorktreeResult,
  ListDependenciesOptions,
  PackageManager,
  ProjectContext,
  ScanProjectOptions
} from './types.ts';
export { resolveProjectInput, scanProject, scanResolvedProject } from './scanner.ts';
