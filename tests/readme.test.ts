import assert from 'node:assert/strict';
import test from 'node:test';

import { readReadme, render } from '../scripts/sync-readme.mjs';

// The site and the README are different targets and their prose is written twice on
// purpose. The examples are not: a config snippet with a stale key is wrong rather than
// differently worded, so both surfaces render `site/code-samples.mjs`.
test('the README carries the examples the site shows', () => {
  const readme = readReadme();
  assert.equal(
    render(readme),
    readme,
    'README.md is behind site/code-samples.mjs. Run `npm run sync-readme`.',
  );
});
