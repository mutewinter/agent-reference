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
  return JSON.parse(stripJsonc(raw)) as T;
}

const WHITESPACE = new Set([' ', '\t', '\n', '\r']);

function stripJsonc(raw: string): string {
  // Split by code unit so an index into `out` is an index into `raw`; join restores any
  // surrogate pair untouched.
  const out = raw.split('');
  let inString = false;
  let escaped = false;
  let comma: number | null = null;

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index] as string;

    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
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
      continue;
    }
    if (!WHITESPACE.has(char)) comma = null;
  }

  return out.join('');
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
