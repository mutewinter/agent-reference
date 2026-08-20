import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { loadAgentReferenceConfig } from './config.ts';
import { pathExists } from './fs-utils.ts';
import { configuredReferences, resolveSets, setMemberKey } from './sets.ts';
import { resolveProjectInput } from './scanner.ts';
import type { AgentReferenceKind } from './types.ts';

export interface ValidationReport {
  projectRoot: string;
  configPath: string | null;
  localConfigPath: string | null;
  valid: boolean;
  errors: string[];
  warnings: string[];
  references: Array<{
    kind: AgentReferenceKind;
    name: string;
    description: string | null;
    sets: string[];
  }>;
  sets: Array<{ name: string | null; description: string; references: string[] }>;
}

/**
 * Checks an agent-reference config on its own terms: no lockfile, network, or clone needed,
 * so an agent can write the JSON and confirm the shape before anything else runs.
 */
export async function validateConfig(
  projectPath: string | null | undefined,
  options: { cwd?: string } = {}
): Promise<ValidationReport> {
  const cwd = options.cwd ?? process.cwd();
  const projectRoot = await resolveConfigRoot(projectPath, cwd);
  const report: ValidationReport = {
    projectRoot,
    configPath: null,
    localConfigPath: null,
    valid: false,
    errors: [],
    warnings: [],
    references: [],
    sets: []
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
      `No agent-reference.json or agent-reference.local.json found in ${projectRoot}. Create one, then run this again.`
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
    sets: reference.sets
  }));

  report.sets = resolveSets(loaded.config).map((set) => ({
    name: set.name,
    description: set.description,
    references: set.members.map(setMemberKey)
  }));

  for (const set of report.sets) {
    if (set.references.length === 0) {
      report.warnings.push(`Set "${set.description}" has no members. Add folders, git, or packages entries inside it.`);
    }
  }

  const namesByKind = new Map<string, AgentReferenceKind[]>();
  for (const reference of references) {
    namesByKind.set(reference.name, [...(namesByKind.get(reference.name) ?? []), reference.kind]);
  }
  for (const [name, kinds] of namesByKind) {
    if (kinds.length > 1) {
      report.warnings.push(
        `"${name}" is used by ${kinds.join(' and ')} references. Qualify it as ${kinds[0]}:${name} when selecting it.`
      );
    }
  }

  for (const folder of loaded.config.folders) {
    const resolved = resolveFolderPath(projectRoot, folder.path);
    if (!(await pathExists(resolved))) {
      report.warnings.push(`folders.${folder.name} points at ${resolved}, which does not exist.`);
    }

    // The committed file is read on every teammate's machine: a personal path there is a
    // leak, not a preference, so it is an error rather than a warning.
    if (folder.scope !== 'shared') continue;
    if (path.isAbsolute(folder.path) || folder.path.startsWith('~')) {
      report.errors.push(
        `folders.${folder.name} puts the machine path ${folder.path} in the committed config. Move this entry to agent-reference.local.json (gitignored) so personal paths never reach a commit.`
      );
    } else if (folder.path.startsWith('..')) {
      report.warnings.push(
        `folders.${folder.name} escapes the repo (${folder.path}). Fine when the whole team shares that checkout layout; otherwise move it to agent-reference.local.json.`
      );
    }
  }

  if (loaded.config?.allImporters) {
    report.warnings.push(
      'allImporters no longer does anything: every workspace importer is read now, and a name installed at several versions is reported rather than picked. The key can be removed.'
    );
  }

  if (references.length === 0) {
    report.warnings.push('No references are configured yet.');
  }

  report.valid = report.errors.length === 0;
  return report;
}

async function resolveConfigRoot(projectPath: string | null | undefined, cwd: string): Promise<string> {
  try {
    return (await resolveProjectInput(projectPath, cwd)).projectRoot;
  } catch {
    // Validation should work before a project has a lockfile, so fall back to the directory itself.
    const input = path.resolve(cwd, projectPath ?? '.');
    const stat = await fs.stat(input).catch(() => null);
    return stat?.isDirectory() ? input : path.dirname(input);
  }
}

function resolveFolderPath(projectRoot: string, requested: string): string {
  if (requested.startsWith('~/')) return path.join(os.homedir(), requested.slice(2));
  if (path.isAbsolute(requested)) return requested;
  return path.resolve(projectRoot, requested);
}
