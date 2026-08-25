import assert from 'node:assert/strict';
import test from 'node:test';

import { readReadme, render } from '../scripts/sync-readme.mjs';

// The README is the site read top to bottom: the same sections in the same order, and no
// copy of its own. Both surfaces render `site/code-samples.mjs`, so a config snippet
// cannot go stale on one of them.
test('the README carries what the site shows', () => {
  const readme = readReadme();
  assert.equal(
    render(readme),
    readme,
    'README.md is behind site/code-samples.mjs. Run `npm run sync-readme`.',
  );
});
