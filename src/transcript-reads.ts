import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { sessionFiles, transcriptStores, type Session } from './audit.ts';
import { loadAgentReferenceConfig, referencesOfKind } from './config.ts';
import { resolveReferencePath } from './fs-utils.ts';
import { defaultStoreDir, resolveStoreDir } from './git.ts';
import { resolveProjectInput } from './scanner.ts';

/**
 * What agents read out of references, counted off the transcripts their harnesses already
 * wrote. The usage log sees a `get` and nothing after it; the reading that `get` is for happens
 * in the agent's own tools, against the path it printed, and only the transcript saw that.
 *
 * A call counts when it reads, searches, lists, or asks git about a path inside a reference:
 * a checkout under the store's `src/`, or a local path the session's project declares, unless
 * that path is the project itself. Its size is the size of the result the agent got back, so
 * "lines read" means lines that entered the agent's context. Nothing is written and nothing
 * leaves the machine; files are read, counted, and dropped.
 */

export interface TranscriptStoreReads {
  agent: string;
  path: string;
  sessions: number;
  bytes: number;
}

export interface TranscriptReads {
  /** Every store that was on disk, with how much of it was read. */
  stores: TranscriptStoreReads[];
  /** The window in days, or null for everything on disk. */
  days: number | null;
  sessions: number;
  bytes: number;
  /** Sessions with at least one counted call. */
  sessionsUsing: number;
  /** ISO times of the first and last counted call. */
  firstUse: string | null;
  lastUse: string | null;
  /** Lines of every counted result, which is what entered the agents' context. */
  lines: number;
  /** Distinct files a read named. */
  filesOpened: number;
  /** Distinct files any counted call named, opened or turned up by a search or a listing. */
  filesSearched: number;
  reads: number;
  searches: number;
  history: number;
  listings: number;
}

export interface TranscriptReadsOptions {
  home?: string;
  env?: NodeJS.ProcessEnv;
  /** The machine's store. Projects that move theirs with `cacheDir` are found per project. */
  storeDir?: string;
  days?: number | null;
  now?: number;
  progress?: (done: number, total: number) => void;
  /** Transcripts read at once. */
  concurrency?: number;
}

type Action = 'read' | 'search' | 'history' | 'list';

/** Tool names, lowercased, across the three harnesses. Anything else is not a read. */
const READ_TOOLS = new Set(['read', 'view']);
const SEARCH_TOOLS = new Set(['grep']);
const LIST_TOOLS = new Set(['glob', 'ls', 'list']);
const SHELL_TOOLS = new Set(['bash', 'shell', 'exec_command', 'local_shell_call', 'local_shell']);

/** A file, by the extension a directory does not have. */
const HAS_EXTENSION = /[\\/][^\\/]*[^\\/.]\.[A-Za-z0-9]{1,8}$/u;

/** One line of search or listing output that names a file: `path:12:` or a bare path. */
const RESULT_FILE = /^([^\s:]+\.[A-Za-z0-9]{1,8})(?::\d+[:-]|$)/gmu;

/** A result can name thousands of files; past this, the rest are not worth the memory. */
const MAX_FILES_PER_RESULT = 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

/** A directory a counted call can reach into, and every way a transcript might spell it. */
interface Root {
  path: string;
  spellings: string[];
}

interface Call {
  key: string;
  session: string;
  time: number;
  action: Action;
  root: Root;
  files: string[];
  /** Where a relative path in the result is relative to, when the call said. */
  directory: string | null;
}

interface Tally {
  sessions: Set<string>;
  firstUse: number;
  lastUse: number;
  lines: number;
  opened: Set<string>;
  touched: Set<string>;
  counts: Record<Action, number>;
  seen: Set<string>;
}

export async function getTranscriptReads(
  options: TranscriptReadsOptions = {},
): Promise<TranscriptReads> {
  const home = options.home ?? os.homedir();
  const env = options.env ?? process.env;
  const days = options.days ?? null;
  const now = options.now ?? Date.now();
  const cutoff = days === null ? 0 : now - days * DAY_MS;
  const concurrency = options.concurrency ?? 32;
  const roots = rootsResolver(options.storeDir ?? defaultStoreDir(), home);

  const found: Array<{ agent: string; root: string; files: Session[] }> = [];
  for (const store of transcriptStores(home, env)) {
    if (!(await exists(store.root))) continue;
    found.push({ ...store, files: await sessionFiles(store.root, store.extension, cutoff) });
  }

  const total = found.reduce((sum, store) => sum + store.files.length, 0);
  let done = 0;
  options.progress?.(0, total);

  const tally: Tally = {
    sessions: new Set(),
    firstUse: Infinity,
    lastUse: -Infinity,
    lines: 0,
    opened: new Set(),
    touched: new Set(),
    counts: { read: 0, search: 0, history: 0, list: 0 },
    seen: new Set(),
  };
  const stores: TranscriptStoreReads[] = [];

  for (const store of found) {
    const sessions = new Set<string>();
    let bytes = 0;
    const reader = READERS[store.agent];
    const context: ReaderContext = {
      roots,
      home,
      cutoff,
      storeRoot: store.root,
      sessionDirectories: null,
    };

    for (let index = 0; index < store.files.length; index += concurrency) {
      await Promise.all(
        store.files.slice(index, index + concurrency).map(async (session) => {
          const buffer = await fs.readFile(session.file).catch(() => null);
          if (buffer === null) return;
          bytes += buffer.length;
          const read = await reader?.(buffer, session.file, context);
          sessions.add(read?.session ?? sessionKey(session.file));
          for (const call of read?.calls ?? []) count(tally, call);
        }),
      );
      done += Math.min(concurrency, store.files.length - index);
      options.progress?.(done, total);
    }

    stores.push({ agent: store.agent, path: store.root, sessions: sessions.size, bytes });
  }

  return {
    stores,
    days,
    sessions: stores.reduce((sum, store) => sum + store.sessions, 0),
    bytes: stores.reduce((sum, store) => sum + store.bytes, 0),
    sessionsUsing: tally.sessions.size,
    firstUse: Number.isFinite(tally.firstUse) ? new Date(tally.firstUse).toISOString() : null,
    lastUse: Number.isFinite(tally.lastUse) ? new Date(tally.lastUse).toISOString() : null,
    lines: tally.lines,
    filesOpened: tally.opened.size,
    filesSearched: tally.touched.size,
    reads: tally.counts.read,
    searches: tally.counts.search,
    history: tally.counts.history,
    listings: tally.counts.list,
  };
}

/** A call already counted from another file is the same call: resumed sessions copy history. */
function count(tally: Tally, call: Call & { lines: number }): void {
  if (tally.seen.has(call.key)) return;
  tally.seen.add(call.key);
  tally.sessions.add(call.session);
  tally.firstUse = Math.min(tally.firstUse, call.time);
  tally.lastUse = Math.max(tally.lastUse, call.time);
  tally.lines += call.lines;
  tally.counts[call.action] += 1;
  for (const file of call.files) {
    tally.touched.add(file);
    if (call.action === 'read') tally.opened.add(file);
  }
}

/**
 * The references a session in this directory could reach: the store's checkouts, the
 * project's own store when its config moves one, and every local path the project declares
 * that is not the project itself. Resolved once per directory, since a session writes its
 * directory on every line.
 */
function rootsResolver(storeDir: string, home: string): (cwd: string | null) => Promise<Root[]> {
  const cache = new Map<string, Promise<Root[]>>();
  const machine = root(path.join(storeDir, 'src'), home);

  async function resolve(cwd: string): Promise<Root[]> {
    const project = await resolveProjectInput(null, cwd).catch(() => null);
    if (!project) return [machine];
    const loaded = await loadAgentReferenceConfig(project.projectRoot).catch(() => null);
    if (!loaded) return [machine];

    const found = [machine];
    if (loaded.config.cacheDir) {
      const moved = resolveStoreDir(project.projectRoot, cwd, loaded.config.cacheDir);
      found.push(root(path.join(moved, 'src'), home));
    }
    for (const reference of referencesOfKind(loaded.config, 'path')) {
      const target = resolveReferencePath(project.projectRoot, reference.path);
      // The project reading its own files is not reaching for a reference, and a reference
      // that holds the project, a parent directory, would count every read the session made.
      if (inside(project.projectRoot, target) || inside(target, project.projectRoot)) continue;
      if (inside(cwd, target) || inside(target, cwd)) continue;
      found.push(root(target, home));
    }
    return found;
  }

  return async (cwd) => {
    if (!cwd) return [machine];
    let pending = cache.get(cwd);
    if (!pending) {
      pending = resolve(cwd);
      cache.set(cwd, pending);
    }
    return pending;
  };
}

function root(target: string, home: string): Root {
  const spellings = [target];
  // A JSON string doubles a Windows separator, and the raw transcript is checked before any
  // of it is parsed.
  if (target.includes('\\')) spellings.push(target.replaceAll('\\', '\\\\'));
  if (inside(home, target) && target !== home) {
    spellings.push(`~/${path.relative(home, target).split(path.sep).join('/')}`);
  }
  return { path: target, spellings };
}

function inside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

interface ReaderContext {
  roots: (cwd: string | null) => Promise<Root[]>;
  home: string;
  cutoff: number;
  storeRoot: string;
  /** opencode keeps each session's directory beside its parts; read once, on first need. */
  sessionDirectories: Promise<Map<string, string>> | null;
}

interface FileReads {
  session: string;
  calls: Array<Call & { lines: number }>;
}

type Reader = (buffer: Buffer, file: string, context: ReaderContext) => Promise<FileReads>;

/**
 * One reader per harness, each turning its format into calls with results. A transcript is
 * mostly lines no reference is named in, so every reader checks the raw text for a root
 * before parsing anything: a session that never reached one costs a string search.
 */
const READERS: Record<string, Reader> = {
  'claude-code': readJsonLines({
    callMarker: /"type":"tool_use"/u,
    resultMarker: /"type":"tool_result"/u,
    call(event, block) {
      if (event.type !== 'assistant' || block?.type !== 'tool_use') return null;
      return { id: block.id, tool: block.name, input: block.input, session: event.sessionId };
    },
    calls: (event) => (Array.isArray(event.message?.content) ? event.message.content : []),
    result(event, block) {
      if (event.type !== 'user' || block?.type !== 'tool_result') return null;
      return { id: block.tool_use_id, text: textOf(block.content) };
    },
    results: (event) => (Array.isArray(event.message?.content) ? event.message.content : []),
  }),
  codex: readJsonLines({
    callMarker: /"type":"(?:function_call|custom_tool_call|local_shell_call)"/u,
    resultMarker: /"type":"(?:function_call_output|custom_tool_call_output)"/u,
    call(event) {
      const payload = event.payload;
      if (event.type !== 'response_item') return null;
      if (!['function_call', 'custom_tool_call', 'local_shell_call'].includes(payload?.type)) {
        return null;
      }
      return {
        id: payload.call_id,
        tool: payload.name ?? payload.type,
        input: parseMaybe(payload.arguments ?? payload.input ?? payload.action),
        session: null,
      };
    },
    calls: (event) => [event],
    result(event) {
      const payload = event.payload;
      if (event.type !== 'response_item') return null;
      if (!['function_call_output', 'custom_tool_call_output'].includes(payload?.type)) {
        return null;
      }
      return { id: payload.call_id, text: codexOutput(payload.output) };
    },
    results: (event) => [event],
  }),
  opencode: readOpencodePart,
};

interface JsonLinesFormat {
  /** A string every line carrying a call contains, checked before the line is parsed. */
  callMarker: RegExp;
  /** The same, for a line carrying a result. */
  resultMarker: RegExp;
  calls: (event: any) => any[];
  call: (
    event: any,
    block: any,
  ) => { id: string; tool: string; input: unknown; session: string | null } | null;
  results: (event: any) => any[];
  result: (event: any, block: any) => { id: string; text: string } | null;
}

/** Claude Code and Codex both write one event per line, a call and its result lines apart. */
function readJsonLines(format: JsonLinesFormat): Reader {
  return async (buffer, file, context) => {
    // The directory the session started in decides which roots to look for. A session that
    // moves to another project partway is read against the first one's references, plus
    // whatever the line that moved it declares once it is parsed.
    const head = buffer.toString('latin1', 0, Math.min(buffer.length, 64 * 1024));
    const first = /"cwd":\s*"((?:[^"\\]|\\.)*)"/u.exec(head)?.[1];
    let cwd = first === undefined ? null : decode(first);
    const reachable = await context.roots(cwd);
    const session = sessionKey(file);
    // Checked on the bytes, before anything is decoded: most sessions never name a reference,
    // and for those this is the whole cost.
    if (
      !reachable.some((candidate) =>
        candidate.spellings.some((spelling) => buffer.includes(spelling)),
      )
    ) {
      return { session, calls: [] };
    }
    const text = buffer.toString('latin1');

    const pending = new Map<string, Call>();
    const calls: FileReads['calls'] = [];
    let sessionId: string | null = null;

    for (const line of text.split('\n')) {
      // A line is parsed only when it can matter: a call naming a reference, or the result of
      // one. Most lines that name a reference are results the agent read, and parsing those
      // for nothing is where the time went.
      const mentions = format.callMarker.test(line) && mentionsAny(line, reachable);
      const answers =
        pending.size > 0 && format.resultMarker.test(line) && hasPendingId(line, pending);
      if (!mentions && !answers) continue;
      const event = parseLine(line);
      if (!event) continue;
      if (typeof event.cwd === 'string') cwd = event.cwd;
      if (typeof event.payload?.cwd === 'string') cwd = event.payload.cwd;
      if (typeof event.sessionId === 'string') sessionId ??= event.sessionId;

      for (const block of format.results(event)) {
        const result = format.result(event, block);
        const call = result && pending.get(result.id);
        if (!result || !call) continue;
        pending.delete(result.id);
        calls.push(withResult(call, result.text, context.home));
      }

      if (!mentions) continue;
      const time = Date.parse(event.timestamp ?? '');
      if (!Number.isFinite(time) || time < context.cutoff) continue;
      for (const block of format.calls(event)) {
        const found = format.call(event, block);
        if (!found?.id) continue;
        const call = classify(found, await context.roots(cwd), context.home, {
          key: found.id,
          session: found.session ?? sessionId ?? session,
          time,
        });
        if (call) pending.set(found.id, call);
      }
    }

    // A call whose result never arrived was interrupted, and still happened.
    for (const call of pending.values()) calls.push({ ...call, lines: 0 });
    return { session: sessionId ?? session, calls };
  };
}

/** opencode writes one part per file, the call and its output together. */
async function readOpencodePart(
  buffer: Buffer,
  file: string,
  context: ReaderContext,
): Promise<FileReads> {
  const text = buffer.toString('utf8');
  const session = /"sessionID":\s*"([^"]+)"/u.exec(text)?.[1] ?? sessionKey(file);
  if (!text.includes('"tool"')) return { session, calls: [] };
  context.sessionDirectories ??= opencodeDirectories(context.storeRoot);
  const cwd = (await context.sessionDirectories).get(session) ?? null;
  const roots = await context.roots(cwd);
  if (!mentionsAny(text, roots)) return { session, calls: [] };

  const part = parseLine(text);
  if (part?.type !== 'tool') return { session, calls: [] };
  const time = Number(part.state?.time?.start);
  if (!Number.isFinite(time) || time < context.cutoff) return { session, calls: [] };
  const call = classify({ tool: part.tool, input: part.state?.input }, roots, context.home, {
    key: part.callID ?? part.id ?? file,
    session,
    time,
  });
  if (!call) return { session, calls: [] };
  return { session, calls: [withResult(call, textOf(part.state?.output), context.home)] };
}

async function opencodeDirectories(partRoot: string): Promise<Map<string, string>> {
  const directories = new Map<string, string>();
  const infos = await sessionFiles(path.join(partRoot, '..', 'session'), '.json', 0);
  for (const info of infos) {
    const parsed = parseLine(await fs.readFile(info.file, 'utf8').catch(() => ''));
    if (typeof parsed?.id === 'string' && typeof parsed?.directory === 'string') {
      directories.set(parsed.id, parsed.directory);
    }
  }
  return directories;
}

/**
 * Whether a call is a read of a reference, and of which files. A dedicated tool is settled by
 * its name and the path it was handed. A shell command is taken apart first, because the verb
 * that matters is the one pointed at a reference: `cd <ref> && sed -n 1,80p src/x.ts` is a
 * read of that file, while `pnpm run deploy | tail` in the same directory reads nothing.
 */
function classify(
  found: { tool: string; input: unknown },
  roots: Root[],
  home: string,
  base: { key: string; session: string; time: number },
): Call | null {
  const name = String(found.tool ?? '').toLowerCase();
  const input = found.input;

  if (SHELL_TOOLS.has(name)) {
    const command = shellCommand(input);
    if (!command) return null;
    const workdir = fieldOf(input, 'workdir') ?? fieldOf(input, 'cwd');
    for (const candidate of roots) {
      const read = shellRead(expandVariables(command), workdir, candidate, home);
      if (read) return { ...base, ...read, root: candidate };
    }
    return null;
  }

  const action: Action | null = READ_TOOLS.has(name)
    ? 'read'
    : SEARCH_TOOLS.has(name)
      ? 'search'
      : LIST_TOOLS.has(name)
        ? 'list'
        : null;
  if (!action) return null;
  const named = strings(input).map((value) => expandHome(value, home));
  const hit = roots.find((candidate) => named.some((value) => inside(candidate.path, value)));
  if (!hit) return null;
  const files = named.filter((value) => inside(hit.path, value) && HAS_EXTENSION.test(value));
  const directory =
    named.find((value) => inside(hit.path, value) && !HAS_EXTENSION.test(value)) ?? null;
  return { ...base, action, root: hit, files, directory };
}

/** Which verbs read, search, or list, when they are the command a segment runs. */
const READ_COMMANDS = new Set(['cat', 'sed', 'head', 'tail', 'nl', 'less', 'more', 'bat', 'awk']);
const SEARCH_COMMANDS = new Set(['rg', 'grep', 'egrep', 'ast-grep', 'sg', 'ag']);
const LIST_COMMANDS = new Set(['ls', 'find', 'fd', 'tree']);
const HISTORY_SUBCOMMANDS = new Set(['log', 'blame', 'show', 'diff']);
/** Wrappers that run the next word as the command. */
const PREFIXES = new Set(['sudo', 'command', 'time', 'env', 'nice', 'xargs']);
/** Settles a command with several verbs: the most specific thing it did. */
const PRIORITY: Action[] = ['history', 'search', 'read', 'list'];

function shellRead(
  command: string,
  workdir: string | null,
  target: Root,
  home: string,
): { action: Action; files: string[]; directory: string | null } | null {
  let directory = workdir ? expandHome(workdir, home) : null;
  const found = new Map<Action, string[]>();
  const directories = new Map<Action, string | null>();

  for (const segment of segments(command)) {
    const words = segment.words.filter((word, index) => index > 0 || !/^\w+=/u.test(word));
    while (words.length > 0 && PREFIXES.has(words[0] ?? '')) words.shift();
    const [verb = '', ...args] = words;

    if (verb === 'cd') {
      const next = args[0];
      if (next) directory = resolveFrom(directory, expandHome(next, home));
      continue;
    }
    // Anything written, and anything reading a pipe, is not a read of a file.
    if (segment.piped || segment.redirected) continue;

    let action: Action | null = null;
    let operands = args;
    let at = directory;
    if (verb === 'git') {
      const flag = args.indexOf('-C');
      if (flag !== -1 && args[flag + 1])
        at = resolveFrom(directory, expandHome(args[flag + 1] ?? '', home));
      const rest = flag === -1 ? args : [...args.slice(0, flag), ...args.slice(flag + 2)];
      const subcommand = rest.find((word) => !word.startsWith('-'));
      if (subcommand && HISTORY_SUBCOMMANDS.has(subcommand)) {
        action = 'history';
        operands = rest.slice(rest.indexOf(subcommand) + 1);
      }
    } else if (READ_COMMANDS.has(verb)) {
      if (verb === 'sed' && args.some((word) => /^-[a-zA-Z]*i/u.test(word))) continue;
      action = 'read';
    } else if (SEARCH_COMMANDS.has(verb)) {
      action = 'search';
    } else if (LIST_COMMANDS.has(verb)) {
      action = 'list';
    }
    if (!action) continue;

    const paths = operands
      .filter((word) => !word.startsWith('-'))
      .map((word) => resolveFrom(at, expandHome(word, home)))
      .filter((word): word is string => word !== null);
    const reaches =
      paths.some((word) => inside(target.path, word)) || (at !== null && inside(target.path, at));
    if (!reaches) continue;

    const files = paths.filter((word) => inside(target.path, word) && HAS_EXTENSION.test(word));
    found.set(action, [...(found.get(action) ?? []), ...files]);
    if (!directories.has(action)) directories.set(action, at);
  }

  for (const action of PRIORITY) {
    const files = found.get(action);
    if (!files) continue;
    return {
      action,
      files: action === 'read' ? files : [...found.values()].flat(),
      directory: directories.get(action) ?? null,
    };
  }
  return null;
}

interface Segment {
  words: string[];
  /** Reads what the segment before it wrote. */
  piped: boolean;
  /** Writes to a file, or feeds itself from a heredoc. */
  redirected: boolean;
}

/**
 * A shell command split into the simple commands it runs, with quotes removed. Enough of the
 * grammar to find verbs and their operands; a heredoc's body is dropped, since it is text the
 * command writes rather than anything it reads.
 */
function segments(command: string): Segment[] {
  const out: Segment[] = [];
  let current: Segment = { words: [], piped: false, redirected: false };
  let word = '';
  let started = false;
  let quote: string | null = null;

  const endWord = () => {
    if (started) current.words.push(word);
    word = '';
    started = false;
  };
  const endSegment = (piped: boolean) => {
    endWord();
    if (current.words.length > 0) out.push(current);
    current = { words: [], piped, redirected: false };
  };

  for (let index = 0; index < command.length; index += 1) {
    const char = command[index] ?? '';
    const next = command[index + 1] ?? '';
    if (quote) {
      if (char === quote) quote = null;
      else if (char === '\\' && quote === '"' && next) {
        word += next;
        index += 1;
      } else word += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      started = true;
    } else if (char === '\\' && next) {
      word += next;
      started = true;
      index += 1;
    } else if (char === ' ' || char === '\t') {
      endWord();
    } else if (char === '|') {
      endSegment(next !== '|');
      if (next === '|') index += 1;
    } else if (char === '&' || char === ';' || char === '\n') {
      endSegment(false);
      if (char === '&' && next === '&') index += 1;
    } else if (char === '<' && next === '<') {
      // A heredoc: the rest of the command is its body.
      current.redirected = true;
      break;
    } else if (char === '>') {
      // The descriptor in `2>` is part of the redirect, not an operand.
      if (/^\d$/u.test(word)) {
        word = '';
        started = false;
      }
      endWord();
      // `2>&1` and `>/dev/null` send output nowhere worth calling a write.
      const rest = command.slice(index + 1).replace(/^>?\s*/u, '');
      if (!rest.startsWith('&') && !rest.startsWith('/dev/null') && command[index - 1] !== '2') {
        current.redirected = true;
      }
      const target = /^>?\s*(?:&\d|[^\s;&|)]+)/u.exec(command.slice(index + 1))?.[0] ?? '';
      index += target.length;
    } else if (char === '(' || char === ')' || char === '{' || char === '}' || char === '$') {
      if (char === '$' && next !== '(') {
        word += char;
        started = true;
      } else endWord();
    } else {
      word += char;
      started = true;
    }
  }
  endSegment(false);
  return out;
}

function resolveFrom(directory: string | null, target: string): string | null {
  if (path.isAbsolute(target)) return path.normalize(target);
  return directory ? path.resolve(directory, target) : null;
}

function expandHome(value: string, home: string): string {
  if (value === '~') return home;
  if (value.startsWith('~/')) return path.join(home, value.slice(2));
  return value;
}

/** The command a shell tool ran: a string, or an argv whose last word is the script. */
function shellCommand(input: unknown): string | null {
  const command = fieldOf(input, 'command') ?? fieldOf(input, 'cmd');
  if (command) return command;
  const argv = (input as { command?: unknown } | null)?.command;
  if (Array.isArray(argv)) {
    const words = argv.filter((word): word is string => typeof word === 'string');
    const script = words.indexOf('-lc') !== -1 || words.indexOf('-c') !== -1;
    return script ? (words.at(-1) ?? null) : words.join(' ');
  }
  return null;
}

function fieldOf(input: unknown, field: string): string | null {
  const value = (input as Record<string, unknown> | null)?.[field];
  return typeof value === 'string' ? value : null;
}

/** The result's size, and for a search or a listing, the files it turned up. */
function withResult(call: Call, text: string, home: string): Call & { lines: number } {
  const trimmed = text.replace(/\n+$/u, '');
  const lines = trimmed === '' ? 0 : trimmed.split('\n').length;
  if (call.action !== 'search' && call.action !== 'list') return { ...call, lines };

  const files = [...call.files];
  for (const match of trimmed.matchAll(RESULT_FILE)) {
    if (files.length >= MAX_FILES_PER_RESULT) break;
    const named = expandHome(match[1] ?? '', home);
    if (path.isAbsolute(named)) files.push(path.normalize(named));
    else if (call.directory) files.push(path.resolve(call.directory, named));
    else files.push(`${call.root.path}:${named}`);
  }
  return { ...call, lines, files };
}

/**
 * `R=<root>/pkg; sed -n 1,80p "$R/src/index.ts"` is how an agent reads a deep checkout, and
 * the file behind the variable is the one it read. Only plain assignments are expanded.
 */
function expandVariables(input: string): string {
  const values = new Map<string, string>();
  for (const match of input.matchAll(/\b([A-Z_][A-Z0-9_]*)=["']?([^\s"';&|]+)/gu)) {
    values.set(match[1] ?? '', match[2] ?? '');
  }
  if (values.size === 0) return input;
  return input.replaceAll(
    /\$\{?([A-Z_][A-Z0-9_]*)\}?/gu,
    (whole, name: string) => values.get(name) ?? whole,
  );
}

/** Every string inside a tool's input, decoded, so a path reads the way the shell saw it. */
function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === 'object') return Object.values(value).flatMap(strings);
  return [];
}

function mentionsAny(text: string, roots: Root[]): boolean {
  return roots.some((candidate) => candidate.spellings.some((spelling) => text.includes(spelling)));
}

function hasPendingId(line: string, pending: Map<string, Call>): boolean {
  for (const id of pending.keys()) if (line.includes(id)) return true;
  return false;
}

/**
 * The session a file belongs to when nothing inside it says. Claude Code writes a subagent's
 * transcript under its parent's directory, and that work is the parent session's.
 */
function sessionKey(file: string): string {
  const parent = path.dirname(file);
  if (path.basename(parent) === 'subagents') return path.basename(path.dirname(parent));
  return path.basename(file, path.extname(file));
}

/** A tool result's text, whether the harness wrote it as a string or as content blocks. */
function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text as string)
    .join('\n');
}

/** Codex prefixes a shell result with the command and its exit; the output follows `Output:`. */
function codexOutput(output: unknown): string {
  const text = typeof output === 'string' ? output : textOf(output);
  const parsed = text.startsWith('{"output"') ? parseLine(text) : null;
  const body = typeof parsed?.output === 'string' ? parsed.output : text;
  const marker = body.indexOf('\nOutput:\n');
  return marker === -1 ? body : body.slice(marker + '\nOutput:\n'.length);
}

function parseMaybe(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  return parseLine(value) ?? value;
}

/** Transcripts are appended to while they are read, so a line that will not parse is skipped. */
function parseLine(line: string): any {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

/** A JSON string's contents, unescaped. */
function decode(value: string): string {
  return (parseLine(`"${value}"`) as string | null) ?? value;
}

const exists = (target: string) =>
  fs
    .stat(target)
    .then(() => true)
    .catch(() => false);
