import path from 'node:path';
import process from 'node:process';

import { isWorkspaceVersion, workspaceVersionDirectory, workspaceVersionPath } from './pnpm-lock.ts';
import { resolveProjectInput, scanResolvedProject } from './scanner.ts';
import type { PackageReference, ProjectContext } from './types.ts';

export interface InstalledVersion {
  version: string;
  importers: string[];
  dependencyTypes: string[];
  /** True when the version is a workspace link rather than something to fetch. */
  workspace: boolean;
  /** Absolute directory a workspace package lives in, when the link names one. */
  path: string | null;
}

export interface VersionsReport {
  name: string;
  projectRoot: string;
  lockfile: string | null;
  packageManager: string;
  /** The importer the command ran in, which decides a bare `get` when several disagree. */
  importer: string;
  versions: InstalledVersion[];
}

/**
 * Answers "what does this project install, and where", and nothing else. It reads, it never
 * fetches, and it never fails the way `get` can: an unknown ecosystem or an absent package
 * is an empty answer with the reason attached, not an error. That is the whole point of
 * splitting it out. Finding a version is something an agent can do with a grep, so the tool
 * only has to do it faster and say where the number came from; turning a version into a
 * commit is the part an agent cannot do cheaply, and that stays in `get`.
 */
export async function getVersionsReport(
  projectPath: string | null | undefined,
  name: string,
  options: { cwd?: string } = {}
): Promise<VersionsReport> {
  // Deliberately no config. The error for an unusable version in `packages` tells the agent
  // to run this command, so this command cannot be one that a broken config takes down with
  // it. The question is about the project, and the lockfile answers it on its own.
  const project = await resolveProjectInput(projectPath, options.cwd ?? process.cwd());
  const installed = await scanResolvedProject(project, { ...options, allImporters: true });

  return {
    name,
    projectRoot: project.projectRoot,
    lockfile: project.lockfilePath,
    packageManager: project.packageManager,
    importer: project.importer,
    versions: describeVersions(
      installed.filter((entry) => entry.name === name),
      project
    )
  };
}

/**
 * One entry per thing a caller could fetch or open. Registry versions are already one entry
 * each, but workspace links arrive one per importer that wrote a different relative string
 * for the same directory, so those are resolved and regrouped by where they actually point.
 */
function describeVersions(entries: PackageReference[], project: ProjectContext): InstalledVersion[] {
  const lockfileDir = project.lockfilePath ? path.dirname(project.lockfilePath) : project.projectRoot;
  const versions: InstalledVersion[] = [];
  const byDirectory = new Map<string, InstalledVersion>();

  for (const entry of entries) {
    if (!isWorkspaceVersion(entry.version)) {
      versions.push({
        version: entry.version,
        importers: entry.importers,
        dependencyTypes: entry.dependencyTypes,
        workspace: false,
        path: null
      });
      continue;
    }

    for (const importer of entry.importers) {
      const directory = workspaceVersionDirectory(lockfileDir, importer, entry.version);
      const key = directory ?? `unlocated:${workspaceVersionPath(entry.version)}`;
      const existing = byDirectory.get(key);

      if (existing) {
        merge(existing.importers, [importer]);
        merge(existing.dependencyTypes, entry.dependencyTypes);
        continue;
      }

      const created: InstalledVersion = {
        version: entry.version,
        importers: [importer],
        dependencyTypes: [...entry.dependencyTypes],
        workspace: true,
        path: directory
      };
      byDirectory.set(key, created);
      versions.push(created);
    }
  }

  return versions;
}

function merge(into: string[], values: string[]): void {
  for (const value of values) {
    if (!into.includes(value)) into.push(value);
  }
}

export function formatVersionsReport(report: VersionsReport): string {
  if (report.versions.length === 0) {
    const where = report.lockfile
      ? `Nothing in this project installs ${report.name}.`
      : `No lockfile this tool reads was found under ${report.projectRoot}.`;
    return [
      where,
      `Read the version from the project yourself, then ask for it directly:`,
      `  agent-reference get ${report.name}@<version>`,
      ''
    ].join('\n');
  }

  // Both halves, always. One workspace link used to end the report, hiding the versions
  // other importers install from the registry behind a flat "there is nothing to fetch".
  const workspace = report.versions.filter((entry) => entry.workspace);
  const registry = report.versions.filter((entry) => !entry.workspace);
  const lines = workspace.map((entry) =>
    entry.path
      ? `${report.name} is a workspace package in this repository, at ${entry.path}.`
      : `${report.name} is a workspace package in this repository. The lockfile records it as ${entry.version}, which does not say where.`
  );

  if (registry.length === 0) {
    return `${[...lines, 'It is already on disk; there is nothing to fetch.', ''].join('\n')}`;
  }
  if (workspace.length > 0) {
    lines.push(`Other importers install ${report.name} from the registry:`, '');
  }

  const width = Math.max(...registry.map((entry) => entry.version.length));
  lines.push(...registry.map((entry) => `  ${entry.version.padEnd(width)}  ${entry.importers.join(', ')}`));

  if (registry.length > 1) {
    lines.push(
      '',
      `${registry.length} versions, so a bare name is ambiguous here. Ask for one:`,
      `  agent-reference get ${report.name}@${registry[0]?.version}`
    );
  } else {
    lines.push('', `  agent-reference get ${report.name}@${registry[0]?.version}`);
  }

  return `${lines.join('\n')}\n`;
}
