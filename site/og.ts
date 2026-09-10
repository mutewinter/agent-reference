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

import { copy } from './code-samples.ts';

const PUBLIC = new URL('./public/', import.meta.url);

/**
 * The palette, read out of the stylesheet's `@theme` block rather than restated
 * here, so the card cannot drift from the page the way a second copy of nine
 * hex values would.
 */
function palette(): Record<string, string> {
  const css = readFileSync(new URL('./src/styles.css', import.meta.url), 'utf8');
  const colors: Record<string, string> = {};
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
const esc = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;');

// A thumbnail-sized comparison uses the site's headings, palette, and typefaces.
const card = `<div style="
  width:100%;height:100%;display:flex;flex-direction:column;justify-content:space-between;
  background:${c.bg};color:${c.fg};font-family:'Inter';padding:44px 56px
">
  <div style="
    display:flex;align-items:center;justify-content:space-between;font-size:24px;font-family:'JetBrains Mono';
    padding-bottom:20px;border-bottom:1px solid ${c.line}
  ">
    <div style="display:flex;align-items:center">
    <img src="${mark}" width="38" height="38" style="margin-right:16px" />
    <span>${esc(copy.title)}</span>
    </div>
    <span style="font-size:18px;color:${c.muted}">agent-reference.dev</span>
  </div>

  <div style="display:flex;font-size:64px;font-weight:500;line-height:1.15">${esc(copy.tagline)}</div>

  <div style="display:flex;height:270px;border:1px solid ${c.line}">
    <div style="display:flex;flex-direction:column;flex:1;padding:28px;background:${c.term}">
      <div style="font-family:'Oswald';font-size:32px;color:${c.muted};margin-bottom:26px">${esc(copy.hero.before)}</div>
      <div style="font-family:'JetBrains Mono';font-size:20px;line-height:1.8;color:${c.bad}">import*as t from&quot;./Array.js&quot;;…<br/>…r=t=&gt;e.fail(new n({…<br/>&lt;div class=&quot;prose&quot;&gt;…</div>
    </div>
    <div style="display:flex;flex-direction:column;flex:1;padding:28px;background:${c.panel};border-left:1px solid ${c.line}">
      <div style="font-family:'Oswald';font-size:32px;margin-bottom:26px">${esc(copy.hero.after)}</div>
      <div style="font-family:'JetBrains Mono';font-size:18px;line-height:1.8;color:${c.ok}">/** Read the contents of a file. */<br/>readonly readFileString: (<br/>&nbsp;&nbsp;path: string, encoding?: string<br/>) =&gt; Effect.Effect&lt;string, PlatformError&gt;</div>
    </div>
  </div>
</div>`;

const fonts = await googleFonts([
  { name: 'Inter', weight: 400 },
  { name: 'Inter', weight: 500 },
  { name: 'JetBrains Mono', weight: 400 },
  { name: 'Oswald', weight: 400 },
]);

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
