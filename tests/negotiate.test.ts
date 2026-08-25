import assert from 'node:assert/strict';
import test from 'node:test';

import { HOMEPAGE_TYPES, NOT_FOUND_TYPES } from '../site/agent-responses.ts';
import { chooseType, parseAccept } from '../site/negotiate.ts';

// The homepage offers HTML first, so anything that does not single out markdown keeps
// getting the page. Every header below is one a real client sends.
const home = (accept: string | null) => chooseType(accept, HOMEPAGE_TYPES);

test('a request that says nothing gets the page', () => {
  assert.equal(home(null), 'text/html');
  assert.equal(home(''), 'text/html');
  // Nothing parseable in it either: a header this broken is not a refusal.
  assert.equal(home('garbage'), 'text/html');
});

test('a browser gets the page and an agent gets the markdown', () => {
  const chrome = 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,*/*;q=0.8';
  assert.equal(home(chrome), 'text/html');
  assert.equal(home('text/markdown'), 'text/markdown');
  assert.equal(home('text/markdown; charset=utf-8'), 'text/markdown');
});

test('curl and every other wildcard client still gets the page', () => {
  assert.equal(home('*/*'), 'text/html');
  // A tie goes to the order the caller offered, which is what makes HTML the default
  // rather than something the negotiation happens to land on.
  assert.equal(home('text/html, text/markdown'), 'text/html');
  assert.equal(home('text/markdown, text/html'), 'text/html');
});

test('q-values decide when a client wants both', () => {
  assert.equal(home('text/markdown;q=0.9, text/html;q=0.8'), 'text/markdown');
  assert.equal(home('text/markdown;q=0.8, text/html;q=0.9'), 'text/html');
  // A q of zero rules a type out rather than ranking it last.
  assert.equal(home('text/html;q=0, text/markdown'), 'text/markdown');
  assert.equal(home('*/*, text/markdown;q=0'), 'text/html');
});

test('the most specific range decides a type, not the highest one that matches', () => {
  // Without specificity the wildcard's 0.9 would carry text/html past markdown's 0.5.
  assert.equal(home('*/*;q=0.9, text/html;q=0.1, text/markdown;q=0.5'), 'text/markdown');
  // A type wildcard is more specific than a full one and less than an exact name.
  assert.equal(home('*/*;q=0.9, text/*;q=0.2'), 'text/html');
});

test('a client that can read neither gets a 406 rather than a guess', () => {
  assert.equal(home('application/pdf'), undefined);
  assert.equal(home('image/png, application/json'), undefined);
  assert.equal(home('text/html;q=0, text/markdown;q=0'), undefined);
});

test('a malformed q is treated as unweighted rather than as a refusal', () => {
  assert.equal(home('text/markdown;q=high'), 'text/markdown');
  // Out of range clamps to 1 rather than rejecting, so it beats a weighted type and
  // ties with an unweighted one.
  assert.equal(home('text/markdown;q=9, text/html;q=0.5'), 'text/markdown');
  assert.equal(home('text/markdown;q=9, text/html'), 'text/html');
});

test('the 404 hands markdown to anything that did not ask for a browser page', () => {
  const missing = (accept: string | null) => chooseType(accept, NOT_FOUND_TYPES);
  assert.equal(missing(null), 'text/markdown');
  assert.equal(missing('*/*'), 'text/markdown');
  assert.equal(missing('text/html,application/xhtml+xml,*/*;q=0.8'), 'text/html');
});

test('parseAccept keeps the ranges and drops everything else', () => {
  assert.deepEqual(parseAccept('text/markdown;q=0.9, TEXT/HTML'), [
    { type: 'text', subtype: 'markdown', quality: 0.9 },
    { type: 'text', subtype: 'html', quality: 1 },
  ]);
  // No subtype is not a media range; a bare parameter is not one either.
  assert.deepEqual(parseAccept('text, ;q=1, */*'), [{ type: '*', subtype: '*', quality: 1 }]);
  assert.deepEqual(parseAccept(null), []);
});
