import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { sanitizeRelayedLine } from './text-utils.ts';

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
export type FindingId = 'guessed' | 'web' | 'build' | 'clone';

export interface Finding {
  id: FindingId;
  /** What happened, in the past tense a report is read in. */
  title: string;
  /** What the count is actually matching, for anyone who wants to argue with it. */
  evidence: string;
}

export const FINDINGS: Finding[] = [
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
 * A store of sessions, and how to read the findings out of one. Every pattern
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
  /**
   * The variable this store honors ahead of home, when it honors one. Read from
   * the environment rather than assumed, since the default below is only where
   * the store lands when nothing has moved it.
   */
  dataHome?: string;
  /** Session files, by extension. */
  extension: string;
  /**
   * Sessions are files, unless a store writes one event per file and names the
   * session inside it, which is what this pulls out to group them by.
   */
  sessionKey?: RegExp;
  /** Fold whitespace before matching, for a store that pretty-prints its JSON. */
  flatten?: boolean;
  patterns: Record<FindingId, string[]>;
}

/** Errors that only a compiler or a runtime says, and only about a name that is not there. */
const GUESSED = [
  'has no exported member',
  'is not exported from',
  'does not provide an export named',
  String.raw`module '[^']+' has no attribute`,
];

/** A clone that lands somewhere nothing will look for it again. */
const CLONE = [String.raw`git clone[^\n]{0,200}(?:/tmp/|/var/folders/|\$TMPDIR|[\\/]Temp[\\/])`];

/** A published build, by the extensions a build has and a repository does not. */
const BUILD_FILE = String.raw`(?:node_modules|[\\/]dist[\\/])[^"\n]{0,200}\.(?:js|mjs|cjs|d\.ts)`;

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
    dataHome: 'XDG_DATA_HOME',
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
      FINDINGS.map((finding) => `(?<${finding.id}>${harness.patterns[finding.id].join('|')})`).join(
        '|',
      ),
      'gu',
    ),
  ]),
);

/**
 * One line out of the reader's own history, under the count it belongs to. A
 * number invites an argument and a line the reader recognizes ends one, and it
 * is also the only way to see a match that should not have counted: nothing
 * here can tell a session that read a bundle from one that wrote a page about
 * reading bundles, and the line says which it was.
 */
export interface Evidence {
  /** What the agent did, in as few characters as still name it. */
  text: string;
  /** Which store it came out of. */
  agent: string;
  /** When that session was last written, which is how the newest one wins. */
  at: number;
}

/** What a match looks like once it is worth printing. */
interface Extractor {
  /** The field the detail lives in, tried in order. */
  fields?: RegExp[];
  /** Failing that, the match itself, widened to the thing it sits in. */
  sentence?: boolean;
}

const EXTRACTORS: Record<FindingId, Extractor> = {
  guessed: { sentence: true },
  web: { fields: [/"url":\s*"([^"]{4,200})"/u, /"query":\s*"([^"]{2,200})"/u] },
  build: {
    fields: [
      /"file_path":\s*"([^"]+)"/u,
      new RegExp(
        String.raw`((?:[\w@./+-]*)?(?:node_modules|/dist/)[^"'\s\\]{0,200}\.(?:js|mjs|cjs|d\.ts))`,
        'u',
      ),
    ],
  },
  // The quote has to carry the temp directory, the way the count did: a bare
  // `git clone` on its own is as likely to be a sentence about one.
  clone: { fields: [/(git clone[^"'\n\\]{0,160}(?:\/tmp\/|\/var\/folders\/)[^\s"'\\]{0,40})/u] },
};

/**
 * A quote that is markup rather than a session. Nothing here can tell a session
 * that read a bundle from one that wrote a page about reading bundles, and the
 * second kind reads as garbage under a count, so it is passed over in favour of
 * the next match. The count still stands: something in that session said it.
 */
const MARKUP = /[<>]|&#\d|&[a-z]{2,8};/u;

/**
 * A quote that is a pattern rather than a thing that happened. A session spent
 * writing a matcher for these failures contains every phrase they are made of,
 * and this repository's own history is full of them.
 */
const PATTERN_SYNTAX = /\[\^|\{\d+,|\\\\[dswn]|\(\?:/u;

/** Real output from a compiler or a runtime says which thing, and says it with a colon. */
const REAL_ERROR = /error|Error|cannot|Cannot|:/u;

/** The harness's own name for the tool, so the line reads the way that harness prints it. */
const TOOL_NAME = /"(?:name|tool)":\s*"([A-Za-z_][\w-]{0,40})"/u;

export interface HarnessFindings {
  agent: string;
  path: string;
  sessions: number;
  /** Sessions in which each symptom turned up at least once. */
  counts: Record<FindingId, number>;
  /** Sessions with at least one of them. */
  affected: number;
}

export interface AuditReport {
  /** Where the stores were looked for, so an empty report can be argued with. */
  home: string;
  /** The window in days, or null for everything on disk. */
  days: number | null;
  harnesses: HarnessFindings[];
  /** Every store that could have been read but was not there. */
  missing: string[];
  sessions: number;
  counts: Record<FindingId, number>;
  affected: number;
  /** The most recent line that counted, one per symptom. */
  evidence: Partial<Record<FindingId, Evidence>>;
}

export interface AuditOptions {
  home?: string;
  /**
   * Called once the stores have been walked and then as sessions are read, for
   * a caller with somewhere to draw. Reading a few gigabytes takes seconds and
   * a command that prints nothing for that long reads as one that hung.
   */
  progress?: (done: number, total: number) => void;
  /** Only for the variable a store may be moved by. Tests pass their own. */
  env?: NodeJS.ProcessEnv;
  days?: number | null;
  /** Sessions read at once. High enough to keep the disk busy, low enough to bound memory. */
  concurrency?: number;
}

const empty = (): Record<FindingId, number> => ({ guessed: 0, web: 0, build: 0, clone: 0 });

/**
 * Where a store is, which is under home unless the store reads a variable that
 * says otherwise. The segments are joined rather than written as a path, so the
 * separator is the one this machine uses: two of these stores are in the same
 * place on Windows, under a home directory that is spelled differently.
 */
function storeRoot(harness: Harness, home: string, env: NodeJS.ProcessEnv): string {
  const moved = harness.dataHome ? env[harness.dataHome] : undefined;
  if (!moved) return path.join(home, ...harness.segments);
  // The variable replaces the part of the path it stands for, which is the
  // `.local/share` in front of the store's own directories.
  return path.join(moved, ...harness.segments.slice(2));
}

/** How far around a match the event it belongs to is looked for. */
const EVENT_WINDOW = 600;

/** One line in a terminal, minus the indent the report prints it under. */
const MAX_QUOTE = 68;

/** A session file and when it was last written, which is what ranks the quotes. */
interface Session {
  file: string;
  at: number;
}

export async function getAuditReport(options: AuditOptions = {}): Promise<AuditReport> {
  const home = options.home ?? os.homedir();
  const days = options.days ?? null;
  const after = days === null ? 0 : Date.now() - days * 24 * 60 * 60 * 1000;
  const concurrency = options.concurrency ?? 32;

  const harnesses: HarnessFindings[] = [];
  const missing: string[] = [];
  const evidence: Partial<Record<FindingId, Evidence>> = {};
  const tally = empty();
  let sessions = 0;
  let affected = 0;

  // Walked first, all of them, so the progress below counts against a total
  // rather than against whatever has been discovered so far.
  const stores: Array<{ harness: Harness; root: string; files: Session[] }> = [];
  for (const harness of HARNESSES) {
    const root = storeRoot(harness, home, options.env ?? process.env);
    if (!(await exists(root))) {
      missing.push(root);
      continue;
    }
    stores.push({ harness, root, files: await sessionFiles(root, harness.extension, after) });
  }

  const total = stores.reduce((sum, store) => sum + store.files.length, 0);
  let read = 0;
  options.progress?.(0, total);

  for (const { harness, root, files } of stores) {
    const found = await scan(files, harness, concurrency, evidence, (done) => {
      options.progress?.(read + done, total);
    });
    read += files.length;

    const counts = empty();
    let hit = 0;
    for (const session of found.values()) {
      let any = false;
      for (const finding of FINDINGS) {
        if (!session.has(finding.id)) continue;
        counts[finding.id] += 1;
        tally[finding.id] += 1;
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

  return { home, days, harnesses, missing, sessions, counts: tally, affected, evidence };
}

/**
 * One pass per session. The file is decoded as latin-1 rather than utf-8
 * because every pattern here is ASCII and that decode is a byte map rather than
 * a parse, and the scan stops as soon as a session has shown all four, which
 * for most sessions never happens and for the worst ones happens early.
 */
async function scan(
  files: Session[],
  harness: Harness,
  concurrency: number,
  evidence: Partial<Record<FindingId, Evidence>>,
  progress: (done: number) => void,
): Promise<Map<string, Set<FindingId>>> {
  const found = new Map<string, Set<FindingId>>();
  const scanner = scanners.get(harness.agent);
  if (!scanner) return found;

  // A store that writes one event per file has no session until its files are
  // grouped, so every file gets an entry and the key decides what it joins.
  const record = (key: string) => {
    const existing = found.get(key);
    if (existing) return existing;
    const fresh = new Set<FindingId>();
    found.set(key, fresh);
    return fresh;
  };

  for (let index = 0; index < files.length; index += concurrency) {
    await Promise.all(
      files.slice(index, index + concurrency).map(async (session) => {
        const buffer = await read(session.file);
        if (buffer === null) return;

        const text = buffer.toString('latin1');
        // A store that pretty-prints one event per file has no line to hold a
        // match inside, so those are folded onto one first. They are small
        // enough that the fold costs nothing worth counting.
        const body = harness.flatten ? text.replaceAll(/\s+/gu, ' ') : text;
        const key = harness.sessionKey
          ? (harness.sessionKey.exec(body)?.[1] ?? session.file)
          : session.file;
        const seen = record(key);
        const quoted = new Set<FindingId>();

        // Shared and reset rather than rebuilt: the loop below never awaits, so
        // nothing else can be part way through this expression while it runs.
        scanner.lastIndex = 0;
        for (let match = scanner.exec(body); match !== null; match = scanner.exec(body)) {
          for (const finding of FINDINGS) {
            if (match.groups?.[finding.id] === undefined) continue;
            seen.add(finding.id);
            // The newest session that can produce a readable line wins, and a
            // match that quotes as markup does not end the search inside this
            // one: the next match may be the session actually doing the thing.
            if (quoted.has(finding.id) || (evidence[finding.id]?.at ?? 0) >= session.at) continue;
            const line = quote(finding.id, body, match.index);
            if (line === null) continue;
            evidence[finding.id] = { text: line, agent: harness.agent, at: session.at };
            quoted.add(finding.id);
          }
          if (seen.size === FINDINGS.length && quoted.size === FINDINGS.length) break;
        }
      }),
    );
    progress(Math.min(index + concurrency, files.length));
  }

  return found;
}

/**
 * The one line printed under a count. What an agent actually did is in the
 * event around the match rather than in the match itself, so the window is
 * widened to that event and the detail read out of the field it belongs in.
 * The result is sanitized before anything prints it: this is text the machine
 * read from somewhere else, and it is about to be relayed.
 */
function quote(id: FindingId, body: string, at: number): string | null {
  const window = body.slice(Math.max(0, at - EVENT_WINDOW), at + EVENT_WINDOW);
  const extractor = EXTRACTORS[id];

  for (const field of extractor.fields ?? []) {
    const value = field.exec(window)?.[1];
    if (!value) continue;
    const detail = shorten(unescape(value));
    if (MARKUP.test(detail) || PATTERN_SYNTAX.test(detail)) return null;
    const tool = TOOL_NAME.exec(window)?.[1];
    return tool ? `${tool}(${detail})` : detail;
  }

  if (!extractor.sentence) return null;
  const line = shorten(unescape(sentence(body, at)), MAX_QUOTE);
  if (line === '' || MARKUP.test(line) || PATTERN_SYNTAX.test(line)) return null;
  return REAL_ERROR.test(line) ? line : null;
}

/** The match, widened to the line it sits on, in a format that escapes its newlines. */
function sentence(body: string, at: number): string {
  const window = body.slice(Math.max(0, at - EVENT_WINDOW), at + EVENT_WINDOW);
  const middle = Math.min(at, EVENT_WINDOW);
  const before = window.slice(0, middle);
  const after = window.slice(middle);
  // A transcript writes its newlines escaped, so a boundary is two characters
  // there and one here, and the slice has to skip whichever it found.
  const escaped = before.lastIndexOf('\\n');
  const literal = Math.max(before.lastIndexOf('\n'), before.lastIndexOf('"'));
  const start = escaped > literal ? escaped + 2 : literal + 1;
  const breaks = [after.indexOf('\\n'), after.indexOf('\n'), after.indexOf('"')].filter(
    (index) => index >= 0,
  );
  const end = breaks.length > 0 ? Math.min(...breaks) : after.length;
  return `${before.slice(start)}${after.slice(0, end)}`;
}

/** JSON escapes, undone far enough to read. Nothing here is parsed as JSON. */
const unescape = (value: string) =>
  value
    .replaceAll(String.raw`\"`, '"')
    .replaceAll(String.raw`\\`, '\\')
    .replaceAll(String.raw`\/`, '/');

/**
 * Long enough to recognize, short enough for one line. A path is cut from the
 * front, since the end of it is the part that names anything.
 */
function shorten(value: string, limit = MAX_QUOTE): string {
  // Sessions are read as latin-1, so anything the harness wrote outside ASCII
  // arrives here as mojibake. It is dropped rather than printed: none of it is
  // part of what the agent did, and all of it looks like a bug in this.
  const clean = sanitizeRelayedLine(value.replaceAll(/[^\u0020-\u007e]/gu, '')).trim();
  if (clean.length <= limit) return clean;
  // A path is cut from the front, since the end of it is the part that names
  // anything. A sentence is cut from the end, since the front of that is.
  const isPath = !clean.includes(' ') && clean.includes('/');
  return isPath ? `…${clean.slice(clean.length - limit + 1)}` : `${clean.slice(0, limit - 1)}…`;
}

async function read(file: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(file);
  } catch {
    return null;
  }
}

/**
 * Every session under a store, with when it was last written, filtered by age
 * before anything is opened and newest first: the line quoted under a count
 * should be the most recent one, which is the one a reader still remembers.
 */
async function sessionFiles(root: string, extension: string, after: number): Promise<Session[]> {
  const files: Session[] = [];

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
      const stat = await fs.stat(target).catch(() => null);
      if (!stat) continue;
      if (after > 0 && stat.mtimeMs < after) continue;
      files.push({ file: target, at: stat.mtimeMs });
    }
  }

  await walk(root, 6);
  return files.toSorted((left, right) => right.at - left.at);
}

const exists = (target: string) =>
  fs
    .stat(target)
    .then(() => true)
    .catch(() => false);
