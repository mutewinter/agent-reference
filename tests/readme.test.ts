import assert from 'node:assert/strict';
import test from 'node:test';

import { readReadme, render } from '../scripts/sync-readme.ts';

// The README is the site read top to bottom: the same sections in the same order, and no
// copy of its own. Both surfaces render `site/code-samples.ts`, so a config snippet
// cannot go stale on one of them.
test('the README carries what the site shows', () => {
  const readme = readReadme();
  assert.equal(
    render(readme),
    readme,
    'README.md is behind site/code-samples.ts. Run `npm run sync-readme`.',
  );
});
