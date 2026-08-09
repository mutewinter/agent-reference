export {
  CONFIG_SCHEMA_URL,
  DEFAULT_CONFIG_FILE,
  DEFAULT_LOCAL_CONFIG_FILE,
  emptyConfig,
  loadAgentReferenceConfig,
  parseConfig,
  writeAgentReferenceConfig
} from './config.ts';
export { cloneReferences, initConfig, selectDependencies } from './core.ts';
export { ensureGitAvailable } from './git.ts';
export { configuredReferences, resolveReferenceGroups } from './groups.ts';
export { readManifest } from './manifest.ts';
export { loadMetadataFile, resolvePackageMetadata, resolveRegistryVersion } from './registry.ts';
export { scanProject } from './scanner.ts';
export { getStatusReport, type StatusReportOptions } from './status.ts';
export { validateConfig, type ValidationReport } from './validate.ts';
export type {
  AgentReferenceConfig,
  AgentReferenceKind,
  AgentReferenceManifest,
  AgentReferenceManifestReference,
  AgentReferenceStatusEntry,
  AgentReferenceStatusGroup,
  AgentReferenceStatusReport,
  AgentReferenceStatusState,
  CheckoutConfidence,
  CloneReferencesOptions,
  CloneReferencesResult,
  ConfiguredFolderReference,
  ConfiguredGitReference,
  ConfiguredGroup,
  ConfiguredPackageReference,
  ConfiguredReference,
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
  PackageRefSource,
  PackageReference,
  ProjectContext,
  ReferenceGroup,
  ReferenceGroupMember,
  ReferenceSelectionOptions,
  RegistryOptions,
  ScanProjectOptions
} from './types.ts';
