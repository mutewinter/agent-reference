// Draws the images a link preview and a home screen need, which is every image
// on this site that a browser cannot make out of the page itself. Takumi lays
// out HTML and CSS in Rust and hands back a PNG, so the card is written in the
// same idiom as the page rather than as drawing commands.
//
// Run by hand, `pnpm og`, and the PNGs are committed. Nothing here runs during
// a build: the card changes about as often as the tagline does, and a deploy
// should not depend on a font download or a native renderer.
import { readFileSync, writeFileSync } from 'node:fs';

import { render } from 'takumi-js';
import { googleFonts } from 'takumi-js/helpers';

import { copy, quickStart } from './code-samples.mjs';

const PUBLIC = new URL('./public/', import.meta.url);

/**
 * The palette, read out of the stylesheet's `@theme` block rather than restated
 * here, so the card cannot drift from the page the way a second copy of nine
 * hex values would.
 */
function palette() {
  const css = readFileSync(new URL('./src/styles.css', import.meta.url), 'utf8');
  const colors = {};
  for (const [, name, value] of css.matchAll(/--color-([a-z]+):\s*(#[0-9a-f]{3,8});/giu)) {
    colors[name] = value;
  }
  return colors;
}

const c = palette();

/**
 * The mark, which is the favicon: the arrow the CLI prints between a coordinate
 * and the path it resolves to. A link preview is read at thumbnail size, where
 * a wordmark alone is a gray smudge, so the card carries the same glyph the
 * browser tab does.
 */
const favicon = readFileSync(new URL('favicon.svg', PUBLIC), 'utf8');
const mark = `data:image/svg+xml;base64,${Buffer.from(favicon).toString('base64')}`;

/** No snippet contains either, but the text comes from a file other people edit. */
const esc = (text) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;');

const span = (color, text) => `<span style="color:${color}">${esc(text)}</span>`;

const RUNNERS = new Set(['npx', 'pnpx', 'bunx', 'dlx']);

/**
 * The quick start, painted the way `Term` paints a shell line on the page: the
 * prompt and the runner sit back, so the emphasis lands on the tool being run
 * rather than on the thing running it, the way reading it aloud would.
 */
function command(text) {
  const words = text.split(' ');
  const at = RUNNERS.has(words[0]) ? 1 : 0;
  return [
    span(c.muted, '$ '),
    at > 0 ? span(c.muted, `${words[0]} `) : '',
    span(c.accent, words[at]),
    span(
      c.fg,
      words
        .slice(at + 1)
        .map((word) => ` ${word}`)
        .join(''),
    ),
  ].join('');
}

// The one thing on the card a person has to act on, and the only place it
// appears with nothing to copy it, so it is the whole of the card's second
// beat: what the tool is for, then the line you type to get it.
const card = `<div style="
  width:100%;height:100%;display:flex;flex-direction:column;justify-content:space-between;
  background:${c.bg};color:${c.fg};font-family:'Geist Mono';padding:56px 64px
">
  <div style="
    display:flex;align-items:center;font-size:30px;
    padding-bottom:20px;border-bottom:1px solid ${c.line}
  ">
    <img src="${mark}" width="38" height="38" style="margin-right:16px" />
    <span>${copy.title}</span>
  </div>

  <div style="display:flex;font-size:92px;line-height:1.12;max-width:950px">${copy.tagline}</div>

  <div style="
    display:flex;align-self:flex-start;padding:24px 32px;
    background:${c.term};border:1px solid ${c.line};font-size:34px
  ">${command(quickStart)}</div>
</div>`;

// The page asks for SF Mono and settles for whatever the reader's machine has,
// which is a choice a renderer with no machine to ask cannot make. Geist Mono is
// the nearest thing that can be fetched, and it is fetched here rather than
// vendored because this runs on somebody's laptop, never in CI.
const fonts = await googleFonts([{ name: 'Geist Mono', weight: 400 }]);

writeFileSync(new URL('og.png', PUBLIC), await render(card, { width: 1200, height: 630, fonts }));

// iOS wants a raster icon for a home-screen bookmark and will not take the SVG
// every browser uses. Same artwork, minus the rounded corner: iOS masks the
// icon itself, and a transparent corner under that mask comes out black.
const square = `data:image/svg+xml;base64,${Buffer.from(favicon.replace(/ rx="\d+"/u, '')).toString('base64')}`;

writeFileSync(
  new URL('apple-touch-icon.png', PUBLIC),
  await render(`<img src="${square}" width="180" height="180" />`, {
    width: 180,
    height: 180,
    fonts: [],
  }),
);

console.log('wrote public/og.png and public/apple-touch-icon.png');
