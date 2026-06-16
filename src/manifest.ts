import fs from 'node:fs/promises';
import path from 'node:path';

import type { AgentReferenceManifest, GitReferenceWorktreeResult, GitWorktreeResult } from './types.ts';

export async function writeManifest(
  projectRoot: string,
  packageResults: GitWorktreeResult[],
  gitResults: GitReferenceWorktreeResult[] = []
): Promise<string> {
  const referenceDir = path.join(projectRoot, '.agent-reference');
  await fs.mkdir(referenceDir, { recursive: true });

  const manifest: AgentReferenceManifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    projectRoot,
    references: [
      ...packageResults.map((result) => ({
        kind: 'package' as const,
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
      })),
      ...gitResults.map((result) => ({
        kind: 'git' as const,
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
      }))
    ]
  };

  const manifestPath = path.join(referenceDir, 'manifest.json');
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifestPath;
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
