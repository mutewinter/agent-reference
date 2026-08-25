/**
 * Strips control characters from a value that came from somewhere else: a config
 * description, registry metadata, a git ref, or git's own stderr. Left raw, those bytes
 * reposition and recolor a terminal, and reach an agent's context as text shaped like
 * instructions. Newlines and tabs survive, because they carry the shape of relayed output
 * without being able to move a cursor. `--json` needs none of this: JSON.stringify escapes
 * control bytes already, so this guards the human formatter only.
 */
export function sanitizeRelayed(value: string): string {
  // oxlint-disable-next-line no-control-regex -- naming the control bytes is the point
  return value.replaceAll(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, '');
}

/** The same, flattened, for a field rendered inside one aligned line. */
export function sanitizeRelayedLine(value: string): string {
  return sanitizeRelayed(value).replaceAll(/\s+/g, ' ').trim();
}

export function splitOutsideQuotes(value: string, separator: string): string[] {
  const parts: string[] = [];
  let quote: string | null = null;
  let start = 0;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if ((char === '"' || char === "'") && value[index - 1] !== '\\') {
      quote = quote === char ? null : (quote ?? char);
    }
    if (char === separator && !quote) {
      parts.push(value.slice(start, index));
      start = index + 1;
    }
  }

  parts.push(value.slice(start));
  return parts;
}

export function stripQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}
