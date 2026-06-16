import fs from 'node:fs/promises';
import path from 'node:path';

import type { AgentReferenceManifest, GitReferenceWorktreeResult, GitWorktreeResult } from './types.ts';

type ManifestReference = AgentReferenceManifest['references'][number];

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
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    projectRoot,
    references: updatedReferences
  };

  const manifestPath = path.join(referenceDir, 'manifest.json');
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifestPath;
}

function packageResultToManifestReference(result: GitWorktreeResult): ManifestReference {
  if (!result.metadata.repositoryUrl) {
    throw new Error(`Cannot write manifest entry for ${result.dependency.name}@${result.dependency.version} without a repository URL.`);
  }

  return {
    kind: 'package',
    name: result.dependency.name,
    requested: result.dependency.specifier,
    version: result.dependency.version,
    packageManager: result.dependency.packageManager,
    importers: result.dependency.importers,
    dependencyTypes: result.dependency.dependencyTypes,
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

function gitResultToManifestReference(result: GitReferenceWorktreeResult): ManifestReference {
  return {
    kind: 'git',
    name: result.name,
    requested: result.requested,
    version: null,
    packageManager: null,
    importers: [],
    dependencyTypes: [],
    repositoryUrl: result.repositoryUrl,
    repositoryDirectory: null,
    gitHead: null,
    bareRepositoryPath: result.bareRepositoryPath,
    path: result.worktreePath,
    checkoutRef: result.checkoutRef,
    checkoutSha: result.checkoutSha,
    refSource: result.refSource
  };
}

function mergeManifestReferences(existing: ManifestReference[], updates: ManifestReference[]): ManifestReference[] {
  const byKey = new Map(existing.map((reference) => [manifestReferenceKey(reference), reference]));
  for (const reference of updates) {
    byKey.set(manifestReferenceKey(reference), reference);
  }
  return [...byKey.values()];
}

function manifestReferenceKey(reference: ManifestReference): string {
  if (reference.kind === 'package') {
    return `${reference.kind}:${reference.name}@${reference.version ?? ''}`;
  }
  return `${reference.kind}:${reference.name}`;
}

export async function readManifest(projectRoot: string): Promise<{ path: string; manifest: AgentReferenceManifest } | null> {
  const manifestPath = path.join(projectRoot, '.agent-reference', 'manifest.json');
  try {
    const raw = await fs.readFile(manifestPath, 'utf8');
    return {
      path: manifestPath,
      manifest: JSON.parse(raw) as AgentReferenceManifest
    };
  } catch {
    return null;
  }
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
