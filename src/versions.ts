import process from 'node:process';

import { isWorkspaceVersion, workspaceVersionPath } from './pnpm-lock.ts';
import { resolveProjectInput, scanResolvedProject } from './scanner.ts';
import type { PackageReference } from './types.ts';

export interface InstalledVersion {
  version: string;
  importers: string[];
  dependencyTypes: string[];
  /** True when the version is a workspace link rather than something to fetch. */
  workspace: boolean;
  /** Where the workspace package lives, relative to the lockfile, when it is one. */
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
    versions: installed.filter((entry) => entry.name === name).map(describeVersion)
  };
}

function describeVersion(entry: PackageReference): InstalledVersion {
  const workspace = isWorkspaceVersion(entry.version);

  return {
    version: entry.version,
    importers: entry.importers,
    dependencyTypes: entry.dependencyTypes,
    workspace,
    path: workspace ? workspaceVersionPath(entry.version) : null
  };
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

  const workspace = report.versions.filter((entry) => entry.workspace);
  if (workspace.length > 0) {
    const lines = workspace.map((entry) => `${report.name} is a workspace package in this repository, at ${entry.path}.`);
    return `${[...lines, 'It is already on disk; there is nothing to fetch.', ''].join('\n')}`;
  }

  const width = Math.max(...report.versions.map((entry) => entry.version.length));
  const lines = report.versions.map(
    (entry) => `  ${entry.version.padEnd(width)}  ${entry.importers.join(', ')}`
  );

  if (report.versions.length > 1) {
    lines.push(
      '',
      `${report.versions.length} versions, so a bare name is ambiguous here. Ask for one:`,
      `  agent-reference get ${report.name}@${report.versions[0]?.version}`
    );
  } else {
    lines.push('', `  agent-reference get ${report.name}@${report.versions[0]?.version}`);
  }

  return `${lines.join('\n')}\n`;
}
