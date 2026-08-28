import fs from 'node:fs/promises';
import path from 'node:path';

import { DEFAULT_LOCAL_CONFIG_FILE, loadAgentReferenceConfig } from './config.ts';
import { committedPathLeaks } from './config-hygiene.ts';
import { pathExists, resolveReferencePath } from './fs-utils.ts';
import { runGit } from './git.ts';
import { configuredReferences, resolveSets, setMemberKey } from './sets.ts';
import { resolveProjectInput } from './scanner.ts';
import type { AgentReferenceKind } from './types.ts';

/** The `owner/repo` shorthand read as a project-relative path, or null for anything else. */
function githubShorthandPath(repository: string): string | null {
  const match = /^github:([\w.-]+\/[\w.-]+)$/.exec(repository);
  return match?.[1] ?? null;
}

export interface ValidationReport {
  projectRoot: string;
  configPath: string | null;
  localConfigPath: string | null;
  /** The gitignored file is in git's index, so it is already being committed. */
  localConfigTracked: boolean;
  valid: boolean;
  errors: string[];
  warnings: string[];
  references: Array<{
    kind: AgentReferenceKind;
    name: string;
    description: string | null;
    sets: string[];
  }>;
  sets: Array<{ name: string; description: string | null; references: string[] }>;
}

/**
 * Checks an agent-reference config on its own terms: no lockfile, network, or clone needed,
 * so an agent can write the JSON and confirm the shape before anything else runs.
 */
export async function validateConfig(
  projectPath: string | null | undefined,
  options: { cwd?: string } = {},
): Promise<ValidationReport> {
  const cwd = options.cwd ?? process.cwd();
  const projectRoot = await resolveConfigRoot(projectPath, cwd);
  const report: ValidationReport = {
    projectRoot,
    configPath: null,
    localConfigPath: null,
    localConfigTracked: false,
    valid: false,
    errors: [],
    warnings: [],
    references: [],
    sets: [],
  };

  let loaded;
  try {
    loaded = await loadAgentReferenceConfig(projectRoot);
  } catch (error) {
    report.errors.push(error instanceof Error ? error.message : String(error));
    return report;
  }

  if (!loaded) {
    report.errors.push(
      `No agent-reference.json or agent-reference.local.json found in ${projectRoot}. Create one, then run this again.`,
    );
    return report;
  }

  report.configPath = loaded.path;
  report.localConfigPath = loaded.localPath;

  const references = configuredReferences(loaded.config);
  report.references = references.map((reference) => ({
    kind: reference.kind,
    name: reference.name,
    description: reference.description,
    sets: reference.sets,
  }));

  report.sets = resolveSets(loaded.config).map((set) => ({
    name: set.name,
    description: set.description,
    references: set.members.map(setMemberKey),
  }));

  for (const set of report.sets) {
    if (set.references.length === 0) {
      report.warnings.push(
        `Set "${set.name}" has no members. Add entries to its "references" map, or drop the set.`,
      );
    }
  }

  for (const reference of loaded.config.paths) {
    const resolved = resolveReferencePath(projectRoot, reference.path);
    if (!(await pathExists(resolved))) {
      report.warnings.push(
        `references.${reference.name} points at ${resolved}, which does not exist.`,
      );
    }
  }

  // `docs/decisions` is a valid `owner/repo` shorthand and a plausible folder, and the
  // source alone cannot say which was meant. Only the disk can, and only here: parsing
  // stays pure so it answers the same on every machine.
  for (const reference of loaded.config.git) {
    const shorthand = githubShorthandPath(reference.repository);
    if (!shorthand) continue;
    if (await pathExists(path.resolve(projectRoot, shorthand))) {
      report.warnings.push(
        `references.${reference.name} reads as the GitHub repository ${reference.repository}, but ${shorthand} is also a folder in this project. Write "./${shorthand}" for the folder; a path source has to be rooted so the two cannot be confused.`,
      );
    }
  }

  // The committed file is read on every teammate's machine: a personal path there is a
  // leak, not a preference, so it is an error rather than a warning.
  for (const leak of committedPathLeaks(loaded.config)) {
    const line = `${leak.summary} ${leak.fix}`;
    if (leak.severity === 'error') report.errors.push(line);
    else report.warnings.push(line);
  }

  if (await isLocalConfigTracked(projectRoot)) {
    report.localConfigTracked = true;
    report.errors.push(
      `${DEFAULT_LOCAL_CONFIG_FILE} is tracked by git, so it is being committed. Adding it to .gitignore will not help: git ignores nothing it already tracks. Run: git rm --cached ${DEFAULT_LOCAL_CONFIG_FILE}, list it in .gitignore, then commit. Whatever it already carried stays in the history, so treat anything private in it as disclosed.`,
    );
  }

  if (loaded.config?.allImporters) {
    report.warnings.push(
      'allImporters no longer does anything: every workspace importer is read now, and a name installed at several versions is reported rather than picked. The key can be removed.',
    );
  }

  if (references.length === 0) {
    report.warnings.push('No references are configured yet.');
  }

  report.valid = report.errors.length === 0;
  return report;
}

async function resolveConfigRoot(
  projectPath: string | null | undefined,
  cwd: string,
): Promise<string> {
  try {
    return (await resolveProjectInput(projectPath, cwd)).projectRoot;
  } catch {
    // Validation should work before a project has a lockfile, so fall back to the directory itself.
    const input = path.resolve(cwd, projectPath ?? '.');
    const stat = await fs.stat(input).catch(() => null);
    return stat?.isDirectory() ? input : path.dirname(input);
  }
}

/**
 * `git check-ignore` cannot answer this: git excludes tracked files from it, so a committed
 * local config reads as "not ignored" and adding the line to .gitignore changes nothing.
 * The index is the only place that says whether the file is actually being committed.
 */
async function isLocalConfigTracked(projectRoot: string): Promise<boolean> {
  const result = await runGit(['-C', projectRoot, 'ls-files', '--', DEFAULT_LOCAL_CONFIG_FILE], {
    allowFailure: true,
  });
  return result.exitCode === 0 && result.stdout.trim().length > 0;
}
