export type DependencyType = 'dependencies' | 'devDependencies' | 'optionalDependencies';

export type PackageManager = 'pnpm' | 'npm' | 'bun' | 'yarn' | 'config' | 'unknown';

/**
 * A project is any directory: the nearest agent-reference config anchors it, and a Node
 * lockfile is optional context. Without one there are simply no package references.
 */
export interface ProjectContext {
  projectRoot: string;
  packageJsonPath: string | null;
  lockfilePath: string | null;
  packageManager: PackageManager;
  /** Workspace importer path relative to the lockfile's directory. */
  importer: string;
}

/** A project context whose lockfile is known to exist, as the scanners require. */
export type LockfileProjectContext = ProjectContext & { lockfilePath: string };

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
  storeDir: string;
  /** Checkout chosen by hand in the config; skips version resolution entirely. */
  pinnedRef?: string | null;
  /** Package subdirectory chosen by hand in the config; wins over name-based detection. */
  pinnedDirectory?: string | null;
}

/**
 * How confident the resolver is that a checkout really is the requested package version.
 * `verified` means the package.json at that commit reported the exact name and version.
 * `pinned` means a human or agent chose the ref by hand, which overrides any guess.
 */
export type CheckoutConfidence = 'pinned' | 'verified' | 'unverified' | 'fallback';

export type PackageRefSource = 'pinned' | 'gitHead' | 'tag' | 'tagSearch' | 'defaultBranch';

export interface GitWorktreeResult {
  dependency: PackageReference;
  metadata: DependencyMetadata;
  worktreePath: string;
  packagePath: string;
  checkoutRef: string;
  checkoutSha: string;
  refSource: PackageRefSource;
  confidence: CheckoutConfidence;
  /** A directory that claimed the package's name without confirming its version. */
  nameOnlyDirectory: string | null;
  pinnedRef: string | null;
}

export interface GitReferenceWorktreeResult {
  name: string;
  requested: string;
  repositoryUrl: string;
  worktreePath: string;
  checkoutRef: string;
  checkoutSha: string;
  refSource: 'configured' | 'defaultBranch';
}

/** Empty selects every configured reference. */
export interface ReferenceSelectionOptions {
  references?: string[];
  /** Set labels: a set's name, its exact description, or an unambiguous substring of it. */
  sets?: string[];
}

export interface CloneReferencesOptions
  extends ScanProjectOptions,
    RegistryOptions,
    ReferenceSelectionOptions {
  storeDir?: string;
}

export interface CloneReferencesResult {
  cloned: GitWorktreeResult[];
  skipped: Array<{
    name: string;
    version: string | null;
    reason: string;
  }>;
  clonedGit: GitReferenceWorktreeResult[];
  /** Names of selected folder references. They are already local, so nothing is cloned. */
  folders: string[];
  unresolved: UnresolvedManifestReference[];
  /** Same shape `status` reports, so a failure is explained where it happened. */
  problems: AgentReferenceProblem[];
  /** Machine-local materialization state, kept in the store rather than the project. */
  manifestPath: string;
}

/** A pinned config version that no longer matches what the project installs. */
export interface PackageDrift {
  name: string;
  pinned: string;
  installed: string[];
  importers: string[];
}

/**
 * Where the version being materialized came from. `registry` is the one worth saying out
 * loud: it means nothing in this project installs the package, so the checkout is upstream's
 * latest rather than anything this repository depends on.
 */
export type PackageVersionSource = 'explicit' | 'lockfile' | 'registry' | 'config';

/** One materialized (or located, for folders) reference returned by `get`. */
export interface GetReferenceResult {
  kind: AgentReferenceKind;
  name: string;
  /** The spec as the caller wrote it. */
  requested: string;
  version: string | null;
  versionSource: PackageVersionSource | null;
  path: string;
  repositoryPath: string | null;
  repositoryUrl: string | null;
  checkoutRef: string | null;
  checkoutSha: string | null;
  refSource: string | null;
  confidence: CheckoutConfidence | null;
  description: string | null;
  /** True when the result was written to this project's materialization state. */
  recorded: boolean;
  /**
   * Anything the caller has to know about this result to read it correctly: a checkout that
   * is not the requested version, or a version that came from the registry rather than this
   * project. `get` is the command an agent runs, so what is wrong with a result is reported
   * here rather than only by `status`.
   */
  problem: AgentReferenceProblem | null;
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
  /** The config's `ref` at clone time, so drift from a re-pin is detectable. */
  pinnedRef: string | null;
}

export type UnresolvedReason =
  | 'no-repository'
  | 'registry-error'
  | 'unresolved-ref'
  | 'clone-failed'
  | 'rejected';

/**
 * A reference that could not be materialized. Recorded in the lockfile so `status` can
 * explain the failure and its fix without repeating the network work that discovered it.
 */
export interface UnresolvedManifestReference {
  kind: 'package';
  name: string;
  version: string;
  reason: UnresolvedReason;
  detail: string;
  repositoryUrl: string | null;
  /** Config overrides in effect when this failed, so a later edit is known to be a retry. */
  pinnedRef: string | null;
  repository: string | null;
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
  schemaVersion: 6;
  /** The project this state belongs to. The file lives in the store, keyed by this path. */
  projectRoot: string;
  references: AgentReferenceManifestReference[];
  unresolved?: UnresolvedManifestReference[];
}

/**
 * `declared` is the normal resting state of a healthy config: the reference is named but
 * nothing has been fetched, because nothing needed it yet. Only folders can be `missing`,
 * since a folder cannot be materialized on demand.
 */
export type AgentReferenceStatusState =
  | 'ready'
  | 'declared'
  | 'stale'
  | 'missing'
  | 'unresolvable';

export interface AgentReferenceStatusEntry {
  kind: AgentReferenceKind;
  name: string;
  description: string | null;
  /** Which config file declared this reference: committed (`shared`) or gitignored (`local`). */
  scope: ConfigScope | null;
  /** Labels of the sets this reference belongs to. */
  sets: string[];
  requested: string | null;
  packageManager: PackageManager | null;
  currentVersion: string | null;
  clonedVersion: string | null;
  path: string | null;
  /** Repository checkout root. Differs from `path` for a package inside a monorepo. */
  repositoryPath: string | null;
  repositoryUrl: string | null;
  checkoutSha: string | null;
  confidence: CheckoutConfidence | null;
  status: AgentReferenceStatusState;
  action: string;
}

export type ProblemSeverity = 'error' | 'warning';

/**
 * A problem an agent has to resolve, stated so it can act without reading this source.
 * `configPatch` is the literal JSON to merge into agent-reference.json when one exists.
 */
export interface AgentReferenceProblem {
  reference: string | null;
  /**
   * `config` when the file itself is wrong and the fix is to edit it. Absent means the
   * reference cannot be materialized, which is the case the keep-the-reference note is for.
   */
  about?: 'config';
  severity: ProblemSeverity;
  summary: string;
  fix: string;
  configPatch: Record<string, unknown> | null;
}

export interface AgentReferenceStatusSet {
  name: string | null;
  description: string;
  references: string[];
}

export interface AgentReferenceStatusReport {
  generatedAt: string;
  projectRoot: string;
  configPath: string | null;
  localConfigPath: string | null;
  manifestPath: string | null;
  /** Lockfile dependencies available to `get` whether or not they are configured. */
  installedPackageCount: number;
  sets: AgentReferenceStatusSet[];
  references: AgentReferenceStatusEntry[];
  problems: AgentReferenceProblem[];
  /** Commands to run now, in order. Empty when every reference is usable. */
  nextSteps: string[];
  summary: Record<AgentReferenceStatusState, number>;
}

/** Which config file a reference was declared in. Local entries never belong in a commit. */
export type ConfigScope = 'shared' | 'local';

export interface ConfiguredPackageReference {
  kind: 'package';
  name: string;
  scope: ConfigScope;
  /** `installed` to follow the lockfile, or an exact version, range, or dist-tag. */
  version: string;
  /** Commit, tag, or branch to check out, overriding automatic version resolution. */
  ref: string | null;
  /** Git remote to use when registry metadata has none or points at the wrong repo. */
  repository: string | null;
  /** Package subdirectory within the repository, for monorepos the resolver misreads. */
  directory: string | null;
  description: string | null;
  /** Labels of the sets this reference was declared inside. */
  sets: string[];
}

export interface ConfiguredFolderReference {
  kind: 'folder';
  name: string;
  scope: ConfigScope;
  path: string;
  description: string | null;
  sets: string[];
}

export interface ConfiguredGitReference {
  kind: 'git';
  name: string;
  scope: ConfigScope;
  repository: string;
  ref: string | null;
  /** Canonical `repository#ref` form. Recorded in the state file so drift is detectable. */
  spec: string;
  description: string | null;
  sets: string[];
}

export type ConfiguredReference =
  | ConfiguredPackageReference
  | ConfiguredFolderReference
  | ConfiguredGitReference;

/**
 * A set is a labeled list: a description saying what the collection is for, holding
 * references declared inline. The description doubles as the display heading; `name` is an
 * optional short handle for CLI selection.
 */
export interface ConfiguredSet {
  name: string | null;
  description: string;
}

export interface ReferenceSetMember {
  kind: AgentReferenceKind;
  name: string;
}

export interface ReferenceSet {
  name: string | null;
  description: string;
  members: ReferenceSetMember[];
}

export interface AgentReferenceConfig {
  packages: ConfiguredPackageReference[];
  folders: ConfiguredFolderReference[];
  git: ConfiguredGitReference[];
  sets: ConfiguredSet[];
  allImporters?: boolean;
  registry?: string;
  cacheDir?: string;
  /** Which config file supplied `cacheDir`, so a machine path in the committed one is catchable. */
  cacheDirScope?: ConfigScope;
}

export interface LoadedAgentReferenceConfig {
  path: string | null;
  localPath: string | null;
  config: AgentReferenceConfig;
}
