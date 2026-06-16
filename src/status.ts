import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { resolveConfigPackageReferences } from './config-dependencies.ts';
import { loadAgentReferenceConfig } from './config.ts';
import { readManifest } from './manifest.ts';
import { dependencyKey, mergeDependencyEntries } from './package-utils.ts';
import { resolveProjectInput, scanResolvedProject } from './scanner.ts';
import type {
  AgentReferenceManifest,
  AgentReferenceStatusEntry,
  AgentReferenceStatusReport,
  AgentReferenceStatusState,
  PackageReference,
  ScanProjectOptions
} from './types.ts';

export async function getStatusReport(
  projectPath: string | null | undefined,
  options: ScanProjectOptions & { cwd?: string; configFile?: string | null } = {}
): Promise<AgentReferenceStatusReport> {
  const cwd = options.cwd ?? process.cwd();
  const context = await resolveProjectInput(projectPath, cwd);
  const loadedConfig = await loadAgentReferenceConfig(context.projectRoot, {
    configFile: options.configFile
  });
  const config = loadedConfig?.config;
  const installedPackages = await scanResolvedProject(context, {
    ...options,
    allImporters: options.allImporters || config?.allImporters
  });
  const configPackages = await resolveConfigPackageReferences(config, context, installedPackages, {
    registry: config?.registry,
    configPath: loadedConfig?.path ?? undefined
  });
  const packageUniverse = mergeDependencyEntries([...installedPackages, ...configPackages.packages]);
  const loadedManifest = await readManifest(context.projectRoot);
  const manifestReferences = loadedManifest?.manifest.references ?? [];
  const packageManifestByExact = new Map(
    manifestReferences
      .filter((entry) => entry.kind === 'package' && entry.version)
      .map((entry) => [dependencyKey(entry.name, entry.version ?? ''), entry])
  );
  const packageManifestByName = new Map<string, AgentReferenceManifest['references'][number]>();
  const gitManifestByName = new Map<string, AgentReferenceManifest['references'][number]>();

  for (const entry of manifestReferences) {
    if (entry.kind === 'package') packageManifestByName.set(entry.name, entry);
    if (entry.kind === 'git') gitManifestByName.set(entry.name, entry);
  }

  const entries: AgentReferenceStatusEntry[] = [];
  const selectedPackages = selectStatusPackages(packageUniverse, configPackages.packages, Boolean(config?.allPackages), Boolean(config));

  for (const dependency of selectedPackages) {
    const exactManifest = packageManifestByExact.get(dependencyKey(dependency.name, dependency.version));
    const nearestManifest = packageManifestByName.get(dependency.name);
    entries.push(await buildPackageStatus(dependency, exactManifest ?? null, nearestManifest ?? null, Boolean(config)));
  }

  for (const name of configPackages.missingInstalled) {
    const manifestEntry = packageManifestByName.get(name);
    entries.push({
      kind: 'package',
      name,
      requested: 'installed',
      packageManager: null,
      configured: true,
      currentVersion: null,
      clonedVersion: manifestEntry?.version ?? null,
      dependencyTypes: [],
      importers: [],
      path: manifestEntry?.path ?? null,
      checkoutSha: manifestEntry?.checkoutSha ?? null,
      status: 'not-installed',
      action: 'Install this package or update agent-reference.json. Do not use an old clone as current project source.'
    });
  }

  for (const [name, folderPath] of Object.entries(config?.folders ?? {})) {
    entries.push(await buildFolderStatus(context.projectRoot, name, folderPath));
  }

  for (const [name, requested] of Object.entries(config?.git ?? {})) {
    const manifestEntry = gitManifestByName.get(name);
    entries.push(await buildGitStatus(name, requested, manifestEntry ?? null));
  }

  return {
    generatedAt: new Date().toISOString(),
    projectRoot: context.projectRoot,
    configPath: loadedConfig?.path ?? null,
    localConfigPath: loadedConfig?.localPath ?? null,
    manifestPath: loadedManifest?.path ?? null,
    references: entries,
    summary: summarizeStatus(entries)
  };
}

function selectStatusPackages(
  packageUniverse: PackageReference[],
  configPackages: PackageReference[],
  allPackages: boolean,
  hasConfig: boolean
): PackageReference[] {
  if (allPackages) return packageUniverse;
  if (hasConfig) return configPackages;
  return packageUniverse;
}

async function buildPackageStatus(
  dependency: PackageReference,
  exactManifest: AgentReferenceManifest['references'][number] | null,
  nearestManifest: AgentReferenceManifest['references'][number] | null,
  hasConfig: boolean
): Promise<AgentReferenceStatusEntry> {
  const manifestEntry = exactManifest ?? nearestManifest;
  const clonedVersion = manifestEntry?.version ?? null;
  const referencePath = manifestEntry?.path ?? null;
  const pathExistsNow = referencePath ? await pathExists(referencePath) : false;
  const status = getPackageStatusState(dependency, exactManifest, nearestManifest, pathExistsNow, hasConfig);

  return {
    kind: 'package',
    name: dependency.name,
    requested: dependency.specifier,
    packageManager: dependency.packageManager,
    configured: hasConfig,
    currentVersion: dependency.version,
    clonedVersion,
    dependencyTypes: dependency.dependencyTypes,
    importers: dependency.importers,
    path: referencePath,
    checkoutSha: manifestEntry?.checkoutSha ?? null,
    status,
    action: actionForStatus(status)
  };
}

async function buildFolderStatus(projectRoot: string, name: string, requested: string): Promise<AgentReferenceStatusEntry> {
  const resolvedPath = resolveReferencePath(projectRoot, requested);
  const ready = await pathExists(resolvedPath);

  return {
    kind: 'folder',
    name,
    requested,
    packageManager: null,
    configured: true,
    currentVersion: null,
    clonedVersion: null,
    dependencyTypes: [],
    importers: [],
    path: resolvedPath,
    checkoutSha: null,
    status: ready ? 'ready' : 'missing',
    action: ready ? 'Use path for source inspection.' : 'Create or correct this folder reference path.'
  };
}

async function buildGitStatus(
  name: string,
  requested: string,
  manifestEntry: AgentReferenceManifest['references'][number] | null
): Promise<AgentReferenceStatusEntry> {
  const referencePath = manifestEntry?.path ?? null;
  const ready = referencePath ? await pathExists(referencePath) : false;

  return {
    kind: 'git',
    name,
    requested,
    packageManager: null,
    configured: true,
    currentVersion: null,
    clonedVersion: null,
    dependencyTypes: [],
    importers: [],
    path: referencePath,
    checkoutSha: manifestEntry?.checkoutSha ?? null,
    status: ready ? 'ready' : manifestEntry ? 'missing-worktree' : 'missing',
    action: ready ? 'Use path for source inspection.' : 'Run agent-reference clone --non-interactive to materialize this git reference.'
  };
}

function getPackageStatusState(
  dependency: PackageReference,
  exactManifest: AgentReferenceManifest['references'][number] | null,
  nearestManifest: AgentReferenceManifest['references'][number] | null,
  pathExistsNow: boolean,
  configured: boolean
): AgentReferenceStatusState {
  if (!exactManifest && nearestManifest && nearestManifest.version !== dependency.version) return 'stale';
  if (!exactManifest) return configured ? 'missing' : 'unconfigured';
  if (!pathExistsNow) return 'missing-worktree';
  return 'ready';
}

function actionForStatus(status: AgentReferenceStatusState): string {
  if (status === 'ready') return 'Use path for source inspection.';
  if (status === 'unconfigured') return 'Add this package to agent-reference.json if agents should inspect it.';
  return 'Run agent-reference clone --non-interactive to refresh local references.';
}

function summarizeStatus(entries: AgentReferenceStatusEntry[]): Record<AgentReferenceStatusState, number> {
  const summary: Record<AgentReferenceStatusState, number> = {
    ready: 0,
    missing: 0,
    'missing-worktree': 0,
    stale: 0,
    'not-installed': 0,
    unconfigured: 0
  };

  for (const entry of entries) {
    summary[entry.status] += 1;
  }

  return summary;
}

function resolveReferencePath(projectRoot: string, requested: string): string {
  if (requested.startsWith('~/')) {
    return path.join(os.homedir(), requested.slice(2));
  }
  if (path.isAbsolute(requested)) return requested;
  return path.resolve(projectRoot, requested);
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
