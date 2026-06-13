import fs from 'node:fs/promises';

import { loadDepCloneConfig } from './config.ts';
import { readManifest } from './manifest.ts';
import { dependencyKey } from './package-utils.ts';
import { resolveProjectInput, scanResolvedProject } from './scanner.ts';
import type {
  DepCloneDependency,
  DepCloneManifest,
  DepCloneStatusEntry,
  DepCloneStatusReport,
  DepCloneStatusState,
  ScanProjectOptions
} from './types.ts';

export async function getStatusReport(
  projectPath: string | null | undefined,
  options: ScanProjectOptions & { cwd?: string; configFile?: string | null } = {}
): Promise<DepCloneStatusReport> {
  const cwd = options.cwd ?? process.cwd();
  const context = await resolveProjectInput(projectPath, cwd);
  const loadedConfig = await loadDepCloneConfig(context.projectRoot, {
    configFile: options.configFile
  });
  const config = loadedConfig?.config;
  const dependencies = await scanResolvedProject(context, {
    ...options,
    allImporters: options.allImporters || config?.allImporters
  });
  const loadedManifest = await readManifest(context.projectRoot);
  const manifestDependencies = loadedManifest?.manifest.dependencies ?? [];
  const manifestByExact = new Map(
    manifestDependencies.map((entry) => [dependencyKey(entry.name, entry.version), entry])
  );
  const manifestByName = new Map<string, DepCloneManifest['dependencies'][number]>();
  for (const entry of manifestDependencies) {
    manifestByName.set(entry.name, entry);
  }

  const { selected, missingSelectors } = selectStatusDependencies(dependencies, config?.references, Boolean(config?.all));
  const entries: DepCloneStatusEntry[] = [];

  for (const dependency of selected) {
    const exactManifest = manifestByExact.get(dependencyKey(dependency.name, dependency.version));
    const nearestManifest = manifestByName.get(dependency.name);
    entries.push(await buildDependencyStatus(dependency, exactManifest ?? null, nearestManifest ?? null, Boolean(config)));
  }

  for (const selector of missingSelectors) {
    entries.push({
      name: selector,
      packageManager: null,
      configured: true,
      currentVersion: null,
      clonedVersion: manifestByName.get(selector)?.version ?? null,
      dependencyTypes: [],
      importers: [],
      worktreePath: manifestByName.get(selector)?.worktreePath ?? null,
      checkoutSha: manifestByName.get(selector)?.checkoutSha ?? null,
      status: 'not-installed',
      action: 'Update depclone.config.json or install this dependency, then run depclone clone --non-interactive.'
    });
  }

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    projectRoot: context.projectRoot,
    configPath: loadedConfig?.path ?? null,
    manifestPath: loadedManifest?.path ?? null,
    entries,
    summary: summarizeStatus(entries)
  };
}

function selectStatusDependencies(
  dependencies: DepCloneDependency[],
  references: string[] | undefined,
  all: boolean
): { selected: DepCloneDependency[]; missingSelectors: string[] } {
  if (all || references?.includes('*')) {
    return { selected: dependencies, missingSelectors: [] };
  }

  if (!references || references.length === 0) {
    return { selected: dependencies, missingSelectors: [] };
  }

  const selected: DepCloneDependency[] = [];
  const missingSelectors: string[] = [];

  for (const selector of references) {
    const match = dependencies.find((dependency) => {
      return dependency.name === selector || dependencyKey(dependency.name, dependency.version) === selector;
    });

    if (match) {
      selected.push(match);
    } else {
      missingSelectors.push(selector);
    }
  }

  return { selected, missingSelectors };
}

async function buildDependencyStatus(
  dependency: DepCloneDependency,
  exactManifest: DepCloneManifest['dependencies'][number] | null,
  nearestManifest: DepCloneManifest['dependencies'][number] | null,
  hasConfig: boolean
): Promise<DepCloneStatusEntry> {
  const manifestEntry = exactManifest ?? nearestManifest;
  const clonedVersion = manifestEntry?.version ?? null;
  const worktreePath = manifestEntry?.worktreePath ?? null;
  const worktreeExists = worktreePath ? await pathExists(worktreePath) : false;
  const configured = hasConfig;
  const status = getStatusState(dependency, exactManifest, nearestManifest, worktreeExists, configured);

  return {
    name: dependency.name,
    packageManager: dependency.packageManager,
    configured,
    currentVersion: dependency.version,
    clonedVersion,
    dependencyTypes: dependency.dependencyTypes,
    importers: dependency.importers,
    worktreePath,
    checkoutSha: manifestEntry?.checkoutSha ?? null,
    status,
    action: actionForStatus(status)
  };
}

function getStatusState(
  dependency: DepCloneDependency,
  exactManifest: DepCloneManifest['dependencies'][number] | null,
  nearestManifest: DepCloneManifest['dependencies'][number] | null,
  worktreeExists: boolean,
  configured: boolean
): DepCloneStatusState {
  if (!exactManifest && nearestManifest && nearestManifest.version !== dependency.version) return 'stale';
  if (!exactManifest) return configured ? 'missing' : 'unconfigured';
  if (!worktreeExists) return 'missing-worktree';
  return 'ready';
}

function actionForStatus(status: DepCloneStatusState): string {
  if (status === 'ready') return 'Use worktreePath for source inspection.';
  if (status === 'unconfigured') return 'Add this package to depclone.config.json if agents should inspect it.';
  return 'Run depclone clone --non-interactive to refresh local dependency sources.';
}

function summarizeStatus(entries: DepCloneStatusEntry[]): Record<DepCloneStatusState, number> {
  const summary: Record<DepCloneStatusState, number> = {
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

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
