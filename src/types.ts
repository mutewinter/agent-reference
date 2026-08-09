export type DependencyType = 'dependencies' | 'devDependencies' | 'optionalDependencies';

export type PackageManager = 'pnpm' | 'npm' | 'bun' | 'yarn' | 'config' | 'unknown';

export interface ProjectContext {
  projectRoot: string;
  packageJsonPath: string;
  lockfilePath: string;
  packageManager: PackageManager;
  importer: string;
}

export interface ScanProjectOptions {
  allImporters?: boolean;
  cwd?: string;
}

export interface PackageReference {
  name: string;
  version: string;
  specifier: string | null;
  packageManager: PackageManager;
  dependencyTypes: DependencyType[];
  importers: string[];
}

export type ManifestRepository =
  | string
  | {
      type?: string;
      url?: string;
      directory?: string;
    }
  | null
  | undefined;

export interface NpmPackageManifest {
  name?: string;
  version?: string;
  repository?: ManifestRepository;
  gitHead?: string;
}

export interface DependencyMetadata {
  repositoryUrl: string | null;
  repositoryDirectory: string | null;
  gitHead: string | null;
}

export type MetadataMap = Record<string, NpmPackageManifest>;

export interface RegistryOptions {
  registry?: string;
  fetchImpl?: typeof fetch;
  metadataMap?: MetadataMap | null;
}

export interface GitWorktreeOptions {
  projectRoot: string;
  storeDir?: string;
  worktreeRoot?: string;
  gitBin?: string;
  force?: boolean;
}

/**
 * How confident the resolver is that a checkout really is the requested package version.
 * `verified` means the package.json at that commit reported the exact name and version.
 */
export type CheckoutConfidence = 'verified' | 'unverified' | 'fallback';

export type PackageRefSource = 'gitHead' | 'tag' | 'tagSearch' | 'defaultBranch';

export interface GitWorktreeResult {
  dependency: PackageReference;
  metadata: DependencyMetadata;
  bareRepositoryPath: string;
  worktreePath: string;
  packagePath: string;
  checkoutRef: string;
  checkoutSha: string;
  refSource: PackageRefSource;
  confidence: CheckoutConfidence;
  reused: boolean;
}

export interface GitReferenceWorktreeResult {
  name: string;
  requested: string;
  repositoryUrl: string;
  bareRepositoryPath: string;
  worktreePath: string;
  checkoutRef: string;
  checkoutSha: string;
  refSource: 'configured' | 'defaultBranch';
  reused: boolean;
}

export interface ReferenceSelectionOptions {
  packages?: string[];
  groups?: string[];
  references?: string[];
  all?: boolean;
}

export interface CloneReferencesOptions
  extends ScanProjectOptions,
    RegistryOptions,
    ReferenceSelectionOptions {
  storeDir?: string;
  worktreeRoot?: string;
  gitBin?: string;
  force?: boolean;
  configFile?: string | null;
}

export interface CloneReferencesResult {
  selected: PackageReference[];
  cloned: GitWorktreeResult[];
  skipped: Array<{
    name: string;
    version: string | null;
    reason: string;
  }>;
  clonedGit: GitReferenceWorktreeResult[];
  /** Names of selected folder references. They are already local, so nothing is cloned. */
  folders: string[];
  manifestPath: string;
}

export type AgentReferenceKind = 'package' | 'folder' | 'git';

export interface PackageManifestReference {
  kind: 'package';
  name: string;
  version: string;
  packageManager: PackageManager;
  repositoryUrl: string;
  repositoryDirectory: string | null;
  gitHead: string | null;
  checkoutRef: string;
  checkoutSha: string;
  refSource: PackageRefSource;
  confidence: CheckoutConfidence;
}

export interface GitManifestReference {
  kind: 'git';
  name: string;
  requested: string;
  repositoryUrl: string;
  checkoutRef: string;
  checkoutSha: string;
  refSource: GitReferenceWorktreeResult['refSource'];
}

export type AgentReferenceManifestReference = PackageManifestReference | GitManifestReference;

export interface AgentReferenceManifest {
  schemaVersion: 4;
  references: AgentReferenceManifestReference[];
}

export type AgentReferenceStatusState =
  | 'ready'
  | 'missing'
  | 'missing-worktree'
  | 'stale'
  | 'not-installed'
  | 'unconfigured';

export interface AgentReferenceStatusEntry {
  kind: AgentReferenceKind;
  name: string;
  description: string | null;
  groups: string[];
  requested: string | null;
  packageManager: PackageManager | null;
  currentVersion: string | null;
  clonedVersion: string | null;
  path: string | null;
  /** Repository checkout root. Differs from `path` for a package inside a monorepo. */
  repositoryPath: string | null;
  checkoutSha: string | null;
  confidence: CheckoutConfidence | null;
  status: AgentReferenceStatusState;
  action: string;
}

export interface AgentReferenceStatusGroup {
  name: string;
  description: string | null;
  references: string[];
}

export interface AgentReferenceStatusReport {
  generatedAt: string;
  projectRoot: string;
  configPath: string | null;
  localConfigPath: string | null;
  manifestPath: string | null;
  groups: AgentReferenceStatusGroup[];
  references: AgentReferenceStatusEntry[];
  summary: Record<AgentReferenceStatusState, number>;
}

export interface ConfiguredPackageReference {
  kind: 'package';
  name: string;
  /** `installed` to follow the lockfile, or an exact version, range, or dist-tag. */
  version: string;
  description: string | null;
  groups: string[];
}

export interface ConfiguredFolderReference {
  kind: 'folder';
  name: string;
  path: string;
  description: string | null;
  groups: string[];
}

export interface ConfiguredGitReference {
  kind: 'git';
  name: string;
  repository: string;
  ref: string | null;
  /** Canonical `repository#ref` form. Recorded in the lockfile so drift is detectable. */
  spec: string;
  description: string | null;
  groups: string[];
}

export type ConfiguredReference =
  | ConfiguredPackageReference
  | ConfiguredFolderReference
  | ConfiguredGitReference;

export interface ConfiguredGroup {
  name: string;
  description: string | null;
  references: string[];
}

export interface ReferenceGroupMember {
  kind: AgentReferenceKind;
  name: string;
}

export interface ReferenceGroup {
  name: string;
  description: string | null;
  members: ReferenceGroupMember[];
}

export interface AgentReferenceConfig {
  packages: ConfiguredPackageReference[];
  folders: ConfiguredFolderReference[];
  git: ConfiguredGitReference[];
  groups: ConfiguredGroup[];
  allPackages?: boolean;
  allImporters?: boolean;
  registry?: string;
  worktreeDir?: string;
  cacheDir?: string;
}

export interface LoadedAgentReferenceConfig {
  path: string | null;
  localPath: string | null;
  config: AgentReferenceConfig;
}
