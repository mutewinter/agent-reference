import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { readJsonFile } from './fs-utils.ts';
import type {
  AgentReferenceManifest,
  AgentReferenceManifestReference,
  GitReferenceWorktreeResult,
  GitWorktreeResult,
  UnresolvedManifestReference
} from './types.ts';

const SCHEMA_VERSION = 6;

const STATE_DIR = 'state';

/**
 * Materialization state lives in the store, not the project: it is a machine-local cache of
 * what has been resolved and checked out, so the config is the only file a project commits.
 * Keyed by project root so every project on this machine gets its own file.
 */
export function stateFilePath(storeDir: string, projectRoot: string): string {
  const hash = crypto.createHash('sha256').update(projectRoot).digest('hex').slice(0, 10);
  const slug =
    path
      .basename(projectRoot)
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'project';
  return path.join(storeDir, STATE_DIR, `${slug}-${hash}.json`);
}

/**
 * One entry per reference name, so upgrading a package replaces its entry rather than
 * accumulating versions. Worktrees are shared across projects and keyed by commit, so
 * nothing on disk needs cleaning up when an entry is replaced.
 */
export async function writeManifest(
  projectRoot: string,
  storeDir: string,
  packageResults: GitWorktreeResult[],
  gitResults: GitReferenceWorktreeResult[] = [],
  unresolved: UnresolvedManifestReference[] = []
): Promise<string> {
  const existing = (await readManifest(projectRoot, storeDir))?.manifest;
  const updates = [
    ...packageResults.map(packageResultToManifestReference),
    ...gitResults.map(gitResultToManifestReference)
  ];

  const byKey = new Map((existing?.references ?? []).map((reference) => [referenceKey(reference), reference]));
  for (const reference of updates) {
    byKey.set(referenceKey(reference), reference);
  }

  const manifest: AgentReferenceManifest = {
    schemaVersion: SCHEMA_VERSION,
    projectRoot,
    references: [...byKey.values()].sort((a, b) => referenceKey(a).localeCompare(referenceKey(b)))
  };

  const mergedUnresolved = mergeUnresolved(existing?.unresolved ?? [], unresolved, manifest.references);
  if (mergedUnresolved.length > 0) manifest.unresolved = mergedUnresolved;

  const manifestPath = stateFilePath(storeDir, projectRoot);
  await fs.mkdir(path.dirname(manifestPath), { recursive: true });
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifestPath;
}

export async function readManifest(
  projectRoot: string,
  storeDir: string
): Promise<{ path: string; manifest: AgentReferenceManifest } | null> {
  const manifestPath = stateFilePath(storeDir, projectRoot);
  try {
    const manifest = await readJsonFile<AgentReferenceManifest>(manifestPath);
    if (manifest.schemaVersion !== SCHEMA_VERSION) return null;
    return { path: manifestPath, manifest };
  } catch {
    return null;
  }
}

function referenceKey(reference: AgentReferenceManifestReference): string {
  return `${reference.kind}:${reference.name}`;
}

function packageResultToManifestReference(result: GitWorktreeResult): AgentReferenceManifestReference {
  if (!result.metadata.repositoryUrl) {
    throw new Error(`Cannot write manifest entry for ${result.dependency.name}@${result.dependency.version} without a repository URL.`);
  }

  return {
    kind: 'package',
    name: result.dependency.name,
    version: result.dependency.version,
    packageManager: result.dependency.packageManager,
    repositoryUrl: result.metadata.repositoryUrl,
    repositoryDirectory: result.metadata.repositoryDirectory,
    gitHead: result.metadata.gitHead,
    checkoutRef: result.checkoutRef,
    checkoutSha: result.checkoutSha,
    refSource: result.refSource,
    confidence: result.confidence,
    pinnedRef: result.pinnedRef
  };
}

function gitResultToManifestReference(result: GitReferenceWorktreeResult): AgentReferenceManifestReference {
  return {
    kind: 'git',
    name: result.name,
    requested: result.requested,
    repositoryUrl: result.repositoryUrl,
    checkoutRef: result.checkoutRef,
    checkoutSha: result.checkoutSha,
    refSource: result.refSource
  };
}

/**
 * Failures survive between runs so `status` can explain them without redoing the network
 * work, but they are dropped as soon as the same package resolves.
 */
function mergeUnresolved(
  existing: UnresolvedManifestReference[],
  updates: UnresolvedManifestReference[],
  references: AgentReferenceManifestReference[]
): UnresolvedManifestReference[] {
  const resolvedNames = new Set(
    references.filter((reference) => reference.kind === 'package').map((reference) => reference.name)
  );
  const updatedNames = new Set(updates.map((entry) => entry.name));

  return [
    ...existing.filter((entry) => !updatedNames.has(entry.name) && !resolvedNames.has(entry.name)),
    ...updates.filter((entry) => !resolvedNames.has(entry.name))
  ].sort((a, b) => a.name.localeCompare(b.name));
}
