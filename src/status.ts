import os from 'node:os';
import path from 'node:path';

import { pathExists } from './fs-utils.ts';
import { readManifest } from './manifest.ts';
import { loadReferenceContext } from './reference-context.ts';
import type {
  AgentReferenceStatusEntry,
  AgentReferenceStatusReport,
  AgentReferenceStatusState,
  GitManifestReference,
  PackageManifestReference,
  PackageReference,
  ScanProjectOptions
} from './types.ts';

const READY_ACTION = 'Use path for source inspection.';
const CLONE_ACTION = 'Run agent-reference clone --non-interactive to refresh local references.';

export async function getStatusReport(
  projectPath: string | null | undefined,
  options: ScanProjectOptions & { configFile?: string | null } = {}
): Promise<AgentReferenceStatusReport> {
  const { config, configPackages, loadedConfig, packageUniverse, project } = await loadReferenceContext(
    projectPath,
    options
  );
  const loadedManifest = await readManifest(project.projectRoot);

  const packageManifestByExact = new Map<string, PackageManifestReference>();
  const packageManifestByName = new Map<string, PackageManifestReference>();
  const gitManifestByName = new Map<string, GitManifestReference>();
  for (const reference of loadedManifest?.manifest.references ?? []) {
    if (reference.kind === 'package') {
      packageManifestByExact.set(`${reference.name}@${reference.version}`, reference);
      packageManifestByName.set(reference.name, reference);
    } else {
      gitManifestByName.set(reference.name, reference);
    }
  }

  const hasConfig = Boolean(config);
  const selectedPackages = hasConfig && !config?.allPackages ? configPackages.packages : packageUniverse;
  const entries: AgentReferenceStatusEntry[] = [];

  for (const dependency of selectedPackages) {
    entries.push(
      await buildPackageStatus(
        dependency,
        packageManifestByExact.get(`${dependency.name}@${dependency.version}`) ?? null,
        packageManifestByName.get(dependency.name) ?? null,
        hasConfig
      )
    );
  }

  for (const name of configPackages.missingInstalled) {
    const manifestEntry = packageManifestByName.get(name);
    entries.push({
      kind: 'package',
      name,
      requested: 'installed',
      packageManager: null,
      currentVersion: null,
      clonedVersion: manifestEntry?.version ?? null,
      path: manifestEntry?.path ?? null,
      checkoutSha: manifestEntry?.checkoutSha ?? null,
      status: 'not-installed',
      action: 'Install this package or update agent-reference.json. Do not use an old clone as current project source.'
    });
  }

  for (const [name, folderPath] of Object.entries(config?.folders ?? {})) {
    entries.push(await buildFolderStatus(project.projectRoot, name, folderPath));
  }

  for (const [name, requested] of Object.entries(config?.git ?? {})) {
    entries.push(await buildGitStatus(name, requested, gitManifestByName.get(name) ?? null));
  }

  return {
    generatedAt: new Date().toISOString(),
    projectRoot: project.projectRoot,
    configPath: loadedConfig?.path ?? null,
    localConfigPath: loadedConfig?.localPath ?? null,
    manifestPath: loadedManifest?.path ?? null,
    references: entries,
    summary: summarizeStatus(entries)
  };
}

async function buildPackageStatus(
  dependency: PackageReference,
  exactManifest: PackageManifestReference | null,
  nearestManifest: PackageManifestReference | null,
  configured: boolean
): Promise<AgentReferenceStatusEntry> {
  const manifestEntry = exactManifest ?? nearestManifest;
  const referencePath = manifestEntry?.path ?? null;
  const status = getPackageStatusState(
    dependency,
    exactManifest,
    nearestManifest,
    referencePath ? await pathExists(referencePath) : false,
    configured
  );

  return {
    kind: 'package',
    name: dependency.name,
    requested: dependency.specifier,
    packageManager: dependency.packageManager,
    currentVersion: dependency.version,
    clonedVersion: manifestEntry?.version ?? null,
    path: referencePath,
    checkoutSha: manifestEntry?.checkoutSha ?? null,
    status,
    action: actionForPackageStatus(status)
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
    currentVersion: null,
    clonedVersion: null,
    path: resolvedPath,
    checkoutSha: null,
    status: ready ? 'ready' : 'missing',
    action: ready ? READY_ACTION : 'Create or correct this folder reference path.'
  };
}

async function buildGitStatus(
  name: string,
  requested: string,
  manifestEntry: GitManifestReference | null
): Promise<AgentReferenceStatusEntry> {
  const referencePath = manifestEntry?.path ?? null;
  const ready = referencePath ? await pathExists(referencePath) : false;
  const status = getGitStatusState(requested, manifestEntry, ready);

  return {
    kind: 'git',
    name,
    requested,
    packageManager: null,
    currentVersion: null,
    clonedVersion: null,
    path: referencePath,
    checkoutSha: manifestEntry?.checkoutSha ?? null,
    status,
    action: status === 'ready'
      ? READY_ACTION
      : 'Run agent-reference clone --non-interactive to materialize this git reference.'
  };
}

function getPackageStatusState(
  dependency: PackageReference,
  exactManifest: PackageManifestReference | null,
  nearestManifest: PackageManifestReference | null,
  pathExistsNow: boolean,
  configured: boolean
): AgentReferenceStatusState {
  if (!exactManifest && nearestManifest && nearestManifest.version !== dependency.version) return 'stale';
  if (!exactManifest) return configured ? 'missing' : 'unconfigured';
  if (!pathExistsNow) return 'missing-worktree';
  return 'ready';
}

function getGitStatusState(
  requested: string,
  manifestEntry: GitManifestReference | null,
  pathExistsNow: boolean
): AgentReferenceStatusState {
  if (!manifestEntry) return 'missing';
  if (manifestEntry.requested !== requested) return 'stale';
  if (!pathExistsNow) return 'missing-worktree';
  return 'ready';
}

function actionForPackageStatus(status: AgentReferenceStatusState): string {
  if (status === 'ready') return READY_ACTION;
  if (status === 'unconfigured') return 'Add this package to agent-reference.json if agents should inspect it.';
  return CLONE_ACTION;
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
