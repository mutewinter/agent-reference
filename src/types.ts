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
  include?: DependencyType[];
}

export interface ListDependenciesOptions extends ScanProjectOptions {
  cwd?: string;
}

export interface PackageReference {
  name: string;
  alias: string | null;
  version: string;
  specifier: string | null;
  dependencyType: DependencyType;
  dependencyTypes: DependencyType[];
  importer: string;
  importers: string[];
  packageManager: PackageManager;
  packageJsonPath: string;
  packageJsonPaths: string[];
  lockfilePath: string;
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
  repositoryUrl?: string;
  repositoryDirectory?: string;
  gitHead?: string;
  _resolvedGitHead?: string;
  dist?: {
    tarball?: string;
    shasum?: string;
    integrity?: string;
  } | null;
}

export interface DependencyMetadata {
  name: string;
  version: string;
  repositoryUrl: string | null;
  repositoryDirectory: string | null;
  gitHead: string | null;
  dist: NpmPackageManifest['dist'];
  rawRepository: ManifestRepository;
}

export type MetadataMap = Record<string, NpmPackageManifest>;

export interface MetadataResolverOptions {
  registry?: string;
  fetchImpl?: typeof fetch;
  metadataMap?: MetadataMap | null;
}

export interface MetadataResolver {
  resolve(dependency: PackageReference): Promise<DependencyMetadata>;
}

export interface GitWorktreeOptions {
  projectRoot: string;
  bareStoreDir?: string;
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

export interface CloneReferencesOptions extends ScanProjectOptions {
  cwd?: string;
  packages?: string[];
  all?: boolean;
  registry?: string;
  metadataMap?: MetadataMap | null;
  metadataResolver?: MetadataResolver;
  bareStoreDir?: string;
  worktreeRoot?: string;
  gitBin?: string;
  force?: boolean;
  configFile?: string | null;
}

export interface CloneReferencesResult {
  scanned: PackageReference[];
  selected: PackageReference[];
  cloned: GitWorktreeResult[];
  skipped: Array<{
    dependency: PackageReference;
    reason: string;
  }>;
  clonedGit: GitReferenceWorktreeResult[];
  manifestPath: string;
}

export type AgentReferenceKind = 'package' | 'folder' | 'git';

export interface AgentReferenceManifest {
  schemaVersion: 1;
  generatedAt: string;
  projectRoot: string;
  references: Array<{
    kind: AgentReferenceKind;
    name: string;
    requested: string | null;
    version: string | null;
    packageManager: PackageManager | null;
    importers: string[];
    dependencyTypes: DependencyType[];
    repositoryUrl: string | null;
    repositoryDirectory: string | null;
    gitHead: string | null;
    bareRepositoryPath: string | null;
    path: string;
    checkoutRef: string | null;
    checkoutSha: string | null;
    refSource: GitWorktreeResult['refSource'] | GitReferenceWorktreeResult['refSource'] | null;
  }>;
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
  configured: boolean;
  currentVersion: string | null;
  clonedVersion: string | null;
  dependencyTypes: DependencyType[];
  importers: string[];
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

export interface CliOptions {
  command: 'list' | 'clone' | 'init' | 'status' | 'help' | 'version';
  projectPath: string | null;
  packages: string[];
  all: boolean;
  allImporters: boolean;
  json: boolean;
  nonInteractive: boolean;
  metadataFile: string | null;
  registry: string | null;
  bareStoreDir: string | null;
  worktreeRoot: string | null;
  configFile: string | null;
  force: boolean;
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
