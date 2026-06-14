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

export interface DepCloneDependency {
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
  resolve(dependency: DepCloneDependency): Promise<DependencyMetadata>;
}

export interface GitWorktreeOptions {
  projectRoot: string;
  bareStoreDir?: string;
  worktreeRoot?: string;
  gitBin?: string;
  force?: boolean;
}

export interface GitWorktreeResult {
  dependency: DepCloneDependency;
  metadata: DependencyMetadata;
  bareRepositoryPath: string;
  worktreePath: string;
  checkoutRef: string;
  checkoutSha: string;
  refSource: 'gitHead' | 'tag' | 'defaultBranch' | 'existing';
  reused: boolean;
}

export interface CloneDependencyOptions extends ScanProjectOptions {
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

export interface CloneDependencyResult {
  scanned: DepCloneDependency[];
  selected: DepCloneDependency[];
  cloned: GitWorktreeResult[];
  skipped: Array<{
    dependency: DepCloneDependency;
    reason: string;
  }>;
  manifestPath: string;
}

export interface DepCloneManifest {
  schemaVersion: 1;
  generatedAt: string;
  projectRoot: string;
  dependencies: Array<{
    name: string;
    version: string;
    packageManager: PackageManager;
    importers: string[];
    dependencyTypes: DependencyType[];
    repositoryUrl: string | null;
    repositoryDirectory: string | null;
    gitHead: string | null;
    bareRepositoryPath: string;
    worktreePath: string;
    checkoutRef: string;
    checkoutSha: string;
    refSource: GitWorktreeResult['refSource'];
  }>;
}

export type DepCloneStatusState =
  | 'ready'
  | 'missing'
  | 'missing-worktree'
  | 'stale'
  | 'not-installed'
  | 'unconfigured';

export interface DepCloneStatusEntry {
  name: string;
  packageManager: PackageManager | null;
  configured: boolean;
  currentVersion: string | null;
  clonedVersion: string | null;
  dependencyTypes: DependencyType[];
  importers: string[];
  worktreePath: string | null;
  checkoutSha: string | null;
  status: DepCloneStatusState;
  action: string;
}

export interface DepCloneStatusReport {
  schemaVersion: 1;
  generatedAt: string;
  projectRoot: string;
  configPath: string | null;
  manifestPath: string | null;
  entries: DepCloneStatusEntry[];
  summary: Record<DepCloneStatusState, number>;
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

export interface DepCloneConfig {
  schemaVersion: 1;
  references?: string[];
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  all?: boolean;
  allImporters?: boolean;
  registry?: string;
  worktreeDir?: string;
  cacheDir?: string;
}

export interface LoadedDepCloneConfig {
  path: string;
  config: DepCloneConfig;
}
