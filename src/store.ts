import fs from 'node:fs/promises';
import path from 'node:path';

import { pathExists } from './fs-utils.ts';
import { BARE_DIR, CHECKOUT_DIR, defaultStoreDir, isCheckoutDirectoryName, runGit } from './git.ts';

export interface StoredRepository {
  /** `github.com/owner/repo`, the same shape that appears in every printed path. */
  name: string;
  bareRepositoryPath: string | null;
  bareBytes: number;
  checkouts: Array<{ path: string; commit: string; bytes: number; ageDays: number }>;
  checkoutBytes: number;
  totalBytes: number;
}

export interface StoreReport {
  storeDir: string;
  repositories: StoredRepository[];
  totalBytes: number;
  removed: string[];
  reclaimedBytes: number;
}

export interface StoreOptions {
  storeDir?: string;
  /** Delete checkouts older than `days`, then any repository left with none. */
  prune?: boolean;
  days?: number;
  now?: number;
}

const DEFAULT_PRUNE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export async function inspectStore(options: StoreOptions = {}): Promise<StoreReport> {
  const storeDir = options.storeDir ?? defaultStoreDir();
  const now = options.now ?? Date.now();
  const repositories = await collectRepositories(storeDir, now);
  const report: StoreReport = {
    storeDir,
    repositories,
    totalBytes: repositories.reduce((total, repository) => total + repository.totalBytes, 0),
    removed: [],
    reclaimedBytes: 0
  };

  if (!options.prune) return report;

  const maxAge = options.days ?? DEFAULT_PRUNE_DAYS;
  for (const repository of repositories) {
    const stale = repository.checkouts.filter((checkout) => checkout.ageDays >= maxAge);
    for (const checkout of stale) {
      await fs.rm(checkout.path, { recursive: true, force: true });
      report.removed.push(checkout.path);
      report.reclaimedBytes += checkout.bytes;
    }

    const remaining = repository.checkouts.length - stale.length;
    if (remaining === 0) {
      // Nothing is checked out from this mirror any more, and it is the expensive part.
      if (repository.bareRepositoryPath) {
        await fs.rm(repository.bareRepositoryPath, { recursive: true, force: true });
        report.removed.push(repository.bareRepositoryPath);
        report.reclaimedBytes += repository.bareBytes;
      }
    } else if (stale.length > 0 && repository.bareRepositoryPath) {
      await runGit(['-C', repository.bareRepositoryPath, 'worktree', 'prune'], { allowFailure: true });
    }
  }

  return report;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

async function collectRepositories(storeDir: string, now: number): Promise<StoredRepository[]> {
  const byName = new Map<string, StoredRepository>();
  const repositoryFor = (name: string): StoredRepository => {
    const existing = byName.get(name);
    if (existing) return existing;
    const created: StoredRepository = {
      name,
      bareRepositoryPath: null,
      bareBytes: 0,
      checkouts: [],
      checkoutBytes: 0,
      totalBytes: 0
    };
    byName.set(name, created);
    return created;
  };

  for (const bare of await findLeaves(path.join(storeDir, BARE_DIR), (entry) => entry.endsWith('.git'))) {
    const repository = repositoryFor(storeName(path.join(storeDir, BARE_DIR), bare).replace(/\.git$/, ''));
    repository.bareRepositoryPath = bare;
    repository.bareBytes = await directorySize(bare);
  }

  // A checkout is recognized by its commit-shaped name rather than by how deep it sits: a
  // remote whose path carries a subgroup nests one level further than github does, and
  // counting levels reported the repository directory itself as a single huge checkout.
  for (const checkout of await findLeaves(path.join(storeDir, CHECKOUT_DIR), isCheckoutDirectoryName)) {
    const relative = storeName(path.join(storeDir, CHECKOUT_DIR), checkout);
    const segments = relative.split(path.sep);
    const commit = segments.pop() ?? '';
    const repository = repositoryFor(segments.join('/'));
    const stat = await fs.stat(checkout).catch(() => null);
    repository.checkouts.push({
      path: checkout,
      commit,
      bytes: await directorySize(checkout),
      ageDays: stat ? Math.floor((now - stat.mtimeMs) / DAY_MS) : 0
    });
  }

  const repositories = [...byName.values()];
  for (const repository of repositories) {
    repository.checkoutBytes = repository.checkouts.reduce((total, checkout) => total + checkout.bytes, 0);
    repository.totalBytes = repository.bareBytes + repository.checkoutBytes;
    repository.checkouts.sort((a, b) => a.commit.localeCompare(b.commit));
  }

  return repositories.sort((a, b) => b.totalBytes - a.totalBytes || a.name.localeCompare(b.name));
}

/**
 * Walks to the directories a predicate calls leaves, so the store layout is read without
 * assuming how deeply nested an owner or host path is. A leaf is never descended into, so
 * a checkout's own contents can never be mistaken for more of the store.
 */
async function findLeaves(root: string, isLeaf: (name: string) => boolean): Promise<string[]> {
  if (!(await pathExists(root))) return [];

  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  const found: string[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const full = path.join(root, entry.name);
    if (isLeaf(entry.name)) {
      found.push(full);
    } else {
      found.push(...(await findLeaves(full, isLeaf)));
    }
  }

  return found;
}

function storeName(root: string, target: string): string {
  return path.relative(root, target);
}

async function directorySize(directory: string): Promise<number> {
  let total = 0;

  const walk = async (current: string): Promise<void> => {
    const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        const stat = await fs.stat(full).catch(() => null);
        if (stat) total += stat.size;
      }
    }
  };

  await walk(directory);
  return total;
}
