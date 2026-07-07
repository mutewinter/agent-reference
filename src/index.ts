export {
  DEFAULT_CONFIG_FILE,
  DEFAULT_LOCAL_CONFIG_FILE,
  loadAgentReferenceConfig,
  writeAgentReferenceConfig
} from './config.ts';
export { cloneReferences, initConfig, selectDependencies } from './core.ts';
export { readManifest } from './manifest.ts';
export { loadMetadataFile, resolvePackageMetadata, resolveRegistryVersion } from './registry.ts';
export { scanProject } from './scanner.ts';
export { getStatusReport } from './status.ts';
export type {
  AgentReferenceConfig,
  AgentReferenceKind,
  AgentReferenceManifest,
  AgentReferenceManifestReference,
  AgentReferenceStatusEntry,
  AgentReferenceStatusReport,
  AgentReferenceStatusState,
  CloneReferencesOptions,
  CloneReferencesResult,
  DependencyMetadata,
  DependencyType,
  GitManifestReference,
  GitReferenceWorktreeResult,
  GitWorktreeResult,
  LoadedAgentReferenceConfig,
  MetadataMap,
  NpmPackageManifest,
  PackageManager,
  PackageManifestReference,
  PackageReference,
  ProjectContext,
  RegistryOptions,
  ScanProjectOptions
} from './types.ts';
