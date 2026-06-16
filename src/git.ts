import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import {
  slugifyPackageName,
  slugifyVersion,
  tagCandidatesForDependency
} from './package-utils.ts';
import { repositoryCacheParts } from './repository.ts';
import type {
  PackageReference,
  DependencyMetadata,
  GitReferenceWorktreeResult,
  GitWorktreeOptions,
  GitWorktreeResult
} from './types.ts';

const execFileAsync = promisify(execFile);
type PackageCheckoutSource = Exclude<GitWorktreeResult['refSource'], 'existing'>;
type GitReferenceCheckoutSource = Exclude<GitReferenceWorktreeResult['refSource'], 'existing'>;

interface CheckoutRef<RefSource extends string> {
  ref: string;
  sha: string;
  source: RefSource;
}

interface MaterializedWorktree<RefSource extends string> {
  bareRepositoryPath: string;
  worktreePath: string;
  checkoutRef: string;
  checkoutSha: string;
  refSource: RefSource | 'existing';
  reused: boolean;
}

export async function ensureDependencyWorktree(
  dependency: PackageReference,
  metadata: DependencyMetadata,
  options: GitWorktreeOptions
): Promise<GitWorktreeResult> {
  if (!metadata.repositoryUrl) {
    throw new Error(`No repository URL found for ${dependency.name}@${dependency.version}`);
  }

  const gitBin = options.gitBin ?? 'git';
  const bareStoreDir = options.bareStoreDir ?? defaultBareStoreDir();
  const worktreeRoot = options.worktreeRoot ?? path.join(options.projectRoot, '.agent-reference', 'packages');
  const worktreePath = path.join(
    worktreeRoot,
    slugifyPackageName(dependency.name),
    slugifyVersion(dependency.version)
  );
  const materialized = await ensureWorktree({
    repositoryUrl: metadata.repositoryUrl,
    bareStoreDir,
    worktreePath,
    gitBin,
    force: options.force,
    resolveCheckout: (bareRepositoryPath) => resolveCheckoutRef(bareRepositoryPath, dependency, metadata, gitBin)
  });

  return {
    dependency,
    metadata,
    ...materialized
  };
}

export async function ensureGitReferenceWorktree(
  name: string,
  spec: string,
  options: GitWorktreeOptions
): Promise<GitReferenceWorktreeResult> {
  const parsed = parseGitReferenceSpec(spec, options.projectRoot);
  const gitBin = options.gitBin ?? 'git';
  const bareStoreDir = options.bareStoreDir ?? defaultBareStoreDir();
  const refName = parsed.ref ?? 'HEAD';
  const worktreeRoot = options.worktreeRoot ?? path.join(options.projectRoot, '.agent-reference', 'git');
  const worktreePath = path.join(worktreeRoot, slugifyPackageName(name), slugifyVersion(refName));
  const materialized = await ensureWorktree({
    repositoryUrl: parsed.repositoryUrl,
    bareStoreDir,
    worktreePath,
    gitBin,
    force: options.force,
    resolveCheckout: (bareRepositoryPath) => resolveConfiguredRef(bareRepositoryPath, refName, gitBin)
  });

  return {
    name,
    requested: spec,
    repositoryUrl: parsed.repositoryUrl,
    ...materialized
  };
}

async function ensureWorktree<RefSource extends string>(options: {
  repositoryUrl: string;
  bareStoreDir: string;
  worktreePath: string;
  gitBin: string;
  force?: boolean;
  resolveCheckout: (bareRepositoryPath: string) => Promise<CheckoutRef<RefSource>>;
}): Promise<MaterializedWorktree<RefSource>> {
  const bareRepositoryPath = path.join(options.bareStoreDir, ...repositoryCacheParts(options.repositoryUrl));
  await ensureBareRepository(options.repositoryUrl, bareRepositoryPath, options.gitBin);
  const checkout = await options.resolveCheckout(bareRepositoryPath);

  if (await pathExists(options.worktreePath)) {
    const checkoutSha = await runGit(['-C', options.worktreePath, 'rev-parse', 'HEAD'], { gitBin: options.gitBin });
    if (checkoutSha.stdout.trim() !== checkout.sha && !options.force) {
      throw new Error(
        `Worktree already exists at ${options.worktreePath} but is checked out at ${checkoutSha.stdout.trim()}`
      );
    }

    return {
      bareRepositoryPath,
      worktreePath: options.worktreePath,
      checkoutRef: checkout.ref,
      checkoutSha: checkoutSha.stdout.trim(),
      refSource: 'existing',
      reused: true
    };
  }

  await fs.mkdir(path.dirname(options.worktreePath), { recursive: true });
  await runGit(['-C', bareRepositoryPath, 'worktree', 'add', '--detach', options.worktreePath, checkout.ref], {
    gitBin: options.gitBin
  });
  const checkoutSha = await runGit(['-C', options.worktreePath, 'rev-parse', 'HEAD'], { gitBin: options.gitBin });

  return {
    bareRepositoryPath,
    worktreePath: options.worktreePath,
    checkoutRef: checkout.ref,
    checkoutSha: checkoutSha.stdout.trim(),
    refSource: checkout.source,
    reused: false
  };
}

export async function runGit(
  args: string[],
  options: { gitBin?: string; cwd?: string; allowFailure?: boolean } = {}
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const result = await execFileAsync(options.gitBin ?? 'git', args, {
      cwd: options.cwd,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 20
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
      code?: number;
      message?: string;
    };
    if (options.allowFailure) {
      return {
        stdout: failed.stdout ?? '',
        stderr: failed.stderr ?? failed.message ?? '',
        exitCode: typeof failed.code === 'number' ? failed.code : 1
      };
    }

    const command = `git ${args.join(' ')}`;
    const detail = failed.stderr || failed.stdout || failed.message || 'unknown git failure';
    throw new Error(`${command} failed: ${String(detail).trim()}`);
  }
}

async function ensureBareRepository(repoUrl: string, bareRepositoryPath: string, gitBin: string): Promise<void> {
  if (await pathExists(bareRepositoryPath)) {
    await runGit(['-C', bareRepositoryPath, 'fetch', '--tags', '--filter=blob:none', 'origin'], {
      gitBin,
      allowFailure: true
    });
    return;
  }

  await fs.mkdir(path.dirname(bareRepositoryPath), { recursive: true });
  await runGit(['clone', '--bare', '--filter=blob:none', repoUrl, bareRepositoryPath], { gitBin });
}

async function resolveCheckoutRef(
  bareRepositoryPath: string,
  dependency: PackageReference,
  metadata: DependencyMetadata,
  gitBin: string
): Promise<CheckoutRef<PackageCheckoutSource>> {
  if (metadata.gitHead) {
    const fetched = await ensureCommitAvailable(bareRepositoryPath, metadata.gitHead, gitBin);
    if (fetched) {
      return { ref: metadata.gitHead, sha: metadata.gitHead, source: 'gitHead' };
    }
  }

  for (const tag of tagCandidatesForDependency(dependency.name, dependency.version)) {
    const resolved = await resolveGitRevision(bareRepositoryPath, `refs/tags/${tag}^{commit}`, gitBin);
    if (resolved) {
      return { ref: resolved.ref, sha: resolved.sha, source: 'tag' };
    }
  }

  const head = await resolveGitRevision(bareRepositoryPath, 'HEAD', gitBin);
  if (!head) {
    throw new Error(`Unable to resolve a checkout ref for ${dependency.name}@${dependency.version}`);
  }

  return { ref: head.ref, sha: head.sha, source: 'defaultBranch' };
}

async function ensureCommitAvailable(
  bareRepositoryPath: string,
  commitSha: string,
  gitBin: string
): Promise<boolean> {
  const local = await resolveGitRevision(bareRepositoryPath, `${commitSha}^{commit}`, gitBin);
  if (local) return true;

  await runGit(['-C', bareRepositoryPath, 'fetch', '--filter=blob:none', 'origin', commitSha], {
    gitBin,
    allowFailure: true
  });

  return Boolean(await resolveGitRevision(bareRepositoryPath, `${commitSha}^{commit}`, gitBin));
}

async function resolveGitRevision(
  bareRepositoryPath: string,
  revision: string,
  gitBin: string
): Promise<{ ref: string; sha: string } | null> {
  const result = await runGit(['-C', bareRepositoryPath, 'rev-parse', '--verify', '--quiet', revision], {
    gitBin,
    allowFailure: true
  });
  const sha = result.stdout.trim();
  return result.exitCode === 0 && sha ? { ref: revision, sha } : null;
}

function defaultBareStoreDir(): string {
  if (process.env.AGENT_REFERENCE_STORE_DIR) {
    return process.env.AGENT_REFERENCE_STORE_DIR;
  }
  if (process.env.XDG_CACHE_HOME) {
    return path.join(process.env.XDG_CACHE_HOME, 'agent-reference', 'repositories');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Caches', 'agent-reference', 'repositories');
  }
  return path.join(os.homedir(), '.cache', 'agent-reference', 'repositories');
}

function parseGitReferenceSpec(spec: string, projectRoot: string): { repositoryUrl: string; ref: string | null } {
  const hashIndex = spec.lastIndexOf('#');
  const rawUrl = hashIndex === -1 ? spec : spec.slice(0, hashIndex);
  const ref = hashIndex === -1 ? null : spec.slice(hashIndex + 1);
  const repositoryUrl = normalizeGitReferenceUrl(rawUrl, projectRoot);
  if (!repositoryUrl) {
    throw new Error(`Invalid git reference spec: ${spec}`);
  }
  return { repositoryUrl, ref: ref || null };
}

function normalizeGitReferenceUrl(rawUrl: string, projectRoot: string): string | null {
  if (rawUrl.startsWith('file:')) {
    return path.resolve(projectRoot, rawUrl.slice('file:'.length));
  }
  if (rawUrl.startsWith('github:')) {
    return `https://github.com/${rawUrl.slice('github:'.length).replace(/\.git$/, '')}.git`;
  }
  return rawUrl || null;
}

async function resolveConfiguredRef(
  bareRepositoryPath: string,
  refName: string,
  gitBin: string
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
    const resolved = await resolveGitRevision(bareRepositoryPath, candidate, gitBin);
    if (resolved) {
      return {
        ref: resolved.ref,
        sha: resolved.sha,
        source: refName === 'HEAD' ? 'defaultBranch' : 'configured'
      };
    }
  }

  throw new Error(`Unable to resolve git reference ${refName} in ${bareRepositoryPath}`);
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
