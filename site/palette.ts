// The stylesheet's `@theme` block, read rather than restated, so anything that
// draws an image of this site cannot drift from the site the way a second copy
// of nine hex values would. Node only: the page itself has the real variables.
import { readFileSync } from 'node:fs';

export function palette(): Record<string, string> {
  const css = readFileSync(new URL('./src/styles.css', import.meta.url), 'utf8');
  const colors: Record<string, string> = {};
  for (const [, name, value] of css.matchAll(/--color-([a-z]+):\s*(#[0-9a-f]{3,8});/giu)) {
    colors[name] = value;
  }
  return colors;
}
