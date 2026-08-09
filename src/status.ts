import os from 'node:os';
import path from 'node:path';

import { pathExists, resolveConfigPath } from './fs-utils.ts';
import { defaultStoreDir, manifestReferencePath, resolvePackagePath } from './git.ts';
import { groupMemberKey, resolveReferenceGroups, selectionFilter } from './groups.ts';
import { readManifest } from './manifest.ts';
import { loadReferenceContext } from './reference-context.ts';
import type {
  AgentReferenceConfig,
  AgentReferenceStatusEntry,
  AgentReferenceStatusReport,
  AgentReferenceStatusState,
  ConfiguredFolderReference,
  ConfiguredGitReference,
  GitManifestReference,
  PackageManifestReference,
  PackageReference,
  ReferenceSelectionOptions,
  ScanProjectOptions
} from './types.ts';

const READY_ACTION = 'Use path for source inspection.';
const CLONE_ACTION = 'Run agent-reference clone --non-interactive to refresh local references.';

export type StatusReportOptions = ScanProjectOptions &
  ReferenceSelectionOptions & {
    configFile?: string | null;
    storeDir?: string;
    worktreeRoot?: string;
  };

export async function getStatusReport(
  projectPath: string | null | undefined,
  options: StatusReportOptions = {}
): Promise<AgentReferenceStatusReport> {
  const { config, configPackages, cwd, loadedConfig, packageUniverse, project } = await loadReferenceContext(
    projectPath,
    options
  );
  const loadedManifest = await readManifest(project.projectRoot);
  const configuredStore = options.storeDir ?? config?.cacheDir;
  const storeDir = configuredStore
    ? resolveConfigPath(project.projectRoot, cwd, configuredStore)
    : defaultStoreDir();
  const configuredWorktreeRoot = options.worktreeRoot ?? config?.worktreeDir;
  const worktreeRoot = configuredWorktreeRoot
    ? resolveConfigPath(project.projectRoot, cwd, configuredWorktreeRoot)
    : undefined;
  const referencePathFor = (reference: PackageManifestReference | GitManifestReference): string =>
    manifestReferencePath(storeDir, worktreeRoot, reference);

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

  const annotations = referenceAnnotations(config);
  const hasConfig = Boolean(config);
  const selectedPackages = hasConfig && !config?.allPackages ? configPackages.packages : packageUniverse;
  const entries: AgentReferenceStatusEntry[] = [];

  for (const dependency of selectedPackages) {
    entries.push(
      await buildPackageStatus(
        dependency,
        packageManifestByExact.get(`${dependency.name}@${dependency.version}`) ?? null,
        packageManifestByName.get(dependency.name) ?? null,
        hasConfig,
        referencePathFor,
        annotations.get(`package:${dependency.name}`)
      )
    );
  }

  for (const name of configPackages.missingInstalled) {
    const manifestEntry = packageManifestByName.get(name);
    const worktreePath = manifestEntry ? referencePathFor(manifestEntry) : null;
    entries.push({
      kind: 'package',
      name,
      ...(annotations.get(`package:${name}`) ?? { description: null, groups: [] }),
      requested: 'installed',
      packageManager: null,
      currentVersion: null,
      clonedVersion: manifestEntry?.version ?? null,
      path: worktreePath && manifestEntry
        ? await resolvePackagePath(worktreePath, manifestEntry.repositoryDirectory)
        : null,
      repositoryPath: worktreePath,
      checkoutSha: manifestEntry?.checkoutSha ?? null,
      confidence: manifestEntry?.confidence ?? null,
      status: 'not-installed',
      action: 'Install this package or update agent-reference.json. Do not use an old clone as current project source.'
    });
  }

  for (const folder of config?.folders ?? []) {
    entries.push(await buildFolderStatus(project.projectRoot, folder, annotations.get(`folder:${folder.name}`)));
  }

  for (const reference of config?.git ?? []) {
    entries.push(
      await buildGitStatus(
        reference,
        gitManifestByName.get(reference.name) ?? null,
        referencePathFor,
        annotations.get(`git:${reference.name}`)
      )
    );
  }

  const filter = selectionFilter(config, options);
  const references = filter ? entries.filter((entry) => filter(entry.kind, entry.name)) : entries;

  return {
    generatedAt: new Date().toISOString(),
    projectRoot: project.projectRoot,
    configPath: loadedConfig?.path ?? null,
    localConfigPath: loadedConfig?.localPath ?? null,
    manifestPath: loadedManifest?.path ?? null,
    groups: resolveReferenceGroups(config).map((group) => ({
      name: group.name,
      description: group.description,
      references: group.members.map(groupMemberKey)
    })),
    references,
    summary: summarizeStatus(references)
  };
}

interface ReferenceAnnotation {
  description: string | null;
  groups: string[];
}

function referenceAnnotations(config: AgentReferenceConfig | undefined): Map<string, ReferenceAnnotation> {
  const groupsByReference = new Map<string, ReferenceAnnotation>();
  if (!config) return groupsByReference;

  for (const group of resolveReferenceGroups(config)) {
    for (const member of group.members) {
      const key = groupMemberKey(member);
      const existing = groupsByReference.get(key);
      if (existing) {
        existing.groups.push(group.name);
      } else {
        groupsByReference.set(key, { description: null, groups: [group.name] });
      }
    }
  }

  for (const reference of [...config.packages, ...config.folders, ...config.git]) {
    const key = `${reference.kind}:${reference.name}`;
    const existing = groupsByReference.get(key);
    if (existing) {
      existing.description = reference.description;
    } else {
      groupsByReference.set(key, { description: reference.description, groups: [] });
    }
  }

  return groupsByReference;
}

async function buildPackageStatus(
  dependency: PackageReference,
  exactManifest: PackageManifestReference | null,
  nearestManifest: PackageManifestReference | null,
  configured: boolean,
  referencePathFor: (reference: PackageManifestReference | GitManifestReference) => string,
  annotation: ReferenceAnnotation | undefined
): Promise<AgentReferenceStatusEntry> {
  const manifestEntry = exactManifest ?? nearestManifest;
  const worktreePath = manifestEntry ? referencePathFor(manifestEntry) : null;
  const status = getPackageStatusState(
    dependency,
    exactManifest,
    nearestManifest,
    worktreePath ? await pathExists(worktreePath) : false,
    configured
  );

  return {
    kind: 'package',
    name: dependency.name,
    description: annotation?.description ?? null,
    groups: annotation?.groups ?? [],
    requested: dependency.specifier,
    packageManager: dependency.packageManager,
    currentVersion: dependency.version,
    clonedVersion: manifestEntry?.version ?? null,
    path: worktreePath && manifestEntry
      ? await resolvePackagePath(worktreePath, manifestEntry.repositoryDirectory)
      : null,
    repositoryPath: worktreePath,
    checkoutSha: manifestEntry?.checkoutSha ?? null,
    confidence: manifestEntry?.confidence ?? null,
    status,
    action: actionForPackageStatus(status)
  };
}

async function buildFolderStatus(
  projectRoot: string,
  folder: ConfiguredFolderReference,
  annotation: ReferenceAnnotation | undefined
): Promise<AgentReferenceStatusEntry> {
  const resolvedPath = resolveReferencePath(projectRoot, folder.path);
  const ready = await pathExists(resolvedPath);

  return {
    kind: 'folder',
    name: folder.name,
    description: folder.description,
    groups: annotation?.groups ?? folder.groups,
    requested: folder.path,
    packageManager: null,
    currentVersion: null,
    clonedVersion: null,
    path: resolvedPath,
    repositoryPath: null,
    checkoutSha: null,
    confidence: null,
    status: ready ? 'ready' : 'missing',
    action: ready ? READY_ACTION : 'Create or correct this folder reference path.'
  };
}

async function buildGitStatus(
  reference: ConfiguredGitReference,
  manifestEntry: GitManifestReference | null,
  referencePathFor: (entry: PackageManifestReference | GitManifestReference) => string,
  annotation: ReferenceAnnotation | undefined
): Promise<AgentReferenceStatusEntry> {
  const referencePath = manifestEntry ? referencePathFor(manifestEntry) : null;
  const ready = referencePath ? await pathExists(referencePath) : false;
  const status = getGitStatusState(reference.spec, manifestEntry, ready);

  return {
    kind: 'git',
    name: reference.name,
    description: reference.description,
    groups: annotation?.groups ?? reference.groups,
    requested: reference.spec,
    packageManager: null,
    currentVersion: null,
    clonedVersion: null,
    path: referencePath,
    repositoryPath: referencePath,
    checkoutSha: manifestEntry?.checkoutSha ?? null,
    confidence: null,
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
