import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/**
 * What the agents on this machine did when they had no source, counted off the
 * transcripts they already wrote. This is the question the tool's whole pitch
 * rests on, asked of the reader's own history rather than of a slide: an agent
 * that guesses an export, eats the compiler error and fixes it on the second
 * pass looks like a session that worked, and nobody notices the tax.
 *
 * Nothing leaves the machine and nothing is written. Files are read, counted,
 * and dropped; what comes back is four numbers per store.
 */

/** One thing an agent does when it cannot read the source. */
export type SymptomId = 'guessed' | 'web' | 'build' | 'clone';

export interface Symptom {
  id: SymptomId;
  /** What happened, in the past tense a report is read in. */
  title: string;
  /** What the count is actually matching, for anyone who wants to argue with it. */
  evidence: string;
}

export const SYMPTOMS: Symptom[] = [
  {
    id: 'guessed',
    title: 'guessed an API and had it rejected',
    evidence: 'an export or attribute error came back from a compiler or a runtime',
  },
  {
    id: 'web',
    title: 'went to the web for documentation',
    evidence: 'a web search or fetch tool ran',
  },
  {
    id: 'build',
    title: 'read a published build',
    evidence: 'a file under node_modules/ or dist/ was opened as .js, .mjs, .cjs or .d.ts',
  },
  {
    id: 'clone',
    title: 'cloned a repository into a temp directory',
    evidence: 'a git clone named /tmp or the system temp directory',
  },
];

/**
 * A store of sessions, and how to read the symptoms out of one. Every pattern
 * here is written to hold its match inside a single event: each format writes
 * one per line, so `[^\n]*` is the fence. They are compiled into one alternation
 * per store rather than run one at a time, because a session is scanned once
 * that way and eight times the other, and the difference across a few gigabytes
 * of history is the difference between a command somebody runs and one they
 * gave up on.
 */
interface Harness {
  agent: string;
  /** Relative to home, so a test can point home somewhere else. */
  segments: string[];
  /** Session files, by extension. */
  extension: string;
  /**
   * Sessions are files, unless a store writes one event per file and names the
   * session inside it, which is what this pulls out to group them by.
   */
  sessionKey?: RegExp;
  /** Fold whitespace before matching, for a store that pretty-prints its JSON. */
  flatten?: boolean;
  patterns: Record<SymptomId, string[]>;
}

/** Errors that only a compiler or a runtime says, and only about a name that is not there. */
const GUESSED = [
  'has no exported member',
  'is not exported from',
  'does not provide an export named',
  String.raw`module '[^']+' has no attribute`,
];

/** A clone that lands somewhere nothing will look for it again. */
const CLONE = [String.raw`git clone[^\n]{0,200}(?:/tmp/|/var/folders/|\$TMPDIR)`];

/** A published build, by the extensions a build has and a repository does not. */
const BUILD_FILE = String.raw`(?:node_modules|/dist/)[^"\n]{0,200}\.(?:js|mjs|cjs|d\.ts)`;

/** What a shell tool ran, which is where the other two stores hide a file path. */
const SHELL_BUILD = String.raw`"(?:function_call|custom_tool_call)"[^\n]{0,400}${BUILD_FILE}`;

const HARNESSES: Harness[] = [
  {
    agent: 'claude-code',
    segments: ['.claude', 'projects'],
    extension: '.jsonl',
    patterns: {
      guessed: GUESSED,
      web: ['"name":"Web(?:Fetch|Search)"'],
      build: [String.raw`"file_path":"[^"\n]*${BUILD_FILE}"`],
      clone: CLONE,
    },
  },
  {
    agent: 'codex',
    segments: ['.codex', 'sessions'],
    extension: '.jsonl',
    patterns: {
      guessed: GUESSED,
      web: ['"(?:name|type)":"web_search(?:_call)?"'],
      // The command a shell tool ran is a JSON string inside the event, so the
      // path in it is escaped and there is no field name to anchor on. Requiring
      // the call itself on the same line is what keeps this off a `node_modules`
      // somebody merely talked about.
      build: [SHELL_BUILD],
      clone: CLONE,
    },
  },
  {
    agent: 'opencode',
    segments: ['.local', 'share', 'opencode', 'storage', 'part'],
    extension: '.json',
    sessionKey: /"sessionID":\s*"([^"]+)"/u,
    flatten: true,
    patterns: {
      guessed: GUESSED,
      web: [String.raw`"tool":\s*"(?:webfetch|websearch)"`],
      build: [String.raw`"tool":\s*"(?:read|bash)"[^\n]{0,400}${BUILD_FILE}`],
      clone: CLONE,
    },
  },
];

/**
 * One expression per store, alternating every symptom under its own name, so a
 * single pass says which of them a session shows.
 */
const scanners = new Map<string, RegExp>(
  HARNESSES.map((harness) => [
    harness.agent,
    new RegExp(
      SYMPTOMS.map((symptom) => `(?<${symptom.id}>${harness.patterns[symptom.id].join('|')})`).join(
        '|',
      ),
      'gu',
    ),
  ]),
);

export interface HarnessSymptoms {
  agent: string;
  path: string;
  sessions: number;
  /** Sessions in which each symptom turned up at least once. */
  counts: Record<SymptomId, number>;
  /** Sessions with at least one of them. */
  affected: number;
}

export interface SymptomsReport {
  /** Where the stores were looked for, so an empty report can be argued with. */
  home: string;
  /** The window in days, or null for everything on disk. */
  days: number | null;
  harnesses: HarnessSymptoms[];
  /** Every store that could have been read but was not there. */
  missing: string[];
  sessions: number;
  counts: Record<SymptomId, number>;
  affected: number;
}

export interface SymptomsOptions {
  home?: string;
  days?: number | null;
  /** Sessions read at once. High enough to keep the disk busy, low enough to bound memory. */
  concurrency?: number;
}

const empty = (): Record<SymptomId, number> => ({ guessed: 0, web: 0, build: 0, clone: 0 });

export async function getSymptomsReport(options: SymptomsOptions = {}): Promise<SymptomsReport> {
  const home = options.home ?? os.homedir();
  const days = options.days ?? null;
  const after = days === null ? 0 : Date.now() - days * 24 * 60 * 60 * 1000;
  const concurrency = options.concurrency ?? 32;

  const harnesses: HarnessSymptoms[] = [];
  const missing: string[] = [];
  const total = empty();
  let sessions = 0;
  let affected = 0;

  for (const harness of HARNESSES) {
    const root = path.join(home, ...harness.segments);
    if (!(await exists(root))) {
      missing.push(root);
      continue;
    }

    const files = await sessionFiles(root, harness.extension, after);
    const found = await scan(files, harness, concurrency);

    const counts = empty();
    let hit = 0;
    for (const session of found.values()) {
      let any = false;
      for (const symptom of SYMPTOMS) {
        if (!session.has(symptom.id)) continue;
        counts[symptom.id] += 1;
        total[symptom.id] += 1;
        any = true;
      }
      if (any) hit += 1;
    }

    harnesses.push({
      agent: harness.agent,
      path: root,
      sessions: found.size,
      counts,
      affected: hit,
    });
    sessions += found.size;
    affected += hit;
  }

  return { home, days, harnesses, missing, sessions, counts: total, affected };
}

/**
 * One pass per session. The file is decoded as latin-1 rather than utf-8
 * because every pattern here is ASCII and that decode is a byte map rather than
 * a parse, and the scan stops as soon as a session has shown all four, which
 * for most sessions never happens and for the worst ones happens early.
 */
async function scan(
  files: string[],
  harness: Harness,
  concurrency: number,
): Promise<Map<string, Set<SymptomId>>> {
  const found = new Map<string, Set<SymptomId>>();
  const scanner = scanners.get(harness.agent);
  if (!scanner) return found;

  // A store that writes one event per file has no session until its files are
  // grouped, so every file gets an entry and the key decides what it joins.
  const record = (key: string) => {
    const existing = found.get(key);
    if (existing) return existing;
    const fresh = new Set<SymptomId>();
    found.set(key, fresh);
    return fresh;
  };

  for (let index = 0; index < files.length; index += concurrency) {
    await Promise.all(
      files.slice(index, index + concurrency).map(async (file) => {
        const buffer = await read(file);
        if (buffer === null) return;

        const text = buffer.toString('latin1');
        // A store that pretty-prints one event per file has no line to hold a
        // match inside, so those are folded onto one first. They are small
        // enough that the fold costs nothing worth counting.
        const body = harness.flatten ? text.replaceAll(/\s+/gu, ' ') : text;
        const key = harness.sessionKey ? (harness.sessionKey.exec(body)?.[1] ?? file) : file;
        const seen = record(key);

        // Shared and reset rather than rebuilt: the loop below never awaits, so
        // nothing else can be part way through this expression while it runs.
        scanner.lastIndex = 0;
        for (let match = scanner.exec(body); match !== null; match = scanner.exec(body)) {
          for (const symptom of SYMPTOMS) {
            if (match.groups?.[symptom.id] !== undefined) seen.add(symptom.id);
          }
          if (seen.size === SYMPTOMS.length) break;
        }
      }),
    );
  }

  return found;
}

async function read(file: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(file);
  } catch {
    return null;
  }
}

/** Every session under a store, filtered by age before anything is opened. */
async function sessionFiles(root: string, extension: string, after: number): Promise<string[]> {
  const files: string[] = [];

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth === 0) return;
    const children = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const child of children) {
      const target = path.join(dir, child.name);
      if (child.isDirectory()) {
        await walk(target, depth - 1);
        continue;
      }
      if (!child.name.endsWith(extension)) continue;
      if (after > 0) {
        const stat = await fs.stat(target).catch(() => null);
        if (!stat || stat.mtimeMs < after) continue;
      }
      files.push(target);
    }
  }

  await walk(root, 6);
  return files;
}

const exists = (target: string) =>
  fs
    .stat(target)
    .then(() => true)
    .catch(() => false);
