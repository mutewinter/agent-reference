import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { pathExists, resolveConfigPath } from './fs-utils.ts';
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
  PackageRefSource,
} from './types.ts';

const execFileAsync = promisify(execFile);

const STORE_DIR_NAME = '.agent-reference';
/** Short on purpose: these two segments appear in every path the tool prints. */
export const BARE_DIR = 'git';
export const CHECKOUT_DIR = 'src';
/**
 * A checkout directory is named for its commit, and that name is the only thing marking it
 * as a checkout: the host and owner segments above it nest as deeply as the remote's path
 * does. `store` reads the tree back with this, so the two cannot disagree about the layout.
 */
export const CHECKOUT_SHA_LENGTH = 12;
const CHECKOUT_DIR_NAME = new RegExp(`^[0-9a-f]{${CHECKOUT_SHA_LENGTH}}$`);

export function isCheckoutDirectoryName(name: string): boolean {
  return CHECKOUT_DIR_NAME.test(name);
}

/** `--filter=blob:none` partial clones need git 2.19. */
const MINIMUM_GIT_VERSION = [2, 19, 0] as const;
/** Bound the tree walk used to locate a package inside an unfamiliar monorepo. */
const MAX_DIRECTORY_PROBES = 12;
const MAX_TAG_SEARCH_CANDIDATES = 10;

/**
 * Transport policy stated rather than inherited. `ext::` runs an arbitrary command as a
 * transport, and a repository URL is attacker-controlled for any package a project
 * references; CI images and dev setups do relax git's defaults, so this does not rely on
 * them. `file` stays at `user`, which is git's own default and what direct `file:` support
 * needs, while still refusing file transports reached indirectly.
 */
const GIT_SAFETY_CONFIG = ['-c', 'protocol.ext.allow=never', '-c', 'protocol.file.allow=user'];

/**
 * The only argv any git invocation is built from. Every path that reaches git goes through
 * here, so the transport policy cannot be lost by one caller spawning git its own way.
 */
export function gitArgv(args: string[]): string[] {
  return [...GIT_SAFETY_CONFIG, ...args];
}

const ALLOWED_GIT_PROTOCOLS = new Set(['https:', 'http:', 'ssh:', 'git:', 'file:']);

/**
 * git reads an argument beginning with `-` as an option wherever it sits, so a ref or a URL
 * out of a config file or registry metadata is an option injection rather than a value:
 * `--upload-pack=<cmd>` turns a fetch into arbitrary code execution, and no protocol policy
 * stops it. Every value reaching argv from outside this program passes through here.
 */
export class UnsafeGitValueError extends Error {}

export function assertSafeGitValue(value: string, what: string): string {
  if (value.startsWith('-')) {
    throw new UnsafeGitValueError(
      `${what} may not begin with "-". git would read ${JSON.stringify(value)} as an option rather than a value.`,
    );
  }
  return value;
}

/** Rejects a repository whose transport is not one git should be asked to speak. */
export function assertSafeRepositoryUrl(url: string, what: string): string {
  assertSafeGitValue(url, what);
  if (path.isAbsolute(url)) return url;

  let protocol: string;
  try {
    protocol = new URL(url).protocol;
  } catch {
    throw new UnsafeGitValueError(`${what} is not a usable git URL: ${JSON.stringify(url)}.`);
  }

  if (!ALLOWED_GIT_PROTOCOLS.has(protocol)) {
    throw new UnsafeGitValueError(
      `${what} uses the ${protocol} transport, which agent-reference will not run. Use https, ssh, git, or a local path.`,
    );
  }
  return url;
}

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
  /** The mirror could not be refreshed, so what it holds may predate the requested ref. */
  mirrorStale: boolean;
}

export async function ensureDependencyWorktree(
  dependency: PackageReference,
  metadata: DependencyMetadata,
  options: GitWorktreeOptions,
): Promise<GitWorktreeResult> {
  if (!metadata.repositoryUrl) {
    throw new Error(`No repository URL found for ${dependency.name}@${dependency.version}`);
  }

  const locator = createPackageLocator(dependency, metadata, options.pinnedDirectory ?? null);
  const materialized = await ensureWorktree(
    options.storeDir,
    metadata.repositoryUrl,
    (bareRepositoryPath) =>
      options.pinnedRef
        ? resolvePinnedCheckout(bareRepositoryPath, dependency, options.pinnedRef, locator)
        : resolvePackageCheckout(bareRepositoryPath, dependency, metadata, locator),
  );

  const packageDirectory = locator.directory() ?? normalizeDirectory(metadata.repositoryDirectory);
  return {
    dependency,
    metadata: { ...metadata, repositoryDirectory: packageDirectory },
    ...materialized,
    nameOnlyDirectory: packageDirectory ? null : locator.nameOnly(),
    pinnedRef: options.pinnedRef ?? null,
    packagePath: await resolvePackagePath(materialized.worktreePath, packageDirectory),
  };
}

export async function ensureGitReferenceWorktree(
  name: string,
  spec: string,
  directory: string | null,
  options: GitWorktreeOptions,
): Promise<GitReferenceWorktreeResult> {
  const parsed = parseGitReferenceSpec(spec, options.projectRoot);
  const refName = parsed.ref ?? 'HEAD';
  const materialized = await ensureWorktree(
    options.storeDir,
    parsed.repositoryUrl,
    (bareRepositoryPath) => resolveConfiguredRef(bareRepositoryPath, refName),
  );

  // Resolved against the checkout every time rather than recorded: the subtree is a view of
  // what was fetched, not a fact about the fetch, so editing `directory` takes effect on the
  // next command and an upstream reorganization is noticed rather than remembered wrong.
  const subpath = await resolveSubpath(materialized.worktreePath, directory);

  return {
    name,
    requested: spec,
    repositoryUrl: parsed.repositoryUrl,
    worktreePath: materialized.worktreePath,
    directory,
    referencePath: subpath.path,
    directoryMissing: subpath.missing,
    checkoutRef: materialized.checkoutRef,
    checkoutSha: materialized.checkoutSha,
    refSource: materialized.refSource,
    mirrorStale: materialized.mirrorStale,
  };
}

function sharedWorktreePath(storeDir: string, repositoryUrl: string, sha: string): string {
  const parts = repositoryCacheParts(repositoryUrl);
  const repo = (parts.pop() ?? 'repository').replace(/\.git$/, '');
  return path.join(storeDir, CHECKOUT_DIR, ...parts, repo, sha.slice(0, CHECKOUT_SHA_LENGTH));
}

export function bareRepositoryPathFor(storeDir: string, repositoryUrl: string): string {
  return path.join(storeDir, BARE_DIR, ...repositoryCacheParts(repositoryUrl));
}

export function manifestReferencePath(
  storeDir: string,
  reference: AgentReferenceManifestReference,
): string {
  return sharedWorktreePath(storeDir, reference.repositoryUrl, reference.checkoutSha);
}

/**
 * A checkout holds a whole repository, and the subtree worth reading is often one directory
 * inside it. `missing` separates "no directory was asked for" from "one was, and it is not
 * here", which the two callers need to treat differently.
 */
export interface SubpathResolution {
  path: string;
  missing: boolean;
}

export async function resolveSubpath(
  worktreePath: string,
  requested: string | null | undefined,
): Promise<SubpathResolution> {
  const directory = normalizeDirectory(requested);
  if (!directory || directory === '.') return { path: worktreePath, missing: false };

  // Containment checked against the resolved path, not the input: normalizeDirectory rejects
  // a literal `..`, and this catches anything that reaches outside by another route.
  const candidate = path.resolve(worktreePath, directory);
  const root = path.resolve(worktreePath);
  if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) {
    return { path: worktreePath, missing: true };
  }

  return (await pathExists(candidate))
    ? { path: candidate, missing: false }
    : { path: worktreePath, missing: true };
}

/**
 * Packages published from a monorepo check out the whole repository, so the useful source
 * path is the package subdirectory whenever it actually exists in the checkout. A directory
 * that is not there falls back to the root without comment, because a package's real gate is
 * the version its manifest reports, not this path.
 */
export async function resolvePackagePath(
  worktreePath: string,
  packageDirectory: string | null | undefined,
): Promise<string> {
  return (await resolveSubpath(worktreePath, packageDirectory)).path;
}

async function ensureWorktree<RefSource extends string>(
  storeDir: string,
  repositoryUrl: string,
  resolveCheckout: (bareRepositoryPath: string) => Promise<CheckoutRef<RefSource>>,
): Promise<MaterializedWorktree<RefSource>> {
  await ensureGitAvailable();

  // Before the store path is derived, not after: deriving it parses the URL, so an
  // unusable repository failed as a raw TypeError from deep in path construction, which
  // then read as a clone failure and sent the agent to check its network and credentials.
  assertSafeRepositoryUrl(repositoryUrl, 'A repository URL');
  const bareRepositoryPath = bareRepositoryPathFor(storeDir, repositoryUrl);
  const { updated } = await ensureBareRepository(repositoryUrl, bareRepositoryPath);
  const checkout = await resolveCheckout(bareRepositoryPath);
  const worktreePath = sharedWorktreePath(storeDir, repositoryUrl, checkout.sha);

  // The path is keyed by commit, so an existing one is already the right checkout. Agents
  // materialize several references at once, so two runs reach this together: the loser of
  // that race finds the worktree already there, which is success rather than a failure.
  if (!(await pathExists(worktreePath))) {
    await fs.mkdir(path.dirname(worktreePath), { recursive: true });
    const added = await runGit(
      ['-C', bareRepositoryPath, 'worktree', 'add', '--detach', worktreePath, checkout.sha],
      { allowFailure: true },
    );
    if (added.exitCode !== 0 && !(await pathExists(worktreePath))) {
      throw new Error(`git worktree add failed: ${added.stderr.trim() || 'unknown git failure'}`);
    }
  }

  return {
    worktreePath,
    checkoutRef: checkout.ref,
    checkoutSha: checkout.sha,
    refSource: checkout.source,
    confidence: checkout.confidence,
    mirrorStale: !updated,
  };
}

export async function runGit(
  args: string[],
  options: { allowFailure?: boolean } = {},
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const result = await execFileAsync('git', gitArgv(args), {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 64,
    });
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: 0,
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
        exitCode: typeof failed.code === 'number' ? failed.code : 1,
      };
    }

    if (failed.code === 'ENOENT') {
      throw new Error(GIT_MISSING_MESSAGE, { cause: error });
    }

    const command = `git ${args.join(' ')}`;
    const detail = failed.stderr || failed.stdout || failed.message || 'unknown git failure';
    throw new Error(`${command} failed: ${String(detail).trim()}`, { cause: error });
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
    if (failed.code === 'ENOENT') throw new Error(GIT_MISSING_MESSAGE, { cause: error });
    throw new Error(
      `Could not run "git --version": ${failed.stderr || failed.message || 'unknown failure'}`,
      { cause: error },
    );
  }

  const version = output.match(/(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!version) return;

  const parsed = [Number(version[1]), Number(version[2]), Number(version[3] ?? 0)];
  if (compareVersions(parsed, MINIMUM_GIT_VERSION) < 0) {
    throw new Error(
      `git ${parsed.join('.')} is too old. agent-reference needs git ${MINIMUM_GIT_VERSION.join('.')} or newer for partial clones and worktrees.`,
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

async function ensureBareRepository(
  repoUrl: string,
  bareRepositoryPath: string,
): Promise<{ updated: boolean }> {
  if (await pathExists(bareRepositoryPath)) {
    await ensureFetchRefspec(bareRepositoryPath);
    const updated = await reportProgress(
      ['-C', bareRepositoryPath, 'fetch', '--tags', '--prune', '--filter=blob:none', 'origin'],
      `updating ${describeRepository(repoUrl)}`,
      { allowFailure: true },
    );
    // A mirror that cannot be refreshed still answers, out of whatever it last held. Said
    // out loud, because the alternative is a ref that is simply not here yet being reported
    // as a tag this tool cannot spell, which sends an agent to pin something that exists.
    if (!updated) {
      process.stderr.write(
        `agent-reference: could not update ${describeRepository(repoUrl)}; reading what the mirror already holds\n`,
      );
    }
    return { updated };
  }

  await fs.mkdir(path.dirname(bareRepositoryPath), { recursive: true });
  await reportProgress(
    ['clone', '--bare', '--filter=blob:none', repoUrl, bareRepositoryPath],
    `cloning ${describeRepository(repoUrl)}`,
  );
  await ensureFetchRefspec(bareRepositoryPath);
  return { updated: true };
}

function describeRepository(repositoryUrl: string): string {
  const parts = repositoryCacheParts(repositoryUrl);
  return (
    parts
      .slice(1)
      .join('/')
      .replace(/\.git$/, '') || repositoryUrl
  );
}

/**
 * Fetching a big repository runs for minutes. With output captured that is
 * indistinguishable from a hang, so say what is happening and, when a human is watching,
 * let git draw its own progress.
 */
async function reportProgress(
  args: string[],
  label: string,
  options: { allowFailure?: boolean } = {},
): Promise<boolean> {
  process.stderr.write(`agent-reference: ${label}\n`);

  if (!process.stderr.isTTY) {
    return (await runGit(args, options)).exitCode === 0;
  }

  return new Promise<boolean>((resolve, reject) => {
    // The same policy runGit applies. Drawing progress is a display choice, and a display
    // choice must not decide which transports git will speak.
    const child = spawn('git', gitArgv([...args, '--progress']), {
      stdio: ['ignore', 'ignore', 'inherit'],
    });
    child.on('error', (error: NodeJS.ErrnoException) => {
      reject(error.code === 'ENOENT' ? new Error(GIT_MISSING_MESSAGE) : error);
    });
    child.on('close', (code) => {
      if (code === 0) resolve(true);
      else if (options.allowFailure) resolve(false);
      else reject(new Error(`git ${args.join(' ')} failed with exit code ${code}`));
    });
  });
}

/**
 * `git clone --bare` leaves remote.origin.fetch unset, so without this a later fetch only
 * moves tags and FETCH_HEAD and the cached branch refs never advance.
 */
async function ensureFetchRefspec(bareRepositoryPath: string): Promise<void> {
  await runGit(
    ['-C', bareRepositoryPath, 'config', 'remote.origin.fetch', '+refs/heads/*:refs/heads/*'],
    {
      allowFailure: true,
    },
  );
}

interface PackageLocator {
  /** The target package's version at a commit, plus where in the tree it was found. */
  inspect: (
    bareRepositoryPath: string,
    sha: string,
  ) => Promise<{ directory: string | null; version: string | null }>;
  directory: () => string | null;
  /** A directory claiming the package's name that never confirmed its version. */
  nameOnly: () => string | null;
}

function createPackageLocator(
  dependency: PackageReference,
  metadata: DependencyMetadata,
  pinnedDirectory: string | null,
): PackageLocator {
  const pinned = normalizeDirectory(pinnedDirectory);
  // Two different questions. `probe` is where to read a manifest while deciding whether a
  // commit is the right one, and a name match is good enough for that. `confirmed` is what
  // gets handed back as the package's path, and only a manifest reporting this exact name
  // and version earns it: electron's `default_app` is named `electron` and is not electron.
  let probe: string | null = pinned;
  let confirmed: string | null = pinned;
  let searched = false;

  const readManifest = async (
    bareRepositoryPath: string,
    sha: string,
    directory: string,
  ): Promise<{ name?: string; version?: string } | null> => {
    const file = directory === '.' ? 'package.json' : `${directory}/package.json`;
    const result = await runGit(['-C', bareRepositoryPath, 'cat-file', 'blob', `${sha}:${file}`], {
      allowFailure: true,
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
    sha: string,
  ): Promise<{ directory: string; version: string | null } | null> => {
    const listing = await runGit(['-C', bareRepositoryPath, 'ls-tree', '-r', '--name-only', sha], {
      allowFailure: true,
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

  let nameOnly: string | null = null;
  const record = (
    directory: string,
    version: string | null,
  ): { directory: string; version: string | null } => {
    probe = directory;
    if (version === dependency.version) confirmed = directory;
    else if (directory !== '.') nameOnly = directory;
    return { directory, version };
  };

  return {
    // Nothing confirmed means the repository root, which is never a lie about what it holds.
    // A wrong subdirectory is: the agent believes it has the package and finds two files.
    directory: () => confirmed,
    nameOnly: () => nameOnly,
    async inspect(bareRepositoryPath, sha) {
      // A directory chosen by hand wins outright, the way a pinned ref does. The manifest
      // there is read only to answer the verify gate, and a name or version that disagrees
      // makes the commit inconclusive rather than wrong: the pin asserts where the package
      // lives, not that this directory carries the package's own manifest.
      if (pinned) {
        const manifest = await readManifest(bareRepositoryPath, sha, pinned);
        const version = manifest?.name === dependency.name ? (manifest.version ?? null) : null;
        return { directory: pinned, version: version === dependency.version ? version : null };
      }

      const candidates = uniqueStrings([
        probe,
        normalizeDirectory(metadata.repositoryDirectory),
        '.',
      ]);
      for (const directory of candidates) {
        const manifest = await readManifest(bareRepositoryPath, sha, directory);
        if (manifest?.name === dependency.name) return record(directory, manifest.version ?? null);
      }

      // One tree walk per resolution, not per candidate commit. What it finds is remembered
      // as a place to probe, so later commits check it directly.
      if (!searched) {
        searched = true;
        const found = await search(bareRepositoryPath, sha);
        if (found) return record(found.directory, found.version);
      }

      return { directory: null, version: null };
    },
  };
}

function rankCandidateDirectories(listing: string, packageName: string): string[] {
  const leaf = packageName.includes('/')
    ? (packageName.split('/').at(-1) ?? packageName)
    : packageName;
  const directories = listing
    .split('\n')
    .filter((file) => file.endsWith('package.json'))
    .filter(
      (file) =>
        !file.includes('node_modules/') &&
        !/(^|\/)(fixtures|__fixtures__|test|tests|examples)\//.test(file),
    )
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
    .toSorted((a, b) => score(a) - score(b) || a.length - b.length || a.localeCompare(b))
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
  locator: PackageLocator,
): Promise<CheckoutRef<PackageCheckoutSource>> {
  const seenShas = new Set<string>();
  const unverified: Array<CheckoutRef<PackageCheckoutSource>> = [];

  const consider = async (
    label: string,
    revision: string,
    source: PackageCheckoutSource,
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
    throw new Error(
      `Unable to resolve a checkout ref for ${dependency.name}@${dependency.version}`,
    );
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
  locator: PackageLocator,
): Promise<CheckoutRef<PackageCheckoutSource>> {
  const candidates = [
    `${pinnedRef}^{commit}`,
    `refs/tags/${pinnedRef}^{commit}`,
    `refs/heads/${pinnedRef}^{commit}`,
    `refs/remotes/origin/${pinnedRef}^{commit}`,
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
    `packages.${dependency.name}.ref is "${pinnedRef}", which is not a commit, tag, or branch in ${bareRepositoryPath}.`,
  );
}

/** Catches release tags this tool does not know how to spell, such as `release-1.2.3`. */
async function searchTagsForVersion(
  bareRepositoryPath: string,
  version: string,
): Promise<string[]> {
  assertSafeGitValue(version, 'A version');
  const result = await runGit(
    ['-C', bareRepositoryPath, 'tag', '--list', `*${version}`, `*${version}*`],
    {
      allowFailure: true,
    },
  );
  if (result.exitCode !== 0) return [];

  const tags = result.stdout
    .split('\n')
    .map((tag) => tag.trim())
    .filter(Boolean);
  const suffixMatches = tags.filter((tag) => tag.endsWith(version));
  const rest = tags.filter((tag) => !tag.endsWith(version));

  return [...suffixMatches, ...rest].slice(0, MAX_TAG_SEARCH_CANDIDATES);
}

async function ensureCommitAvailable(
  bareRepositoryPath: string,
  commitSha: string,
): Promise<boolean> {
  const local = await resolveGitRevision(bareRepositoryPath, `${commitSha}^{commit}`);
  if (local) return true;

  assertSafeGitValue(commitSha, 'A ref or commit');
  await runGit(['-C', bareRepositoryPath, 'fetch', '--filter=blob:none', 'origin', commitSha], {
    allowFailure: true,
  });

  return Boolean(await resolveGitRevision(bareRepositoryPath, `${commitSha}^{commit}`));
}

async function resolveGitRevision(
  bareRepositoryPath: string,
  revision: string,
): Promise<{ ref: string; sha: string } | null> {
  if (revision.startsWith('-')) return null;
  const result = await runGit(
    ['-C', bareRepositoryPath, 'rev-parse', '--verify', '--quiet', revision],
    {
      allowFailure: true,
    },
  );
  const sha = result.stdout.trim();
  return result.exitCode === 0 && sha ? { ref: revision, sha } : null;
}

/**
 * One short, identical location on every platform. These paths are read by humans in
 * terminal output, so predictability beats following each OS's cache convention.
 */
export function defaultStoreDir(): string {
  return process.env.AGENT_REFERENCE_STORE_DIR ?? path.join(os.homedir(), STORE_DIR_NAME);
}

/**
 * Which store a command works against: an explicit option, then the config's `cacheDir`,
 * then the default. Every command has to answer this the same way, or one of them reads a
 * store the others never write to.
 */
export function resolveStoreDir(
  projectRoot: string,
  cwd: string,
  configured: string | undefined,
): string {
  return configured ? resolveConfigPath(projectRoot, cwd, configured) : defaultStoreDir();
}

function parseGitReferenceSpec(
  spec: string,
  projectRoot: string,
): { repositoryUrl: string; ref: string | null } {
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
  refName: string,
): Promise<CheckoutRef<GitReferenceCheckoutSource>> {
  const candidates =
    refName === 'HEAD'
      ? ['HEAD']
      : [
          `${refName}^{commit}`,
          `refs/tags/${refName}^{commit}`,
          `refs/heads/${refName}^{commit}`,
          `refs/remotes/origin/${refName}^{commit}`,
        ];

  for (const candidate of candidates) {
    const resolved = await resolveGitRevision(bareRepositoryPath, candidate);
    if (resolved) {
      return {
        ref: refName,
        sha: resolved.sha,
        source: refName === 'HEAD' ? 'defaultBranch' : 'configured',
        confidence: 'verified',
      };
    }
  }

  throw new Error(`Unable to resolve git reference ${refName} in ${bareRepositoryPath}`);
}

/**
 * `repository.directory` is attacker-controlled for any package a project references, and it
 * is joined onto the checkout to produce the path handed back as upstream source. A `..`
 * segment there pointed that path at any readable location, so an agent would read `/etc` or
 * a sibling checkout believing it was reading the package.
 */
function normalizeDirectory(directory: string | null | undefined): string | null {
  if (!directory) return null;
  const normalized = directory.replace(/^\.\//, '').replace(/^\/+/, '').replace(/\/+$/, '');
  if (!normalized) return null;
  if (normalized.split(/[\\/]/).includes('..')) return null;
  return normalized;
}

function uniqueStrings(values: Array<string | null>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}
