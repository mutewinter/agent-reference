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

const SCHEMA_VERSION = 5;

export const MANIFEST_FILE = 'agent-reference.lock.json';

/**
 * One entry per reference name, so upgrading a package replaces its entry rather than
 * accumulating versions. Worktrees are shared across projects and keyed by commit, so
 * nothing on disk needs cleaning up when an entry is replaced.
 */
export async function writeManifest(
  projectRoot: string,
  packageResults: GitWorktreeResult[],
  gitResults: GitReferenceWorktreeResult[] = [],
  unresolved: UnresolvedManifestReference[] = []
): Promise<string> {
  const existing = (await readManifest(projectRoot))?.manifest;
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
    // The lockfile is committed: keep ordering deterministic so diffs stay minimal.
    references: [...byKey.values()].sort((a, b) => referenceKey(a).localeCompare(referenceKey(b)))
  };

  const mergedUnresolved = mergeUnresolved(existing?.unresolved ?? [], unresolved, manifest.references);
  if (mergedUnresolved.length > 0) manifest.unresolved = mergedUnresolved;

  const manifestPath = path.join(projectRoot, MANIFEST_FILE);
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifestPath;
}

export async function readManifest(
  projectRoot: string
): Promise<{ path: string; manifest: AgentReferenceManifest } | null> {
  const manifestPath = path.join(projectRoot, MANIFEST_FILE);
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
