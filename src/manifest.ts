import fs from 'node:fs/promises';
import path from 'node:path';

import { readJsonFile } from './fs-utils.ts';
import type {
  AgentReferenceManifest,
  AgentReferenceManifestReference,
  GitReferenceWorktreeResult,
  GitWorktreeResult
} from './types.ts';

const SCHEMA_VERSION = 2;

export async function writeManifest(
  projectRoot: string,
  packageResults: GitWorktreeResult[],
  gitResults: GitReferenceWorktreeResult[] = []
): Promise<string> {
  const referenceDir = path.join(projectRoot, '.agent-reference');
  await fs.mkdir(referenceDir, { recursive: true });
  const existingReferences = (await readManifest(projectRoot))?.manifest.references ?? [];
  const updatedReferences = mergeManifestReferences(existingReferences, [
    ...packageResults.map(packageResultToManifestReference),
    ...gitResults.map(gitResultToManifestReference)
  ]);

  const manifest: AgentReferenceManifest = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    projectRoot,
    references: updatedReferences
  };

  const manifestPath = path.join(referenceDir, 'manifest.json');
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifestPath;
}

export async function readManifest(projectRoot: string): Promise<{ path: string; manifest: AgentReferenceManifest } | null> {
  const manifestPath = path.join(projectRoot, '.agent-reference', 'manifest.json');
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
    bareRepositoryPath: result.bareRepositoryPath,
    path: result.worktreePath,
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
    bareRepositoryPath: result.bareRepositoryPath,
    path: result.worktreePath,
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
  return [...byKey.values()];
}

function manifestReferenceKey(reference: AgentReferenceManifestReference): string {
  if (reference.kind === 'package') {
    return `package:${reference.name}@${reference.version}`;
  }
  return `git:${reference.name}`;
}

export async function writeAgentFiles(projectRoot: string): Promise<string> {
  const referenceDir = path.join(projectRoot, '.agent-reference');
  await fs.mkdir(referenceDir, { recursive: true });

  const guidePath = path.join(referenceDir, 'README.md');
  await fs.writeFile(
    guidePath,
    [
      '# Agent Reference Notes',
      '',
      'Run `agent-reference status` from the project root to locate reference paths and check for stale versions.',
      'Read `manifest.json` for the last materialized package and git references.',
      'Prefer status output paths over `node_modules` when inspecting reference source.',
      ''
    ].join('\n')
  );

  return guidePath;
}
