import os from 'node:os';
import path from 'node:path';

import { pathExists, resolveConfigPath } from './fs-utils.ts';
import {
  defaultStoreDir,
  ensureGitAvailable,
  manifestReferencePath,
  resolvePackagePath
} from './git.ts';
import { describeSelection, groupMemberKey, knownSelectorsMessage, resolveReferenceGroups, selectionFilter } from './groups.ts';
import { readManifest } from './manifest.ts';
import { CLONE_COMMAND, pinFix, unresolvedProblem } from './problems.ts';
import { loadReferenceContext } from './reference-context.ts';
import type {
  AgentReferenceConfig,
  AgentReferenceProblem,
  AgentReferenceStatusEntry,
  AgentReferenceStatusReport,
  AgentReferenceStatusState,
  ConfiguredFolderReference,
  ConfiguredGitReference,
  ConfiguredPackageReference,
  GitManifestReference,
  PackageManifestReference,
  PackageReference,
  ReferenceSelectionOptions,
  ScanProjectOptions,
  UnresolvedManifestReference
} from './types.ts';

const READY_ACTION = 'Use path for source inspection.';
const CLONE_ACTION = `Run ${CLONE_COMMAND} to refresh local references.`;

export type StatusReportOptions = ScanProjectOptions & ReferenceSelectionOptions & { storeDir?: string };

export async function getStatusReport(
  projectPath: string | null | undefined,
  options: StatusReportOptions = {}
): Promise<AgentReferenceStatusReport> {
  const { config, configPackages, cwd, loadedConfig, project } = await loadReferenceContext(projectPath, options);
  const loadedManifest = await readManifest(project.projectRoot);
  const configuredStore = options.storeDir ?? config?.cacheDir;
  const storeDir = configuredStore
    ? resolveConfigPath(project.projectRoot, cwd, configuredStore)
    : defaultStoreDir();
  const referencePathFor = (reference: PackageManifestReference | GitManifestReference): string =>
    manifestReferencePath(storeDir, reference);

  const packageManifestByName = new Map<string, PackageManifestReference>();
  const gitManifestByName = new Map<string, GitManifestReference>();
  for (const reference of loadedManifest?.manifest.references ?? []) {
    if (reference.kind === 'package') {
      packageManifestByName.set(reference.name, reference);
    } else {
      gitManifestByName.set(reference.name, reference);
    }
  }

  const annotations = referenceAnnotations(config);
  const pinsByName = new Map((config?.packages ?? []).map((entry) => [entry.name, entry]));
  const unresolvedByName = new Map(
    (loadedManifest?.manifest.unresolved ?? []).map((entry) => [entry.name, entry])
  );
  const entries: AgentReferenceStatusEntry[] = [];

  for (const dependency of configPackages.packages) {
    entries.push(
      await buildPackageStatus(
        dependency,
        packageManifestByName.get(dependency.name) ?? null,
        referencePathFor,
        annotations.get(`package:${dependency.name}`),
        pinsByName.get(dependency.name) ?? null,
        unresolvedByName.get(dependency.name) ?? null
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
      repositoryUrl: manifestEntry?.repositoryUrl ?? null,
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
  if (filter && references.length === 0) {
    // Silently printing an empty table would read as "this reference has no problems".
    throw new Error(
      `Nothing matched ${describeSelection(options)}. ${knownSelectorsMessage(config)}`
    );
  }
  const problems = await collectProblems(references, unresolvedByName, storeDir, loadedConfig?.path ?? null);

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
    problems,
    nextSteps: nextStepsFor(references, problems),
    summary: summarizeStatus(references)
  };
}

/**
 * Turns every unusable reference into an instruction the calling agent can act on without
 * reading this source, including the exact JSON to add to the config.
 */
async function collectProblems(
  entries: AgentReferenceStatusEntry[],
  unresolvedByName: Map<string, UnresolvedManifestReference>,
  storeDir: string,
  configPath: string | null
): Promise<AgentReferenceProblem[]> {
  const problems: AgentReferenceProblem[] = [];
  const configFile = configPath ? path.basename(configPath) : 'agent-reference.json';

  for (const entry of entries) {
    const reference = `${entry.kind}:${entry.name}`;

    if (entry.status === 'unresolvable') {
      const failure = unresolvedByName.get(entry.name);
      if (failure) problems.push(unresolvedProblem(failure, storeDir, configFile));
      continue;
    }

    if (entry.status === 'not-installed') {
      problems.push({
        reference,
        severity: 'error',
        summary: `${entry.name} is configured as "installed" but is not in the lockfile.`,
        fix: `Install ${entry.name}, or change packages.${entry.name} in ${configFile} to a pinned version. Do not treat the old checkout as current source.`,
        configPatch: null
      });
      continue;
    }

    if (entry.kind === 'folder' && entry.status === 'missing') {
      problems.push({
        reference,
        severity: 'error',
        summary: `Folder reference ${entry.name} points at ${entry.path}, which does not exist.`,
        fix: `Create that folder, or correct folders.${entry.name} in ${configFile}. Folder references are never cloned.`,
        configPatch: null
      });
      continue;
    }

    if (entry.status === 'ready' && entry.confidence === 'fallback') {
      problems.push({
        reference,
        severity: 'error',
        summary: `${entry.name}@${entry.currentVersion} has no matching release commit, so the default branch was checked out. The source at this path is NOT version ${entry.currentVersion}.`,
        fix: pinFix(entry.name, entry.currentVersion, entry.repositoryUrl, storeDir, configFile),
        configPatch: pinPatch(entry)
      });
      continue;
    }

    if (entry.status === 'ready' && entry.confidence === 'unverified') {
      problems.push({
        reference,
        severity: 'warning',
        summary: `${entry.name}@${entry.currentVersion} was checked out from a plausible ref, but no package.json confirmed the version.`,
        fix: `Spot-check ${entry.path}/package.json. If it is wrong, ${pinFix(entry.name, entry.currentVersion, entry.repositoryUrl, storeDir, configFile)}`,
        configPatch: pinPatch(entry)
      });
    }
  }

  if (entries.some((entry) => NEEDS_CLONE.has(entry.status))) {
    const gitProblem = await gitUnavailableProblem();
    if (gitProblem) problems.push(gitProblem);
  }

  return problems;
}

const NEEDS_CLONE = new Set<AgentReferenceStatusState>(['missing', 'missing-worktree', 'stale']);

function nextStepsFor(entries: AgentReferenceStatusEntry[], problems: AgentReferenceProblem[]): string[] {
  const steps: string[] = [];

  if (entries.some((entry) => NEEDS_CLONE.has(entry.status))) {
    steps.push(CLONE_COMMAND);
  }
  if (problems.some((problem) => problem.severity === 'error')) {
    steps.push('Resolve the errors under problems, then run agent-reference status again.');
  }

  return steps;
}

function pinPatch(entry: AgentReferenceStatusEntry): Record<string, unknown> {
  return {
    packages: {
      [entry.name]: { version: entry.requested ?? entry.currentVersion ?? 'installed', ref: '<commit-or-tag>' }
    }
  };
}

async function gitUnavailableProblem(): Promise<AgentReferenceProblem | null> {
  try {
    await ensureGitAvailable();
    return null;
  } catch (error) {
    return {
      reference: null,
      severity: 'error',
      summary: error instanceof Error ? error.message : String(error),
      fix: `References cannot be materialized until git works. Install or repair git, then run ${CLONE_COMMAND}.`,
      configPatch: null
    };
  }
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
  manifestEntry: PackageManifestReference | null,
  referencePathFor: (reference: PackageManifestReference | GitManifestReference) => string,
  annotation: ReferenceAnnotation | undefined,
  configEntry: ConfiguredPackageReference | null,
  unresolved: UnresolvedManifestReference | null
): Promise<AgentReferenceStatusEntry> {
  const worktreePath = manifestEntry ? referencePathFor(manifestEntry) : null;
  const status = getPackageStatusState(
    dependency,
    manifestEntry,
    worktreePath ? await pathExists(worktreePath) : false,
    configEntry,
    unresolved
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
    repositoryUrl: manifestEntry?.repositoryUrl ?? unresolved?.repositoryUrl ?? null,
    checkoutSha: manifestEntry?.checkoutSha ?? null,
    confidence: manifestEntry?.confidence ?? null,
    status,
    action: actionForPackageStatus(status, dependency.name)
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
    repositoryUrl: null,
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
    repositoryUrl: manifestEntry?.repositoryUrl ?? null,
    checkoutSha: manifestEntry?.checkoutSha ?? null,
    confidence: null,
    status,
    action: status === 'ready'
      ? READY_ACTION
      : `Run ${CLONE_COMMAND} to materialize this git reference.`
  };
}

function getPackageStatusState(
  dependency: PackageReference,
  manifestEntry: PackageManifestReference | null,
  pathExistsNow: boolean,
  configEntry: ConfiguredPackageReference | null,
  unresolved: UnresolvedManifestReference | null
): AgentReferenceStatusState {
  const pinnedRef = configEntry?.ref ?? null;
  const current = manifestEntry?.version === dependency.version;

  // A recorded failure outranks "missing", because re-running clone unchanged would fail
  // the same way. Editing the overrides it failed on makes it worth retrying again.
  if (!current && unresolved && unresolved.version === dependency.version) {
    const retryWorthwhile =
      unresolved.pinnedRef !== pinnedRef || unresolved.repository !== (configEntry?.repository ?? null);
    if (!retryWorthwhile) return 'unresolvable';
  }

  if (!manifestEntry) return 'missing';
  if (!current) return 'stale';
  // Re-pinning in the config must invalidate a checkout made under the old pin.
  if ((manifestEntry.pinnedRef ?? null) !== pinnedRef) return 'stale';
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

function actionForPackageStatus(status: AgentReferenceStatusState, name: string): string {
  if (status === 'ready') return READY_ACTION;
  if (status === 'unresolvable') {
    return `Cloning already failed for this reference; running clone again will not help. See problems for the fix, which usually means setting packages.${name}.ref or .repository.`;
  }
  return CLONE_ACTION;
}

function summarizeStatus(entries: AgentReferenceStatusEntry[]): Record<AgentReferenceStatusState, number> {
  const summary: Record<AgentReferenceStatusState, number> = {
    ready: 0,
    missing: 0,
    'missing-worktree': 0,
    stale: 0,
    'not-installed': 0,
    unresolvable: 0
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
