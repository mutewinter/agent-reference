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

export interface ManifestUpdateResult {
  manifestPath: string;
  superseded: AgentReferenceManifestReference[];
}

export const MANIFEST_FILE = 'agent-reference.lock.json';

export async function writeManifest(
  projectRoot: string,
  packageResults: GitWorktreeResult[],
  gitResults: GitReferenceWorktreeResult[] = [],
  unresolved: UnresolvedManifestReference[] = []
): Promise<ManifestUpdateResult> {
  const existing = (await readManifest(projectRoot))?.manifest;
  const existingReferences = existing?.references ?? [];
  const updates = [
    ...packageResults.map(packageResultToManifestReference),
    ...gitResults.map(gitResultToManifestReference)
  ];
  const superseded = existingReferences.filter((reference) => isSuperseded(reference, updates));
  const kept = existingReferences.filter((reference) => !isSuperseded(reference, updates));
  const references = mergeManifestReferences(kept, updates);

  const manifest: AgentReferenceManifest = {
    schemaVersion: SCHEMA_VERSION,
    references
  };

  const mergedUnresolved = mergeUnresolved(existing?.unresolved ?? [], unresolved, references);
  if (mergedUnresolved.length > 0) manifest.unresolved = mergedUnresolved;

  const manifestPath = path.join(projectRoot, MANIFEST_FILE);
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return { manifestPath, superseded };
}

function isSuperseded(
  existing: AgentReferenceManifestReference,
  updates: AgentReferenceManifestReference[]
): boolean {
  const sameReference = updates.filter((update) => update.kind === existing.kind && update.name === existing.name);
  return sameReference.length > 0 && sameReference.every((update) => manifestReferenceIdentity(update) !== manifestReferenceIdentity(existing));
}

function manifestReferenceIdentity(reference: AgentReferenceManifestReference): string {
  if (reference.kind === 'package') {
    return `package:${reference.name}@${reference.version}`;
  }
  return `git:${reference.name}@${reference.checkoutSha}`;
}

export async function readManifest(projectRoot: string): Promise<{ path: string; manifest: AgentReferenceManifest } | null> {
  const manifestPath = path.join(projectRoot, MANIFEST_FILE);
  try {
    const manifest = await readJsonFile<AgentReferenceManifest>(manifestPath);
    if (manifest.schemaVersion !== SCHEMA_VERSION) return null;
    return { path: manifestPath, manifest };
  } catch {
    return null;
  }
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

  const merged = [
    ...existing.filter((entry) => !updatedNames.has(entry.name) && !resolvedNames.has(entry.name)),
    ...updates.filter((entry) => !resolvedNames.has(entry.name))
  ];

  return merged.sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`));
}

function mergeManifestReferences(
  existing: AgentReferenceManifestReference[],
  updates: AgentReferenceManifestReference[]
): AgentReferenceManifestReference[] {
  const byKey = new Map(existing.map((reference) => [manifestReferenceKey(reference), reference]));
  for (const reference of updates) {
    byKey.set(manifestReferenceKey(reference), reference);
  }
  // The lockfile is committed: keep ordering deterministic so diffs stay minimal.
  return [...byKey.values()].sort((a, b) => manifestReferenceKey(a).localeCompare(manifestReferenceKey(b)));
}

function manifestReferenceKey(reference: AgentReferenceManifestReference): string {
  if (reference.kind === 'package') {
    return `package:${reference.name}@${reference.version}`;
  }
  return `git:${reference.name}`;
}
