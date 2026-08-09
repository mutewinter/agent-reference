import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { pathExists } from './fs-utils.ts';
import { tagCandidatesForDependency } from './package-utils.ts';
import { normalizeConfiguredRepository, repositoryCacheParts } from './repository.ts';
import type {
  AgentReferenceManifestReference,
  CheckoutConfidence,
  PackageReference,
  DependencyMetadata,
  GitReferenceWorktreeResult,
  GitWorktreeOptions,
  GitWorktreeResult,
  PackageRefSource
} from './types.ts';

const execFileAsync = promisify(execFile);

/** `--filter=blob:none` partial clones need git 2.19. */
const MINIMUM_GIT_VERSION = [2, 19, 0] as const;
/** Bound the tree walk used to locate a package inside an unfamiliar monorepo. */
const MAX_DIRECTORY_PROBES = 12;
const MAX_TAG_SEARCH_CANDIDATES = 10;

type PackageCheckoutSource = PackageRefSource;
type GitReferenceCheckoutSource = GitReferenceWorktreeResult['refSource'];

interface CheckoutRef<RefSource extends string> {
  ref: string;
  sha: string;
  source: RefSource;
  confidence: CheckoutConfidence;
}

interface MaterializedWorktree<RefSource extends string> {
  worktreePath: string;
  checkoutRef: string;
  checkoutSha: string;
  refSource: RefSource;
  confidence: CheckoutConfidence;
}

export async function ensureDependencyWorktree(
  dependency: PackageReference,
  metadata: DependencyMetadata,
  options: GitWorktreeOptions
): Promise<GitWorktreeResult> {
  if (!metadata.repositoryUrl) {
    throw new Error(`No repository URL found for ${dependency.name}@${dependency.version}`);
  }

  const locator = createPackageLocator(dependency, metadata);
  const materialized = await ensureWorktree(options.storeDir, metadata.repositoryUrl, (bareRepositoryPath) =>
    options.pinnedRef
      ? resolvePinnedCheckout(bareRepositoryPath, dependency, options.pinnedRef, locator)
      : resolvePackageCheckout(bareRepositoryPath, dependency, metadata, locator)
  );

  const packageDirectory = locator.directory() ?? normalizeDirectory(metadata.repositoryDirectory);
  return {
    dependency,
    metadata: { ...metadata, repositoryDirectory: packageDirectory },
    ...materialized,
    pinnedRef: options.pinnedRef ?? null,
    packagePath: await resolvePackagePath(materialized.worktreePath, packageDirectory)
  };
}

export async function ensureGitReferenceWorktree(
  name: string,
  spec: string,
  options: GitWorktreeOptions
): Promise<GitReferenceWorktreeResult> {
  const parsed = parseGitReferenceSpec(spec, options.projectRoot);
  const refName = parsed.ref ?? 'HEAD';
  const materialized = await ensureWorktree(options.storeDir, parsed.repositoryUrl, (bareRepositoryPath) =>
    resolveConfiguredRef(bareRepositoryPath, refName)
  );

  return {
    name,
    requested: spec,
    repositoryUrl: parsed.repositoryUrl,
    worktreePath: materialized.worktreePath,
    checkoutRef: materialized.checkoutRef,
    checkoutSha: materialized.checkoutSha,
    refSource: materialized.refSource
  };
}

function sharedWorktreePath(storeDir: string, repositoryUrl: string, sha: string): string {
  const parts = repositoryCacheParts(repositoryUrl);
  const repo = (parts.pop() ?? 'repository').replace(/\.git$/, '');
  return path.join(storeDir, 'worktrees', ...parts, repo, sha.slice(0, 12));
}

export function bareRepositoryPathFor(storeDir: string, repositoryUrl: string): string {
  return path.join(storeDir, 'repositories', ...repositoryCacheParts(repositoryUrl));
}

export function manifestReferencePath(
  storeDir: string,
  reference: AgentReferenceManifestReference
): string {
  return sharedWorktreePath(storeDir, reference.repositoryUrl, reference.checkoutSha);
}

/**
 * Packages published from a monorepo check out the whole repository, so the useful source
 * path is the package subdirectory whenever it actually exists in the checkout.
 */
export async function resolvePackagePath(
  worktreePath: string,
  packageDirectory: string | null | undefined
): Promise<string> {
  const directory = normalizeDirectory(packageDirectory);
  if (!directory || directory === '.') return worktreePath;

  const candidate = path.join(worktreePath, directory);
  return (await pathExists(candidate)) ? candidate : worktreePath;
}

async function ensureWorktree<RefSource extends string>(
  storeDir: string,
  repositoryUrl: string,
  resolveCheckout: (bareRepositoryPath: string) => Promise<CheckoutRef<RefSource>>
): Promise<MaterializedWorktree<RefSource>> {
  await ensureGitAvailable();

  const bareRepositoryPath = bareRepositoryPathFor(storeDir, repositoryUrl);
  await ensureBareRepository(repositoryUrl, bareRepositoryPath);
  const checkout = await resolveCheckout(bareRepositoryPath);
  const worktreePath = sharedWorktreePath(storeDir, repositoryUrl, checkout.sha);

  // The path is keyed by commit, so an existing one is already the right checkout.
  if (!(await pathExists(worktreePath))) {
    await fs.mkdir(path.dirname(worktreePath), { recursive: true });
    await runGit(['-C', bareRepositoryPath, 'worktree', 'add', '--detach', worktreePath, checkout.sha]);
  }

  return {
    worktreePath,
    checkoutRef: checkout.ref,
    checkoutSha: checkout.sha,
    refSource: checkout.source,
    confidence: checkout.confidence
  };
}

export async function runGit(
  args: string[],
  options: { allowFailure?: boolean } = {}
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const result = await execFileAsync('git', args, {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 64
    });
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: 0
    };
  } catch (error) {
    const failed = error as {
      stdout?: string;
      stderr?: string;
      code?: number | string;
      message?: string;
    };
    if (options.allowFailure) {
      return {
        stdout: failed.stdout ?? '',
        stderr: failed.stderr ?? failed.message ?? '',
        exitCode: typeof failed.code === 'number' ? failed.code : 1
      };
    }

    if (failed.code === 'ENOENT') {
      throw new Error(GIT_MISSING_MESSAGE);
    }

    const command = `git ${args.join(' ')}`;
    const detail = failed.stderr || failed.stdout || failed.message || 'unknown git failure';
    throw new Error(`${command} failed: ${String(detail).trim()}`);
  }
}

let gitPreflight: Promise<void> | null = null;

export const GIT_MISSING_MESSAGE: string =
  'git is required to materialize references, but it could not be executed. ' +
  'Install git (https://git-scm.com/downloads) and make sure it is on PATH.';

/** Fails with an actionable message instead of a raw spawn error when git is unusable. */
export async function ensureGitAvailable(): Promise<void> {
  gitPreflight ??= runGitPreflight();
  try {
    await gitPreflight;
  } catch (error) {
    // A failed probe must not stick: the user may install git and retry in the same process.
    gitPreflight = null;
    throw error;
  }
}

async function runGitPreflight(): Promise<void> {
  let output: string;
  try {
    output = (await execFileAsync('git', ['--version'], { encoding: 'utf8' })).stdout;
  } catch (error) {
    const failed = error as { code?: number | string; message?: string; stderr?: string };
    if (failed.code === 'ENOENT') throw new Error(GIT_MISSING_MESSAGE);
    throw new Error(`Could not run "git --version": ${failed.stderr || failed.message || 'unknown failure'}`);
  }

  const version = output.match(/(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!version) return;

  const parsed = [Number(version[1]), Number(version[2]), Number(version[3] ?? 0)];
  if (compareVersions(parsed, MINIMUM_GIT_VERSION) < 0) {
    throw new Error(
      `git ${parsed.join('.')} is too old. agent-reference needs git ${MINIMUM_GIT_VERSION.join('.')} or newer for partial clones and worktrees.`
    );
  }
}

function compareVersions(a: readonly number[], b: readonly number[]): number {
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

async function ensureBareRepository(repoUrl: string, bareRepositoryPath: string): Promise<void> {
  if (await pathExists(bareRepositoryPath)) {
    await ensureFetchRefspec(bareRepositoryPath);
    await runGit(['-C', bareRepositoryPath, 'fetch', '--tags', '--prune', '--filter=blob:none', 'origin'], {
      allowFailure: true
    });
    return;
  }

  await fs.mkdir(path.dirname(bareRepositoryPath), { recursive: true });
  await runGit(['clone', '--bare', '--filter=blob:none', repoUrl, bareRepositoryPath]);
  await ensureFetchRefspec(bareRepositoryPath);
}

/**
 * `git clone --bare` leaves remote.origin.fetch unset, so without this a later fetch only
 * moves tags and FETCH_HEAD and the cached branch refs never advance.
 */
async function ensureFetchRefspec(bareRepositoryPath: string): Promise<void> {
  await runGit(['-C', bareRepositoryPath, 'config', 'remote.origin.fetch', '+refs/heads/*:refs/heads/*'], {
    allowFailure: true
  });
}

interface PackageLocator {
  /** The target package's version at a commit, plus where in the tree it was found. */
  inspect: (bareRepositoryPath: string, sha: string) => Promise<{ directory: string | null; version: string | null }>;
  directory: () => string | null;
}

function createPackageLocator(dependency: PackageReference, metadata: DependencyMetadata): PackageLocator {
  let knownDirectory: string | null = null;
  let searched = false;

  const readManifest = async (
    bareRepositoryPath: string,
    sha: string,
    directory: string
  ): Promise<{ name?: string; version?: string } | null> => {
    const file = directory === '.' ? 'package.json' : `${directory}/package.json`;
    const result = await runGit(['-C', bareRepositoryPath, 'cat-file', 'blob', `${sha}:${file}`], {
      allowFailure: true
    });
    if (result.exitCode !== 0) return null;

    try {
      return JSON.parse(result.stdout) as { name?: string; version?: string };
    } catch {
      return null;
    }
  };

  const search = async (
    bareRepositoryPath: string,
    sha: string
  ): Promise<{ directory: string; version: string | null } | null> => {
    const listing = await runGit(['-C', bareRepositoryPath, 'ls-tree', '-r', '--name-only', sha], {
      allowFailure: true
    });
    if (listing.exitCode !== 0) return null;

    for (const directory of rankCandidateDirectories(listing.stdout, dependency.name)) {
      const manifest = await readManifest(bareRepositoryPath, sha, directory);
      if (manifest?.name === dependency.name) {
        return { directory, version: manifest.version ?? null };
      }
    }

    return null;
  };

  return {
    directory: () => knownDirectory,
    async inspect(bareRepositoryPath, sha) {
      const candidates = uniqueStrings([knownDirectory, normalizeDirectory(metadata.repositoryDirectory), '.']);
      for (const directory of candidates) {
        const manifest = await readManifest(bareRepositoryPath, sha, directory);
        if (manifest?.name === dependency.name) {
          knownDirectory = directory;
          return { directory, version: manifest.version ?? null };
        }
      }

      if (!searched) {
        searched = true;
        const found = await search(bareRepositoryPath, sha);
        if (found) {
          knownDirectory = found.directory;
          return found;
        }
      }

      return { directory: null, version: null };
    }
  };
}

function rankCandidateDirectories(listing: string, packageName: string): string[] {
  const leaf = packageName.includes('/') ? (packageName.split('/').at(-1) ?? packageName) : packageName;
  const directories = listing
    .split('\n')
    .filter((file) => file.endsWith('package.json'))
    .filter((file) => !file.includes('node_modules/') && !/(^|\/)(fixtures|__fixtures__|test|tests|examples)\//.test(file))
    .filter((file) => file.split('/').length <= 5)
    .map((file) => path.posix.dirname(file))
    .filter((directory) => directory !== '.');

  const score = (directory: string): number => {
    const base = path.posix.basename(directory);
    if (base === leaf) return 0;
    if (base === packageName.replace('/', '-')) return 1;
    if (base.includes(leaf) || leaf.includes(base)) return 2;
    return 3;
  };

  return [...new Set(directories)]
    .sort((a, b) => score(a) - score(b) || a.length - b.length || a.localeCompare(b))
    .slice(0, MAX_DIRECTORY_PROBES);
}

/**
 * Picks the commit that actually contains the requested package version.
 *
 * Release tag naming is not standardized, and `v1.2.3` in a monorepo with independently
 * versioned packages can be an unrelated release, so every candidate commit is checked
 * against the package.json recorded there before it is trusted.
 */
async function resolvePackageCheckout(
  bareRepositoryPath: string,
  dependency: PackageReference,
  metadata: DependencyMetadata,
  locator: PackageLocator
): Promise<CheckoutRef<PackageCheckoutSource>> {
  const seenShas = new Set<string>();
  const unverified: Array<CheckoutRef<PackageCheckoutSource>> = [];

  const consider = async (
    label: string,
    revision: string,
    source: PackageCheckoutSource
  ): Promise<CheckoutRef<PackageCheckoutSource> | null> => {
    const resolved = await resolveGitRevision(bareRepositoryPath, revision);
    if (!resolved || seenShas.has(resolved.sha)) return null;
    seenShas.add(resolved.sha);

    const found = await locator.inspect(bareRepositoryPath, resolved.sha);
    if (found.version === dependency.version) {
      return { ref: label, sha: resolved.sha, source, confidence: 'verified' };
    }
    if (found.version === null) {
      unverified.push({ ref: label, sha: resolved.sha, source, confidence: 'unverified' });
    }
    return null;
  };

  if (metadata.gitHead && (await ensureCommitAvailable(bareRepositoryPath, metadata.gitHead))) {
    const hit = await consider(metadata.gitHead, `${metadata.gitHead}^{commit}`, 'gitHead');
    if (hit) return hit;
  }

  for (const tag of tagCandidatesForDependency(dependency.name, dependency.version)) {
    const hit = await consider(`refs/tags/${tag}`, `refs/tags/${tag}^{commit}`, 'tag');
    if (hit) return hit;
  }

  for (const tag of await searchTagsForVersion(bareRepositoryPath, dependency.version)) {
    const hit = await consider(`refs/tags/${tag}`, `refs/tags/${tag}^{commit}`, 'tagSearch');
    if (hit) return hit;
  }

  const bestGuess = unverified[0];
  if (bestGuess) return bestGuess;

  const head = await resolveGitRevision(bareRepositoryPath, 'HEAD');
  if (!head) {
    throw new Error(`Unable to resolve a checkout ref for ${dependency.name}@${dependency.version}`);
  }

  return { ref: 'HEAD', sha: head.sha, source: 'defaultBranch', confidence: 'fallback' };
}

/**
 * Uses the ref an agent or human chose in the config, no questions asked. Automatic
 * resolution cannot cover every tagging scheme, so a pin is the documented way out and
 * must win even when it disagrees with the package.json at that commit.
 */
async function resolvePinnedCheckout(
  bareRepositoryPath: string,
  dependency: PackageReference,
  pinnedRef: string,
  locator: PackageLocator
): Promise<CheckoutRef<PackageCheckoutSource>> {
  const candidates = [
    `${pinnedRef}^{commit}`,
    `refs/tags/${pinnedRef}^{commit}`,
    `refs/heads/${pinnedRef}^{commit}`,
    `refs/remotes/origin/${pinnedRef}^{commit}`
  ];

  for (const candidate of candidates) {
    const resolved = await resolveGitRevision(bareRepositoryPath, candidate);
    if (!resolved) continue;

    // Locate the package directory even though the version is not in question.
    await locator.inspect(bareRepositoryPath, resolved.sha);
    return { ref: pinnedRef, sha: resolved.sha, source: 'pinned', confidence: 'pinned' };
  }

  await ensureCommitAvailable(bareRepositoryPath, pinnedRef);
  const fetched = await resolveGitRevision(bareRepositoryPath, `${pinnedRef}^{commit}`);
  if (fetched) {
    await locator.inspect(bareRepositoryPath, fetched.sha);
    return { ref: pinnedRef, sha: fetched.sha, source: 'pinned', confidence: 'pinned' };
  }

  throw new Error(
    `packages.${dependency.name}.ref is "${pinnedRef}", which is not a commit, tag, or branch in ${bareRepositoryPath}.`
  );
}

/** Catches release tags this tool does not know how to spell, such as `release-1.2.3`. */
async function searchTagsForVersion(
  bareRepositoryPath: string,
  version: string
): Promise<string[]> {
  const result = await runGit(['-C', bareRepositoryPath, 'tag', '--list', `*${version}`, `*${version}*`], {
    allowFailure: true
  });
  if (result.exitCode !== 0) return [];

  const tags = result.stdout.split('\n').map((tag) => tag.trim()).filter(Boolean);
  const suffixMatches = tags.filter((tag) => tag.endsWith(version));
  const rest = tags.filter((tag) => !tag.endsWith(version));

  return [...suffixMatches, ...rest].slice(0, MAX_TAG_SEARCH_CANDIDATES);
}

async function ensureCommitAvailable(
  bareRepositoryPath: string,
  commitSha: string
): Promise<boolean> {
  const local = await resolveGitRevision(bareRepositoryPath, `${commitSha}^{commit}`);
  if (local) return true;

  await runGit(['-C', bareRepositoryPath, 'fetch', '--filter=blob:none', 'origin', commitSha], {
    allowFailure: true
  });

  return Boolean(await resolveGitRevision(bareRepositoryPath, `${commitSha}^{commit}`));
}

async function resolveGitRevision(
  bareRepositoryPath: string,
  revision: string
): Promise<{ ref: string; sha: string } | null> {
  const result = await runGit(['-C', bareRepositoryPath, 'rev-parse', '--verify', '--quiet', revision], {
    allowFailure: true
  });
  const sha = result.stdout.trim();
  return result.exitCode === 0 && sha ? { ref: revision, sha } : null;
}

export function defaultStoreDir(): string {
  if (process.env.AGENT_REFERENCE_STORE_DIR) {
    return process.env.AGENT_REFERENCE_STORE_DIR;
  }
  if (process.env.XDG_CACHE_HOME) {
    return path.join(process.env.XDG_CACHE_HOME, 'agent-reference');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Caches', 'agent-reference');
  }
  if (process.platform === 'win32') {
    return path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local'), 'agent-reference', 'cache');
  }
  return path.join(os.homedir(), '.cache', 'agent-reference');
}

function parseGitReferenceSpec(spec: string, projectRoot: string): { repositoryUrl: string; ref: string | null } {
  const hashIndex = spec.lastIndexOf('#');
  const rawUrl = hashIndex === -1 ? spec : spec.slice(0, hashIndex);
  const ref = hashIndex === -1 ? null : spec.slice(hashIndex + 1);
  const repositoryUrl = normalizeConfiguredRepository(rawUrl, projectRoot);
  if (!repositoryUrl) {
    throw new Error(`Invalid git reference spec: ${spec}`);
  }
  return { repositoryUrl, ref: ref || null };
}

async function resolveConfiguredRef(
  bareRepositoryPath: string,
  refName: string
): Promise<CheckoutRef<GitReferenceCheckoutSource>> {
  const candidates = refName === 'HEAD'
    ? ['HEAD']
    : [
        `${refName}^{commit}`,
        `refs/tags/${refName}^{commit}`,
        `refs/heads/${refName}^{commit}`,
        `refs/remotes/origin/${refName}^{commit}`
      ];

  for (const candidate of candidates) {
    const resolved = await resolveGitRevision(bareRepositoryPath, candidate);
    if (resolved) {
      return {
        ref: refName,
        sha: resolved.sha,
        source: refName === 'HEAD' ? 'defaultBranch' : 'configured',
        confidence: 'verified'
      };
    }
  }

  throw new Error(`Unable to resolve git reference ${refName} in ${bareRepositoryPath}`);
}

function normalizeDirectory(directory: string | null | undefined): string | null {
  if (!directory) return null;
  const normalized = directory.replace(/^\.\//, '').replace(/^\/+/, '').replace(/\/+$/, '');
  return normalized || null;
}

function uniqueStrings(values: Array<string | null>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}
