export { parseArgv } from './args.ts';
export { scanBunDependencies } from './bun-lock.ts';
export { resolveConfigPackageReferences } from './config-dependencies.ts';
export {
  DEFAULT_CONFIG_FILE,
  DEFAULT_LOCAL_CONFIG_FILE,
  loadAgentReferenceConfig,
  writeAgentReferenceConfig
} from './config.ts';
export { cloneReferences, initConfig, listDependencies, selectDependencies } from './core.ts';
export { ensureDependencyWorktree, ensureGitReferenceWorktree, runGit } from './git.ts';
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
export { loadReferenceContext } from './reference-context.ts';
export { resolveRegistryVersion } from './registry-version.ts';
export { getStatusReport } from './status.ts';
export { parseYarnLock, scanYarnDependencies } from './yarn-lock.ts';
export type {
  AgentReferenceConfig,
  AgentReferenceKind,
  AgentReferenceManifest,
  AgentReferenceStatusEntry,
  AgentReferenceStatusReport,
  AgentReferenceStatusState,
  CloneReferencesOptions,
  CloneReferencesResult,
  DependencyMetadata,
  GitReferenceWorktreeResult,
  GitWorktreeOptions,
  GitWorktreeResult,
  GitManifestReference,
  PackageManifestReference,
  ListDependenciesOptions,
  AgentReferenceManifestReference,
  PackageManager,
  PackageReference,
  ProjectContext,
  ScanProjectOptions
} from './types.ts';
export type { LoadedReferenceContext, LoadReferenceContextOptions } from './reference-context.ts';
