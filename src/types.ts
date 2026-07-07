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

export interface GitWorktreeResult {
  dependency: PackageReference;
  metadata: DependencyMetadata;
  bareRepositoryPath: string;
  worktreePath: string;
  checkoutRef: string;
  checkoutSha: string;
  refSource: 'gitHead' | 'tag' | 'defaultBranch' | 'existing';
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
  refSource: 'configured' | 'defaultBranch' | 'existing';
  reused: boolean;
}

export interface CloneReferencesOptions extends ScanProjectOptions, RegistryOptions {
  packages?: string[];
  all?: boolean;
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
  refSource: GitWorktreeResult['refSource'];
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
  schemaVersion: 3;
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
  requested: string | null;
  packageManager: PackageManager | null;
  currentVersion: string | null;
  clonedVersion: string | null;
  path: string | null;
  checkoutSha: string | null;
  status: AgentReferenceStatusState;
  action: string;
}

export interface AgentReferenceStatusReport {
  generatedAt: string;
  projectRoot: string;
  configPath: string | null;
  localConfigPath: string | null;
  manifestPath: string | null;
  references: AgentReferenceStatusEntry[];
  summary: Record<AgentReferenceStatusState, number>;
}

export interface AgentReferenceConfig {
  packages?: Record<string, string>;
  folders?: Record<string, string>;
  git?: Record<string, string>;
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
