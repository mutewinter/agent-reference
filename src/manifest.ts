import fs from 'node:fs/promises';
import path from 'node:path';

import { readJsonFile } from './fs-utils.ts';
import type {
  AgentReferenceManifest,
  AgentReferenceManifestReference,
  GitReferenceWorktreeResult,
  GitWorktreeResult
} from './types.ts';

const SCHEMA_VERSION = 3;

export interface ManifestUpdateResult {
  manifestPath: string;
  superseded: AgentReferenceManifestReference[];
}

export const MANIFEST_FILE = 'agent-reference.lock.json';

export async function writeManifest(
  projectRoot: string,
  packageResults: GitWorktreeResult[],
  gitResults: GitReferenceWorktreeResult[] = []
): Promise<ManifestUpdateResult> {
  const existingReferences = (await readManifest(projectRoot))?.manifest.references ?? [];
  const updates = [
    ...packageResults.map(packageResultToManifestReference),
    ...gitResults.map(gitResultToManifestReference)
  ];
  const superseded = existingReferences.filter((reference) => isSuperseded(reference, updates));
  const kept = existingReferences.filter((reference) => !isSuperseded(reference, updates));

  const manifest: AgentReferenceManifest = {
    schemaVersion: SCHEMA_VERSION,
    references: mergeManifestReferences(kept, updates)
  };

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
    refSource: result.refSource
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

