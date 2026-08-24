import path from 'node:path';

import { pathExists, resolveConfigPath, resolveReferencePath } from './fs-utils.ts';
import { defaultStoreDir, manifestReferencePath, resolvePackagePath, resolveSubpath } from './git.ts';
import {
  configuredReferences,
  describeSelection,
  knownSelectorsMessage,
  resolveSets,
  selectionFilter,
  setMemberKey,
  splitSelectors,
  unknownCommandHint
} from './sets.ts';
import { committedPathLeaks } from './config-hygiene.ts';
import { readManifest } from './manifest.ts';
import { getCommand, missingDirectoryProblem, pinFix, unresolvedProblem } from './problems.ts';
import { configFileFor } from './get.ts';
import { loadReferenceContext } from './reference-context.ts';
import type {
  AgentReferenceConfig,
  AgentReferenceProblem,
  AgentReferenceStatusEntry,
  AgentReferenceStatusReport,
  AgentReferenceStatusState,
  ConfigScope,
  ConfiguredFolderReference,
  ConfiguredGitReference,
  ConfiguredPackageReference,
  GitManifestReference,
  PackageManifestReference,
  PackageReference,
  ReferenceSelectionOptions,
  ScanProjectOptions,
  PackageDrift,
  UnresolvedManifestReference
} from './types.ts';

const READY_ACTION = 'Use path for source inspection.';

export type StatusReportOptions = ScanProjectOptions & ReferenceSelectionOptions & { storeDir?: string };

export async function getStatusReport(
  projectPath: string | null | undefined,
  options: StatusReportOptions = {}
): Promise<AgentReferenceStatusReport> {
  const { config, configPackages, cwd, installedPackages, loadedConfig, project } = await loadReferenceContext(
    projectPath,
    options
  );
  const configuredStore = options.storeDir ?? config?.cacheDir;
  const storeDir = configuredStore
    ? resolveConfigPath(project.projectRoot, cwd, configuredStore)
    : defaultStoreDir();
  const loadedManifest = await readManifest(project.projectRoot, storeDir);
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
      [
        `Nothing matched ${describeSelection(options)}.`,
        knownSelectorsMessage(config),
        unknownCommandHint(splitSelectors(options.references))
      ]
        .filter(Boolean)
        .join(' ')
    );
  }
  const problems = await collectProblems(
    references,
    unresolvedByName,
    new Set((config?.packages ?? []).filter((entry) => entry.directory).map((entry) => entry.name)),
    configPackages.drift,
    config,
    storeDir,
    loadedConfig?.path ?? null
  );

  return {
    generatedAt: new Date().toISOString(),
    projectRoot: project.projectRoot,
    configPath: loadedConfig?.path ?? null,
    localConfigPath: loadedConfig?.localPath ?? null,
    manifestPath: loadedManifest?.path ?? null,
    installedPackageCount: installedPackages.length,
    sets: resolveSets(config).map((set) => ({
      name: set.name,
      description: set.description,
      references: set.members.map(setMemberKey)
    })),
    references,
    problems,
    nextSteps: nextStepsFor(problems),
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
  /** Names whose package directory was chosen by hand, so an unconfirmed version is expected. */
  directoryPinned: Set<string>,
  drift: PackageDrift[],
  config: AgentReferenceConfig | undefined,
  storeDir: string,
  configPath: string | null
): Promise<AgentReferenceProblem[]> {
  const problems: AgentReferenceProblem[] = [];
  const configFile = configPath ? path.basename(configPath) : 'agent-reference.json';
  const gitByName = new Map((config?.git ?? []).map((entry) => [entry.name, entry]));

  for (const entry of entries) {
    const reference = `${entry.kind}:${entry.name}`;

    if (entry.directoryMissing) {
      const configured = gitByName.get(entry.name);
      if (configured?.directory) {
        problems.push(
          missingDirectoryProblem(
            entry.name,
            configured.directory,
            configured.ref,
            entry.repositoryPath ?? '',
            configFileFor(configured.scope)
          )
        );
      }
    }

    if (entry.status === 'unresolvable') {
      const failure = unresolvedByName.get(entry.name);
      if (failure) problems.push(unresolvedProblem(failure, storeDir, configFile));
      continue;
    }

    const drifted = drift.find((candidate) => candidate.name === entry.name);
    if (drifted) {
      problems.push({
        reference,
        severity: 'warning',
        summary: `${entry.name} is pinned to ${drifted.pinned}, but this project installs ${drifted.installed.join(' and ')} (${drifted.importers.join(', ')}).`,
        fix: `If the pin is deliberate, say so in packages.${entry.name}.description. Otherwise set packages.${entry.name} in ${configFile} to ${drifted.installed[0]} and run ${getCommand(entry.name)}.`,
        configPatch: { packages: { [entry.name]: drifted.installed[0] } }
      });
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

    if (entry.status === 'ready' && entry.confidence === 'unverified' && !directoryPinned.has(entry.name)) {
      problems.push({
        reference,
        severity: 'warning',
        summary: `${entry.name}@${entry.currentVersion} was checked out from a plausible ref, but no package.json confirmed the version.`,
        fix: `Spot-check ${entry.path}/package.json. If it is wrong, ${pinFix(entry.name, entry.currentVersion, entry.repositoryUrl, storeDir, configFile)}`,
        configPatch: pinPatch(entry)
      });
    }
  }

  // Reported whatever the selection was: this is about the file being read, not about the
  // references asked for, and a leak the caller filtered past is still a leak. Warnings
  // rather than the errors `validate` raises, because nothing here is unusable; the agent
  // maintaining this config is the one who can move the entry, and status is what it runs.
  for (const leak of committedPathLeaks(config ?? { packages: [], folders: [], git: [], sets: [] })) {
    problems.push({
      reference: leak.reference,
      about: 'config',
      severity: 'warning',
      summary: leak.summary,
      fix: leak.fix,
      configPatch: null
    });
  }

  return problems;
}

function nextStepsFor(problems: AgentReferenceProblem[]): string[] {
  const steps: string[] = [];

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

interface ReferenceAnnotation {
  description: string | null;
  scope: ConfigScope;
  sets: string[];
}

/** Set membership rides on each parsed reference, so the config is the whole key set. */
function referenceAnnotations(config: AgentReferenceConfig | undefined): Map<string, ReferenceAnnotation> {
  return new Map<string, ReferenceAnnotation>(
    configuredReferences(config).map((reference) => [
      `${reference.kind}:${reference.name}`,
      { description: reference.description, scope: reference.scope, sets: reference.sets }
    ])
  );
}

type StatusEntryInput = Partial<AgentReferenceStatusEntry> &
  Pick<AgentReferenceStatusEntry, 'kind' | 'name' | 'status' | 'action'>;

/** Most fields do not apply to most kinds, so only the meaningful ones are passed in. */
function statusEntry(input: StatusEntryInput): AgentReferenceStatusEntry {
  return {
    description: null,
    scope: null,
    sets: [],
    requested: null,
    packageManager: null,
    currentVersion: null,
    clonedVersion: null,
    path: null,
    repositoryPath: null,
    repositoryUrl: null,
    checkoutSha: null,
    confidence: null,
    directoryMissing: false,
    ...input
  };
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

  return statusEntry({
    kind: 'package',
    name: dependency.name,
    description: annotation?.description ?? null,
    scope: annotation?.scope ?? null,
    sets: annotation?.sets ?? [],
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
    action: actionForPackageStatus(status, dependency, manifestEntry?.version ?? null)
  });
}

async function buildFolderStatus(
  projectRoot: string,
  folder: ConfiguredFolderReference,
  annotation: ReferenceAnnotation | undefined
): Promise<AgentReferenceStatusEntry> {
  const resolvedPath = resolveReferencePath(projectRoot, folder.path);
  const ready = await pathExists(resolvedPath);

  return statusEntry({
    kind: 'folder',
    name: folder.name,
    description: folder.description,
    scope: folder.scope,
    sets: annotation?.sets ?? [],
    requested: folder.path,
    path: resolvedPath,
    status: ready ? 'ready' : 'missing',
    action: ready ? READY_ACTION : 'Create or correct this folder reference path.'
  });
}

async function buildGitStatus(
  reference: ConfiguredGitReference,
  manifestEntry: GitManifestReference | null,
  referencePathFor: (entry: PackageManifestReference | GitManifestReference) => string,
  annotation: ReferenceAnnotation | undefined
): Promise<AgentReferenceStatusEntry> {
  const worktreePath = manifestEntry ? referencePathFor(manifestEntry) : null;
  const ready = worktreePath ? await pathExists(worktreePath) : false;
  const status = getGitStatusState(reference.spec, manifestEntry, ready);

  // Resolved here rather than read back from the manifest, so a `directory` added or edited
  // since the clone takes effect now and an upstream move is caught on the next status.
  const subpath = ready && worktreePath ? await resolveSubpath(worktreePath, reference.directory) : null;

  return statusEntry({
    kind: 'git',
    name: reference.name,
    description: reference.description,
    scope: reference.scope,
    sets: annotation?.sets ?? [],
    requested: reference.spec,
    path: subpath?.path ?? worktreePath,
    repositoryPath: worktreePath,
    repositoryUrl: manifestEntry?.repositoryUrl ?? null,
    checkoutSha: manifestEntry?.checkoutSha ?? null,
    directoryMissing: subpath?.missing ?? false,
    status,
    action:
      status === 'ready'
        ? READY_ACTION
        : `Run ${getCommand(reference.name)} when this source is needed.`
  });
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

  // A recorded failure outranks "declared", because materializing again unchanged would
  // fail the same way. Editing the overrides it failed on makes it worth retrying.
  if (!current && unresolved && unresolved.version === dependency.version) {
    const retryWorthwhile =
      unresolved.pinnedRef !== pinnedRef || unresolved.repository !== (configEntry?.repository ?? null);
    if (!retryWorthwhile) return 'unresolvable';
  }

  if (!manifestEntry) return 'declared';
  if (!current) return 'stale';
  // Re-pinning in the config must invalidate a checkout made under the old pin.
  if ((manifestEntry.pinnedRef ?? null) !== pinnedRef) return 'stale';
  // A pruned worktree is just an unmaterialized reference again.
  if (!pathExistsNow) return 'declared';
  return 'ready';
}

function getGitStatusState(
  requested: string,
  manifestEntry: GitManifestReference | null,
  pathExistsNow: boolean
): AgentReferenceStatusState {
  if (!manifestEntry) return 'declared';
  if (manifestEntry.requested !== requested) return 'stale';
  if (!pathExistsNow) return 'declared';
  return 'ready';
}

function actionForPackageStatus(
  status: AgentReferenceStatusState,
  dependency: PackageReference,
  clonedVersion: string | null
): string {
  if (status === 'ready') return READY_ACTION;
  if (status === 'unresolvable') {
    return `Materializing already failed for this reference; trying again unchanged will fail the same way. See problems for the fix, which usually means setting packages.${dependency.name}.ref or .repository.`;
  }
  if (status === 'stale') {
    return `The lockfile now has ${dependency.version}; run ${getCommand(dependency.name)} for it. The existing checkout is still valid for ${clonedVersion ?? 'the old version'}.`;
  }
  return `Nothing fetched yet. Run ${getCommand(dependency.name)} when this source is needed.`;
}

function summarizeStatus(entries: AgentReferenceStatusEntry[]): Record<AgentReferenceStatusState, number> {
  const summary: Record<AgentReferenceStatusState, number> = {
    ready: 0,
    declared: 0,
    stale: 0,
    missing: 0,
    unresolvable: 0
  };

  for (const entry of entries) {
    summary[entry.status] += 1;
  }

  return summary;
}
