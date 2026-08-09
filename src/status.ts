import os from 'node:os';
import path from 'node:path';

import { pathExists, resolveConfigPath } from './fs-utils.ts';
import {
  bareRepositoryPathFor,
  defaultStoreDir,
  ensureGitAvailable,
  manifestReferencePath,
  resolvePackagePath
} from './git.ts';
import { groupMemberKey, resolveReferenceGroups, selectionFilter } from './groups.ts';
import { readManifest } from './manifest.ts';
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
const CLONE_ACTION = 'Run agent-reference clone --non-interactive to refresh local references.';

export type StatusReportOptions = ScanProjectOptions &
  ReferenceSelectionOptions & {
    configFile?: string | null;
    storeDir?: string;
    worktreeRoot?: string;
    gitBin?: string;
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
  const pinsByName = new Map((config?.packages ?? []).map((entry) => [entry.name, entry]));
  const unresolvedByName = new Map(
    (loadedManifest?.manifest.unresolved ?? []).map((entry) => [entry.name, entry])
  );
  const entries: AgentReferenceStatusEntry[] = [];

  for (const dependency of selectedPackages) {
    entries.push(
      await buildPackageStatus(
        dependency,
        packageManifestByExact.get(`${dependency.name}@${dependency.version}`) ?? null,
        packageManifestByName.get(dependency.name) ?? null,
        hasConfig,
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
  const problems = await collectProblems(references, unresolvedByName, storeDir, loadedConfig?.path ?? null, options);

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

const CLONE_COMMAND = 'agent-reference clone --non-interactive';

/**
 * Turns every unusable reference into an instruction the calling agent can act on without
 * reading this source, including the exact JSON to add to the config.
 */
async function collectProblems(
  entries: AgentReferenceStatusEntry[],
  unresolvedByName: Map<string, UnresolvedManifestReference>,
  storeDir: string,
  configPath: string | null,
  options: StatusReportOptions
): Promise<AgentReferenceProblem[]> {
  const problems: AgentReferenceProblem[] = [];
  const configFile = configPath ? path.basename(configPath) : 'agent-reference.json';

  for (const entry of entries) {
    const reference = `${entry.kind}:${entry.name}`;

    if (entry.status === 'unresolvable') {
      const failure = unresolvedByName.get(entry.name);
      problems.push({
        reference,
        severity: 'error',
        summary: `${entry.name}@${entry.currentVersion} could not be materialized. ${failure?.detail ?? ''}`.trim(),
        fix: unresolvableFix(entry, failure, storeDir, configFile),
        configPatch: unresolvablePatch(entry, failure)
      });
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
        fix: pinFix(entry, storeDir, configFile),
        configPatch: pinPatch(entry)
      });
      continue;
    }

    if (entry.status === 'ready' && entry.confidence === 'unverified') {
      problems.push({
        reference,
        severity: 'warning',
        summary: `${entry.name}@${entry.currentVersion} was checked out from a plausible ref, but no package.json confirmed the version.`,
        fix: `Spot-check ${entry.path}/package.json. If it is wrong, ${pinFix(entry, storeDir, configFile)}`,
        configPatch: pinPatch(entry)
      });
    }
  }

  if (entries.some((entry) => NEEDS_CLONE.has(entry.status))) {
    const gitProblem = await gitUnavailableProblem(options.gitBin);
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

function unresolvableFix(
  entry: AgentReferenceStatusEntry,
  failure: UnresolvedManifestReference | undefined,
  storeDir: string,
  configFile: string
): string {
  if (failure?.reason === 'no-repository') {
    return `The registry has no repository for this package. Find its source repository, then set packages.${entry.name}.repository in ${configFile} (github:owner/repo or a git URL). Add "ref" too if the tags are unusual. Then run ${CLONE_COMMAND}.`;
  }
  if (failure?.reason === 'unresolved-ref') {
    return `The pinned packages.${entry.name}.ref does not exist in the repository. ${inspectHint(entry, failure, storeDir)} Then correct "ref" in ${configFile} and run ${CLONE_COMMAND}.`;
  }
  if (failure?.reason === 'registry-error') {
    return `The registry lookup failed. If this package is private or unpublished, set both packages.${entry.name}.repository and packages.${entry.name}.ref in ${configFile} to skip the registry entirely. Otherwise check network access and run ${CLONE_COMMAND}.`;
  }
  return `${inspectHint(entry, failure, storeDir)} Then pin packages.${entry.name}.ref in ${configFile} and run ${CLONE_COMMAND}.`;
}

function pinFix(entry: AgentReferenceStatusEntry, storeDir: string, configFile: string): string {
  const version = entry.currentVersion ?? '';
  const searchPath = entry.repositoryUrl ? bareRepositoryPathFor(storeDir, entry.repositoryUrl) : null;
  const search = searchPath
    ? `List the candidate tags with: git -C ${searchPath} tag --list '*${version}*'. Inspect a candidate with: git -C ${searchPath} show <tag>:package.json.`
    : 'Inspect the repository history to find the release commit.';

  return `${search} Pick the commit or tag that really is ${entry.name}@${version}, set packages.${entry.name}.ref to it in ${configFile}, then run ${CLONE_COMMAND}. A pinned ref always wins over automatic resolution.`;
}

function inspectHint(
  entry: AgentReferenceStatusEntry,
  failure: UnresolvedManifestReference | undefined,
  storeDir: string
): string {
  const repositoryUrl = entry.repositoryUrl ?? failure?.repositoryUrl ?? null;
  if (!repositoryUrl) return 'Inspect the source repository to find the right commit.';
  return `Find the right commit with: git -C ${bareRepositoryPathFor(storeDir, repositoryUrl)} tag --list '*${entry.currentVersion ?? ''}*'.`;
}

function pinPatch(entry: AgentReferenceStatusEntry): Record<string, unknown> {
  return {
    packages: {
      [entry.name]: { version: entry.requested ?? entry.currentVersion ?? 'installed', ref: '<commit-or-tag>' }
    }
  };
}

function unresolvablePatch(
  entry: AgentReferenceStatusEntry,
  failure: UnresolvedManifestReference | undefined
): Record<string, unknown> {
  const pinned: Record<string, unknown> = { version: entry.requested ?? entry.currentVersion ?? 'installed' };
  if (failure?.reason === 'no-repository' || failure?.reason === 'registry-error') {
    pinned.repository = '<github:owner/repo>';
  }
  pinned.ref = '<commit-or-tag>';

  return { packages: { [entry.name]: pinned } };
}

async function gitUnavailableProblem(gitBin: string | undefined): Promise<AgentReferenceProblem | null> {
  try {
    await ensureGitAvailable(gitBin);
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
  exactManifest: PackageManifestReference | null,
  nearestManifest: PackageManifestReference | null,
  hasConfig: boolean,
  referencePathFor: (reference: PackageManifestReference | GitManifestReference) => string,
  annotation: ReferenceAnnotation | undefined,
  configEntry: ConfiguredPackageReference | null,
  unresolved: UnresolvedManifestReference | null
): Promise<AgentReferenceStatusEntry> {
  const manifestEntry = exactManifest ?? nearestManifest;
  const worktreePath = manifestEntry ? referencePathFor(manifestEntry) : null;
  const status = getPackageStatusState(
    dependency,
    exactManifest,
    nearestManifest,
    worktreePath ? await pathExists(worktreePath) : false,
    hasConfig,
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
      : 'Run agent-reference clone --non-interactive to materialize this git reference.'
  };
}

function getPackageStatusState(
  dependency: PackageReference,
  exactManifest: PackageManifestReference | null,
  nearestManifest: PackageManifestReference | null,
  pathExistsNow: boolean,
  hasConfig: boolean,
  configEntry: ConfiguredPackageReference | null,
  unresolved: UnresolvedManifestReference | null
): AgentReferenceStatusState {
  const pinnedRef = configEntry?.ref ?? null;

  // A recorded failure outranks "missing", because re-running clone unchanged would fail
  // the same way. Editing the overrides it failed on makes it worth retrying again.
  if (!exactManifest && unresolved && unresolved.version === dependency.version) {
    const retryWorthwhile =
      unresolved.pinnedRef !== pinnedRef || unresolved.repository !== (configEntry?.repository ?? null);
    if (!retryWorthwhile) return 'unresolvable';
  }

  if (!exactManifest && nearestManifest && nearestManifest.version !== dependency.version) return 'stale';
  if (!exactManifest) return hasConfig ? 'missing' : 'unconfigured';
  // Re-pinning in the config must invalidate a checkout made under the old pin.
  if ((exactManifest.pinnedRef ?? null) !== pinnedRef) return 'stale';
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
  if (status === 'unconfigured') return 'Add this package to agent-reference.json if agents should inspect it.';
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
    unresolvable: 0,
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
