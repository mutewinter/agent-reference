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
  storeDir: string;
  /** Checkout chosen by hand in the config; skips version resolution entirely. */
  pinnedRef?: string | null;
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
  groups?: string[];
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
  /** The config's `ref` at clone time, so drift from a re-pin is detectable. */
  pinnedRef: string | null;
}

export type UnresolvedReason = 'no-repository' | 'registry-error' | 'unresolved-ref' | 'clone-failed';

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
  schemaVersion: 5;
  references: AgentReferenceManifestReference[];
  unresolved?: UnresolvedManifestReference[];
}

export type AgentReferenceStatusState =
  | 'ready'
  | 'missing'
  | 'missing-worktree'
  | 'stale'
  | 'not-installed'
  | 'unresolvable';

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
  severity: ProblemSeverity;
  summary: string;
  fix: string;
  configPatch: Record<string, unknown> | null;
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
  problems: AgentReferenceProblem[];
  /** Commands to run now, in order. Empty when every reference is usable. */
  nextSteps: string[];
  summary: Record<AgentReferenceStatusState, number>;
}

export interface ConfiguredPackageReference {
  kind: 'package';
  name: string;
  /** `installed` to follow the lockfile, or an exact version, range, or dist-tag. */
  version: string;
  /** Commit, tag, or branch to check out, overriding automatic version resolution. */
  ref: string | null;
  /** Git remote to use when registry metadata has none or points at the wrong repo. */
  repository: string | null;
  /** Package subdirectory within the repository, for monorepos the resolver misreads. */
  directory: string | null;
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
  allImporters?: boolean;
  registry?: string;
  cacheDir?: string;
}

export interface LoadedAgentReferenceConfig {
  path: string | null;
  localPath: string | null;
  config: AgentReferenceConfig;
}
