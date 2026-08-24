import path from 'node:path';

import type { AgentReferenceConfig, ProblemSeverity } from './types.ts';

/**
 * A path in the committed config that does not mean the same thing on someone else's
 * machine. Held as summary and fix separately because `validate` joins them into one line
 * and `status` reports them as problems with the two fields apart.
 */
export interface CommittedPathLeak {
  /** `path:notes`, `git:internal`, or null for a top-level key. */
  reference: string | null;
  severity: ProblemSeverity;
  summary: string;
  fix: string;
}

// Says "move", and says it twice, because the note printed under a problem list tells the
// reader not to delete references. The reference is kept; only the file holding it changes.
const MOVE_FIX =
  'Move this entry to agent-reference.local.json (gitignored): declare it there, then remove it here. The reference survives; the personal path never reaches a commit.';
const ESCAPE_FIX =
  'Fine when the whole team shares that checkout layout; otherwise move it to agent-reference.local.json.';

/**
 * Every path-bearing field in the committed config, checked by what the value means rather
 * than by which key holds it: a repo-relative path is shareable and belongs there, while
 * a home path is a leak whichever key it sits under. Pure string work over a config that is
 * already loaded, so both `validate` and `status` can run it without touching the disk.
 */
export function committedPathLeaks(config: AgentReferenceConfig): CommittedPathLeak[] {
  const leaks: CommittedPathLeak[] = [];

  for (const reference of config.paths) {
    if (reference.scope === 'local') continue;
    const verdict = classifyConfiguredPath(reference.path);
    if (verdict === 'machine') {
      leaks.push({
        reference: `path:${reference.name}`,
        severity: 'error',
        summary: `paths.${reference.name} puts the machine path ${reference.path} in the committed config.`,
        fix: MOVE_FIX
      });
    } else if (verdict === 'escapes') {
      leaks.push({
        reference: `path:${reference.name}`,
        severity: 'warning',
        summary: `paths.${reference.name} escapes the repo (${reference.path}).`,
        fix: ESCAPE_FIX
      });
    }
  }

  // A `file:` repository is a machine path wearing a git costume: it clones from disk, so
  // it travels no better than a path reference does.
  for (const reference of config.git) {
    if (reference.scope === 'local') continue;
    const local = localRepositoryPath(reference.repository);
    if (local === null) continue;

    const verdict = classifyConfiguredPath(local);
    if (verdict === 'machine') {
      leaks.push({
        reference: `git:${reference.name}`,
        severity: 'error',
        summary: `git.${reference.name} points at the machine path ${reference.repository} in the committed config.`,
        fix: MOVE_FIX
      });
    } else if (verdict === 'escapes') {
      leaks.push({
        reference: `git:${reference.name}`,
        severity: 'warning',
        summary: `git.${reference.name} escapes the repo (${reference.repository}).`,
        fix: ESCAPE_FIX
      });
    }
  }

  // A relative cacheDir still resolves the same everywhere, so only a machine path is wrong.
  if (config.cacheDir && config.cacheDirScope !== 'local' && classifyConfiguredPath(config.cacheDir) === 'machine') {
    leaks.push({
      reference: null,
      severity: 'error',
      summary: `cacheDir puts the machine path ${config.cacheDir} in the committed config.`,
      fix: 'Move it to agent-reference.local.json, or drop it and set AGENT_REFERENCE_STORE_DIR instead, so personal paths never reach a commit.'
    });
  }

  return leaks;
}

type PathVerdict = 'machine' | 'escapes' | 'portable';

/**
 * `C:\...` and `\\server\share` are absolute on Windows and nowhere else, so
 * `path.isAbsolute` calls them relative on the Linux host running CI. Spelled out here
 * because the check has to reach the same verdict wherever `validate` runs, or a machine
 * path committed from Windows passes the gate that exists to catch it.
 */
const WINDOWS_ABSOLUTE = /^(?:[A-Za-z]:[\\/]|\\\\)/;

function classifyConfiguredPath(value: string): PathVerdict {
  if (value.startsWith('~')) return 'machine';
  if (path.isAbsolute(value) || WINDOWS_ABSOLUTE.test(value)) return 'machine';

  const normalized = value.replace(/\\/g, '/');
  if (normalized === '..' || normalized.startsWith('../')) return 'escapes';
  return 'portable';
}

/** The path inside a repository spec that clones from disk, or null for a remote URL. */
function localRepositoryPath(repository: string): string | null {
  if (repository.startsWith('file://')) return repository.slice('file://'.length);
  if (repository.startsWith('file:')) return repository.slice('file:'.length);
  if (repository.startsWith('~') || path.isAbsolute(repository)) return repository;
  return null;
}
