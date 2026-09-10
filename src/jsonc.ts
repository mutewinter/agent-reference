/**
 * JSON with comments and trailing commas, for the files a human or an agent writes by
 * hand: the config, where a note beside an entry is how people annotate a list, and
 * bun.lock, which is JSONC by construction.
 *
 * Stripping comments with regular expressions cannot tell a comment from the same
 * characters inside a string, and a value holding `//` or `,}` is ordinary: any URL has
 * the first, and a description written as prose can have the second. This walks the text
 * instead, so only characters outside a string are ever considered, and every byte of a
 * string value survives verbatim.
 *
 * What is dropped is overwritten with spaces rather than removed, which keeps every
 * remaining byte at its original offset and every newline where it was: the position and
 * the excerpt in a JSON.parse error then still line up with the file on disk.
 */
export function parseJsonc<T>(raw: string): T {
  return JSON.parse(walk(raw, false).text) as T;
}

/** A key its object declares more than once, and every line that declares it. */
export interface DuplicateKey {
  /** Dotted from the root, so it names the entry a writer would go and edit. */
  path: string;
  lines: number[];
}

/**
 * Keys declared more than once in the same object. `JSON.parse` keeps the last of them and
 * drops the rest before any caller sees the object, so an entry pasted twice loses one
 * without a word: the one JSON mistake nothing downstream can notice. For text that has
 * already parsed, since the walk trusts its input to be well formed.
 */
export function duplicateJsoncKeys(raw: string): DuplicateKey[] {
  const { duplicates } = walk(raw, true);
  return duplicates.map(({ path, offsets }) => ({
    path,
    lines: offsets.map((offset) => lineAt(raw, offset)),
  }));
}

const WHITESPACE = new Set([' ', '\t', '\n', '\r']);

/** One container, while the walk is inside it. */
interface Scope {
  /** Null in an array, which has no keys to collide. */
  keys: Map<string, number[]> | null;
  /** Dotted path to this container, empty at the root. */
  label: string;
  /** The key whose value is being read, which is what labels a container opening now. */
  lastKey: string | null;
}

/**
 * Offsets rather than line numbers: a line costs a count of everything before it, and a
 * file with a thousand keys and no duplicate should not pay that a thousand times.
 */
interface DuplicateOffsets {
  path: string;
  offsets: number[];
}

/**
 * `trackKeys` off is the reading path, where a lockfile is parsed on every run and there is
 * nothing to report; on is the config, which is small and which a person edits by hand.
 */
function walk(raw: string, trackKeys: boolean): { text: string; duplicates: DuplicateOffsets[] } {
  // Split by code unit so an index into `out` is an index into `raw`; join restores any
  // surrogate pair untouched.
  const out = raw.split('');
  const scopes: Scope[] = [];
  const duplicates: DuplicateOffsets[] = [];
  let inString = false;
  let escaped = false;
  let comma: number | null = null;
  /** The last string that closed, which a `:` after it turns into a key. */
  let quoted: { open: number; close: number } | null = null;
  let opened = 0;

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index] as string;

    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') {
        inString = false;
        if (trackKeys) quoted = { open: opened, close: index };
      }
      continue;
    }

    const next = raw[index + 1];

    if (char === '/' && next === '/') {
      const end = raw.indexOf('\n', index);
      index = blank(raw, out, index, end === -1 ? raw.length : end);
      continue;
    }
    if (char === '/' && next === '*') {
      const end = raw.indexOf('*/', index + 2);
      index = blank(raw, out, index, end === -1 ? raw.length : end + 2);
      continue;
    }

    if (char === '"') {
      inString = true;
      opened = index;
      comma = null;
      continue;
    }

    if (char === ',') {
      comma = index;
      continue;
    }
    // A comma is trailing only once something closes after it, so the decision waits for
    // the next value-bearing character.
    if (char === '}' || char === ']') {
      if (comma !== null) out[comma] = ' ';
      comma = null;
      if (trackKeys) closeScope(scopes.pop(), duplicates);
      continue;
    }
    if (trackKeys && (char === '{' || char === '[')) {
      const parent = scopes.at(-1);
      scopes.push({
        keys: char === '{' ? new Map() : null,
        label: parent ? childLabel(parent) : '',
        lastKey: null,
      });
    }
    if (trackKeys && char === ':' && quoted !== null) {
      const scope = scopes.at(-1);
      if (scope?.keys) {
        // Sliced with its quotes and handed to the same unescaping the parse itself did, so
        // `"a"` and `"a"` are the one key they collide as.
        const key = JSON.parse(raw.slice(quoted.open, quoted.close + 1)) as string;
        const seen = scope.keys.get(key);
        if (seen) seen.push(quoted.open);
        else scope.keys.set(key, [quoted.open]);
        scope.lastKey = key;
      }
      quoted = null;
    }
    if (!WHITESPACE.has(char)) comma = null;
  }

  return { text: out.join(''), duplicates };
}

function closeScope(scope: Scope | undefined, duplicates: DuplicateOffsets[]): void {
  if (!scope?.keys) return;
  for (const [key, offsets] of scope.keys) {
    if (offsets.length > 1)
      duplicates.push({ path: scope.label ? `${scope.label}.${key}` : key, offsets });
  }
}

/** Where a container opening inside `parent` sits, named from the key it is the value of. */
function childLabel(parent: Scope): string {
  if (!parent.lastKey) return parent.label;
  return parent.label ? `${parent.label}.${parent.lastKey}` : parent.lastKey;
}

function lineAt(raw: string, offset: number): number {
  let line = 1;
  for (let index = 0; index < offset; index += 1) if (raw[index] === '\n') line += 1;
  return line;
}

/**
 * Overwrites [start, stop) with spaces, leaving newlines so line numbers still hold, and
 * returns the last index it covered, which is where the scan resumes from.
 */
function blank(raw: string, out: string[], start: number, stop: number): number {
  for (let index = start; index < stop; index += 1) {
    if (raw[index] !== '\n') out[index] = ' ';
  }

  return stop - 1;
}
