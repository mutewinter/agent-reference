import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  configuredReferences,
  DEFAULT_CONFIG_FILE,
  DEFAULT_LOCAL_CONFIG_FILE,
  loadAgentReferenceConfig,
} from './config.ts';
import { pathExists } from './fs-utils.ts';
import { runGit } from './git.ts';
import { resolveProjectInput, scanResolvedProject } from './scanner.ts';
import type { PackageManager } from './types.ts';

export interface InstructionFile {
  /** Project-relative, which is how the brief names it. */
  file: string;
  /** Where a symlink lands, so `CLAUDE.md -> AGENTS.md` earns one edit and not two. */
  linkTarget: string | null;
  mentionsAgentReference: boolean;
}

export interface SkillInstall {
  /** Directories already holding the skill. */
  installed: string[];
  /** Where one could go, machine-wide first: it covers every project at once. */
  candidates: string[];
  /** The skill shipped inside this installation, to copy from. */
  source: string | null;
}

export type TranscriptFormat = 'jsonl' | 'json' | 'sqlite' | 'markdown';

export interface TranscriptStore {
  agent: string;
  path: string;
  format: TranscriptFormat;
  /** Session files found, or 1 for a single-file history: enough to judge whether mining is worth it. */
  sessions: number;
}

export interface InitSurvey {
  projectRoot: string;
  /** Where the machine-wide probes looked, so the brief can say so when they find nothing. */
  home: string;
  configPath: string | null;
  localConfigPath: string | null;
  referenceCount: number;
  lockfilePath: string | null;
  packageManager: PackageManager;
  dependencyCount: number;
  gitRepository: boolean;
  localConfigIgnored: boolean;
  /** Already in git's index, so .gitignore cannot help and the file needs untracking. */
  localConfigTracked: boolean;
  instructionFiles: InstructionFile[];
  /** One entry per distinct file on disk, symlinks collapsed onto their target. */
  editTargets: string[];
  skill: SkillInstall;
  transcriptStores: TranscriptStore[];
}

export interface SurveyProjectOptions {
  cwd?: string;
  /** Home directory probed for machine-wide skills and transcript stores. Tests point this at a temp dir. */
  home?: string;
}

const INSTRUCTION_CANDIDATES = [
  'AGENTS.md',
  'CLAUDE.md',
  'GEMINI.md',
  '.cursorrules',
  '.cursor/rules',
  '.github/copilot-instructions.md',
  '.windsurfrules',
  '.clinerules',
];

const PROJECT_SKILL_DIRS = ['.agents/skills/agent-reference', '.claude/skills/agent-reference'];

/**
 * Everything `init` can know without asking anyone: what this project already declares,
 * what would make the tool discoverable here, and where this machine keeps agent
 * transcripts. Reads only; `init` never writes, and never touches the network.
 */
export async function surveyProject(
  projectPath: string | null | undefined,
  options: SurveyProjectOptions = {},
): Promise<InitSurvey> {
  const cwd = options.cwd ?? process.cwd();
  const home = options.home ?? os.homedir();
  const project = await resolveProjectInput(projectPath, cwd);
  const { projectRoot } = project;

  const loaded = await loadAgentReferenceConfig(projectRoot).catch(() => null);
  // A config too broken to parse still counts as present: the brief must say "repair"
  // rather than "create", or the agent overwrites work someone did deliberately.
  const configPath = (await pathExists(path.join(projectRoot, DEFAULT_CONFIG_FILE)))
    ? path.join(projectRoot, DEFAULT_CONFIG_FILE)
    : null;
  const localConfigPath = (await pathExists(path.join(projectRoot, DEFAULT_LOCAL_CONFIG_FILE)))
    ? path.join(projectRoot, DEFAULT_LOCAL_CONFIG_FILE)
    : null;

  const dependencies = await scanResolvedProject(project).catch(() => []);
  const gitRepository =
    (
      await runGit(['-C', projectRoot, 'rev-parse', '--is-inside-work-tree'], {
        allowFailure: true,
      })
    ).exitCode === 0;
  const localConfigIgnored = gitRepository
    ? await isIgnored(projectRoot, DEFAULT_LOCAL_CONFIG_FILE)
    : false;
  const localConfigTracked = gitRepository
    ? await isTracked(projectRoot, DEFAULT_LOCAL_CONFIG_FILE)
    : false;

  const instructionFiles = await findInstructionFiles(projectRoot);

  return {
    projectRoot,
    home,
    configPath,
    localConfigPath,
    referenceCount: configuredReferences(loaded?.config).length,
    lockfilePath: project.lockfilePath,
    packageManager: project.packageManager,
    dependencyCount: dependencies.length,
    gitRepository,
    localConfigIgnored,
    localConfigTracked,
    instructionFiles,
    editTargets: editTargets(instructionFiles),
    skill: await findSkill(projectRoot, home),
    transcriptStores: await findTranscriptStores(projectRoot, home),
  };
}

async function isIgnored(projectRoot: string, file: string): Promise<boolean> {
  const result = await runGit(['-C', projectRoot, 'check-ignore', '-q', '--', file], {
    allowFailure: true,
  });
  return result.exitCode === 0;
}

/**
 * Asked separately from `isIgnored` because git excludes tracked files from `check-ignore`:
 * a file already committed reports as not ignored, and the obvious remedy of adding it to
 * .gitignore does nothing at all. Only the index says whether it is being committed.
 */
async function isTracked(projectRoot: string, file: string): Promise<boolean> {
  const result = await runGit(['-C', projectRoot, 'ls-files', '--', file], { allowFailure: true });
  return result.exitCode === 0 && result.stdout.trim().length > 0;
}

async function findInstructionFiles(projectRoot: string): Promise<InstructionFile[]> {
  // The root is resolved too, or a link target under a symlinked ancestor (/var on macOS,
  // any project reached through a symlink) renders as a chain of `..` instead of a name.
  const realRoot = await fs.realpath(projectRoot).catch(() => projectRoot);
  const found: InstructionFile[] = [];

  for (const candidate of INSTRUCTION_CANDIDATES) {
    const full = path.join(projectRoot, candidate);
    const stat = await fs.lstat(full).catch(() => null);
    if (!stat) continue;

    const real = await fs.realpath(full).catch(() => full);
    found.push({
      file: candidate,
      linkTarget: stat.isSymbolicLink() ? path.relative(realRoot, real) : null,
      mentionsAgentReference: await mentionsAgentReference(real, INSTRUCTION_SCAN_DEPTH, {
        left: INSTRUCTION_SCAN_FILES,
      }),
    });
  }

  return found;
}

/**
 * Bounded the way the transcript count is, and for the same reason: `.cursor/rules` is a
 * directory, a symlink inside one points anywhere, and `init` describes a project rather
 * than searching a machine. A rule that names the tool is near the top or it does not count.
 */
const INSTRUCTION_SCAN_DEPTH = 3;
const INSTRUCTION_SCAN_FILES = 200;
const SESSION_SCAN_FILES = 5000;

async function mentionsAgentReference(
  target: string,
  depth: number,
  /** One counter for the whole walk, decremented by every level below this one. */
  budget: { left: number },
): Promise<boolean> {
  if (depth === 0 || budget.left <= 0) return false;

  const stat = await fs.stat(target).catch(() => null);
  if (!stat) return false;

  if (stat.isDirectory()) {
    const children = await fs.readdir(target).catch(() => []);
    for (const child of children) {
      if (budget.left <= 0) break;
      if (await mentionsAgentReference(path.join(target, child), depth - 1, budget)) return true;
    }
    return false;
  }

  budget.left -= 1;
  const contents = await fs.readFile(target, 'utf8').catch(() => '');
  return contents.includes('agent-reference');
}

/**
 * Two names for one file is one edit. Symlinked instruction files are common enough that
 * writing the same line twice would be the default mistake without this.
 */
function editTargets(files: InstructionFile[]): string[] {
  const byTarget = new Map<string, string>();

  for (const file of files) {
    const key = file.linkTarget ?? file.file;
    if (!byTarget.has(key)) byTarget.set(key, file.linkTarget ?? file.file);
  }

  return [...byTarget.values()];
}

async function findSkill(projectRoot: string, home: string): Promise<SkillInstall> {
  const machineWide = path.join(home, '.claude', 'skills', 'agent-reference');
  const inProject = PROJECT_SKILL_DIRS.map((relative) => path.join(projectRoot, relative));
  const candidates = [machineWide, ...inProject];
  const installed: string[] = [];

  for (const candidate of candidates) {
    if (await pathExists(candidate)) installed.push(candidate);
  }

  const shipped = fileURLToPath(new URL('../skills/agent-reference', import.meta.url));

  return {
    installed,
    candidates,
    source: (await pathExists(shipped)) ? shipped : null,
  };
}

/**
 * Known transcript locations, probed rather than assumed: only a directory that exists is
 * reported, so a stale entry here costs nothing and a missing one is recoverable, since
 * the brief tells the agent to check its own knowledge when this comes back empty.
 */
async function findTranscriptStores(projectRoot: string, home: string): Promise<TranscriptStore[]> {
  const dataHome = process.env.XDG_DATA_HOME ?? path.join(home, '.local', 'share');
  const candidates: Array<{ agent: string; format: TranscriptFormat; path: string }> = [
    { agent: 'claude-code', format: 'jsonl', path: path.join(home, '.claude', 'projects') },
    { agent: 'codex', format: 'jsonl', path: path.join(home, '.codex', 'sessions') },
    { agent: 'gemini-cli', format: 'json', path: path.join(home, '.gemini', 'tmp') },
    { agent: 'opencode', format: 'json', path: path.join(dataHome, 'opencode', 'storage') },
    { agent: 'aider', format: 'markdown', path: path.join(projectRoot, '.aider.chat.history.md') },
  ];

  const appData = appDataDir(home);
  if (appData) {
    candidates.push({
      agent: 'cursor',
      format: 'sqlite',
      path: path.join(appData, 'Cursor', 'User', 'workspaceStorage'),
    });
  }

  const stores: TranscriptStore[] = [];
  for (const candidate of candidates) {
    const stat = await fs.stat(candidate.path).catch(() => null);
    if (!stat) continue;
    const sessions = stat.isDirectory()
      ? await countFiles(candidate.path, 4, { left: SESSION_SCAN_FILES })
      : 1;
    stores.push({ ...candidate, sessions });
  }

  return stores;
}

/**
 * Sessions, not top-level directories. Every store nests them at least one level down, so a
 * directory count reports "1" for a history of twenty conversations and reads as nothing to
 * mine. Bounded in both depth and total, since these trees grow without limit.
 */
async function countFiles(dir: string, depth: number, budget: { left: number }): Promise<number> {
  if (depth === 0 || budget.left <= 0) return 0;

  const children = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  let count = 0;

  for (const child of children) {
    if (budget.left <= 0) break;
    if (child.isDirectory()) {
      count += await countFiles(path.join(dir, child.name), depth - 1, budget);
    } else {
      budget.left -= 1;
      count += 1;
    }
  }

  return count;
}

function appDataDir(home: string): string | null {
  if (process.platform === 'darwin') return path.join(home, 'Library', 'Application Support');
  if (process.platform === 'win32') return process.env.APPDATA ?? null;
  return process.env.XDG_CONFIG_HOME ?? path.join(home, '.config');
}
