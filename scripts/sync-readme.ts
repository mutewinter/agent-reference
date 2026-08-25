// Renders the site's own content into README.md. The README says what the site
// says and nothing else, in the same order, so everything it carries comes from
// site/code-samples.ts or from running the CLI and neither has a second copy
// here. site/page-markdown.ts turns those into markdown, for this file and for
// the /index.md the site serves; this script pastes them into the regions the
// README marks, and tests/readme.test.ts fails when the README no longer
// matches.
import { readFileSync, writeFileSync } from 'node:fs';

import { renderRegions } from '../site/page-markdown.ts';

const README = new URL('../README.md', import.meta.url);

export function render(readme: string): string {
  const generated = renderRegions();
  const seen = new Set<string>();
  const rendered = readme.replaceAll(
    /<!-- generated:(\S+) -->[\s\S]*?<!-- \/generated -->/g,
    (_match, id) => {
      if (!(id in generated)) throw new Error(`README marks a region '${id}' that nothing renders`);
      seen.add(id);
      return `<!-- generated:${id} -->\n${generated[id]}\n<!-- /generated -->`;
    },
  );

  const missing = Object.keys(generated).filter((id) => !seen.has(id));
  if (missing.length > 0) throw new Error(`README has no region for: ${missing.join(', ')}`);
  return rendered;
}

export function readReadme(): string {
  return readFileSync(README, 'utf8');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const before = readReadme();
  const after = render(before);
  if (after === before) {
    console.log('README.md is already in sync');
  } else {
    writeFileSync(README, after);
    console.log('README.md updated from the site');
  }
}
