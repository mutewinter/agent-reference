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
  DepCloneDependency,
  DependencyMetadata,
  GitWorktreeOptions,
  GitWorktreeResult
} from './types.ts';

const execFileAsync = promisify(execFile);

export async function ensureDependencyWorktree(
  dependency: DepCloneDependency,
  metadata: DependencyMetadata,
  options: GitWorktreeOptions
): Promise<GitWorktreeResult> {
  if (!metadata.repositoryUrl) {
    throw new Error(`No repository URL found for ${dependency.name}@${dependency.version}`);
  }

  const gitBin = options.gitBin ?? 'git';
  const bareStoreDir = options.bareStoreDir ?? defaultBareStoreDir();
  const bareRepositoryPath = path.join(bareStoreDir, ...repositoryCacheParts(metadata.repositoryUrl));
  const worktreeRoot = options.worktreeRoot ?? path.join(options.projectRoot, '.depclone', 'dependencies');
  const worktreePath = path.join(
    worktreeRoot,
    slugifyPackageName(dependency.name),
    slugifyVersion(dependency.version)
  );

  await ensureBareRepository(metadata.repositoryUrl, bareRepositoryPath, gitBin);
  const checkout = await resolveCheckoutRef(bareRepositoryPath, dependency, metadata, gitBin);

  if (await pathExists(worktreePath)) {
    const checkoutSha = await runGit(['-C', worktreePath, 'rev-parse', 'HEAD'], { gitBin });
    if (checkoutSha.stdout.trim() !== checkout.sha && !options.force) {
      throw new Error(
        `Worktree already exists at ${worktreePath} but is checked out at ${checkoutSha.stdout.trim()}`
      );
    }

    return {
      dependency,
      metadata,
      bareRepositoryPath,
      worktreePath,
      checkoutRef: checkout.ref,
      checkoutSha: checkoutSha.stdout.trim(),
      refSource: 'existing',
      reused: true
    };
  }

  await fs.mkdir(path.dirname(worktreePath), { recursive: true });
  await runGit(['-C', bareRepositoryPath, 'worktree', 'add', '--detach', worktreePath, checkout.ref], {
    gitBin
  });
  const checkoutSha = await runGit(['-C', worktreePath, 'rev-parse', 'HEAD'], { gitBin });

  return {
    dependency,
    metadata,
    bareRepositoryPath,
    worktreePath,
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
  dependency: DepCloneDependency,
  metadata: DependencyMetadata,
  gitBin: string
): Promise<{ ref: string; sha: string; source: GitWorktreeResult['refSource'] }> {
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
  if (process.env.DEPCLONE_STORE_DIR) {
    return process.env.DEPCLONE_STORE_DIR;
  }
  if (process.env.XDG_CACHE_HOME) {
    return path.join(process.env.XDG_CACHE_HOME, 'depclone', 'repositories');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Caches', 'depclone', 'repositories');
  }
  return path.join(os.homedir(), '.cache', 'depclone', 'repositories');
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
