import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { loadAgentReferenceConfig } from './config.ts';
import { pathExists } from './fs-utils.ts';
import { configuredReferences, resolveReferenceGroups } from './groups.ts';
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
    groups: string[];
  }>;
  groups: Array<{ name: string; description: string | null; references: string[] }>;
}

/**
 * Checks an agent-reference config on its own terms: no lockfile, network, or clone needed,
 * so an agent can write the JSON and confirm the shape before anything else runs.
 */
export async function validateConfig(
  projectPath: string | null | undefined,
  options: { cwd?: string; configFile?: string | null } = {}
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
    groups: []
  };

  let loaded;
  try {
    loaded = await loadAgentReferenceConfig(projectRoot, { configFile: options.configFile });
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
    groups: reference.groups
  }));

  try {
    report.groups = resolveReferenceGroups(loaded.config).map((group) => ({
      name: group.name,
      description: group.description,
      references: group.members.map((member) => `${member.kind}:${member.name}`)
    }));
  } catch (error) {
    report.errors.push(error instanceof Error ? error.message : String(error));
    return report;
  }

  for (const group of report.groups) {
    if (group.references.length === 0) {
      report.warnings.push(`Group "${group.name}" has no members. Add "groups": ["${group.name}"] to a reference.`);
    }
  }

  const namesByKind = new Map<string, AgentReferenceKind[]>();
  for (const reference of references) {
    namesByKind.set(reference.name, [...(namesByKind.get(reference.name) ?? []), reference.kind]);
  }
  for (const [name, kinds] of namesByKind) {
    if (kinds.length > 1) {
      report.warnings.push(
        `"${name}" is used by ${kinds.join(' and ')} references. Qualify it as ${kinds[0]}:${name} in group membership.`
      );
    }
  }

  for (const folder of loaded.config.folders) {
    const resolved = resolveFolderPath(projectRoot, folder.path);
    if (!(await pathExists(resolved))) {
      report.warnings.push(`folders.${folder.name} points at ${resolved}, which does not exist.`);
    }
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
