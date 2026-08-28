import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { pathExists } from './fs-utils.ts';

export interface SkillInstall {
  /** Directories already holding the skill. */
  installed: string[];
  /** Where one could go, machine-wide first: it covers every project at once. */
  candidates: string[];
  /** The skill shipped inside this installation, to copy from. */
  source: string | null;
}

export type SkillCopyState = 'current' | 'stale' | 'unreadable';

export interface SkillCopy {
  /** The directory holding SKILL.md. */
  path: string;
  state: SkillCopyState;
}

export interface SkillCheck {
  /** The skill this installation ships, or null when the package layout has none. */
  source: string | null;
  copies: SkillCopy[];
}

/** Where a project keeps a skill, in the order a project is searched. */
const PROJECT_SKILL_DIRS = ['.agents/skills/agent-reference', '.claude/skills/agent-reference'];

const SKILL_FILE = 'SKILL.md';

/** The skill this installation ships, which is the one the guide describes. */
export function shippedSkillDir(): string {
  return fileURLToPath(new URL('../skills/agent-reference', import.meta.url));
}

/**
 * Every directory the skill could be installed in, machine-wide first because it covers
 * every project at once, and the ones that hold it today.
 */
export async function findSkill(projectRoot: string, home: string): Promise<SkillInstall> {
  const machineWide = path.join(home, '.claude', 'skills', 'agent-reference');
  const candidates = [
    machineWide,
    ...PROJECT_SKILL_DIRS.map((relative) => path.join(projectRoot, relative)),
  ];
  const installed: string[] = [];
  for (const candidate of candidates) {
    if (await pathExists(candidate)) installed.push(candidate);
  }

  const shipped = shippedSkillDir();
  return { installed, candidates, source: (await pathExists(shipped)) ? shipped : null };
}

/**
 * Line endings and a trailing newline are how a file was written, not what it says. A copy
 * checked out on Windows differs from the shipped bytes in every line and from its own
 * source in none, and reporting that as drift would train a reader to ignore the report.
 */
function digest(text: string): string {
  return createHash('sha256').update(text.replaceAll('\r\n', '\n').trimEnd(), 'utf8').digest('hex');
}

async function readSkill(directory: string): Promise<string | null> {
  return fs.readFile(path.join(directory, SKILL_FILE), 'utf8').catch(() => null);
}

/**
 * Whether each installed copy still says what this version ships.
 *
 * A skill is copied into a project once and nothing updates it, so an upgrade that reworded
 * the guidance leaves every earlier copy asserting the old wording with nothing to say so.
 * `guide` solves this for the instructions that live in the CLI; the copy on disk is the
 * half that cannot print itself, so it is compared instead.
 */
export async function checkSkill(projectRoot: string, home: string): Promise<SkillCheck> {
  const install = await findSkill(projectRoot, home);
  const shippedText = install.source ? await readSkill(install.source) : null;
  const shippedDigest = shippedText === null ? null : digest(shippedText);

  const copies: SkillCopy[] = [];
  for (const directory of install.installed) {
    const text = await readSkill(directory);
    copies.push({
      path: directory,
      // Without a shipped copy to compare against there is no claim to make. Saying
      // "stale" from a build that cannot read its own skill would be a guess.
      state:
        text === null
          ? 'unreadable'
          : shippedDigest === null || digest(text) === shippedDigest
            ? 'current'
            : 'stale',
    });
  }

  return { source: install.source, copies };
}
