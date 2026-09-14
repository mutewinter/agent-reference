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

import { copy, terminals } from './code-samples.ts';
import { SITE } from './page-markdown.ts';

const PUBLIC = new URL('./public/', import.meta.url);

/**
 * The one line of identity the card carries. The name and the domain are the
 * same word, so the header held it twice; the domain is the half a reader can
 * type, and the mark beside it is what survives being a thumbnail.
 */
const HOME = SITE.replace(/^https?:\/\//u, '');

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

/** The transcripts carry both, and the markup on the first screen is made of them. */
const esc = (text: string) =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

/**
 * The first screen, cut to what a card can hold: the last two calls of each
 * transcript, a result that is one long line cut to `chars` characters, and a
 * result that is a list of lines cut to `lines` of them, with the fold under
 * it recounted for what was dropped so it stays true of the file.
 */
function excerpt(transcript: string, { chars, lines }: { chars: number; lines: number }) {
  return transcript
    .split(/\n(?=\* )/u)
    .slice(-2)
    .map((read) => {
      const [call = '', ...result] = read.split('\n');
      if (result.length === 1) {
        const [only = ''] = result;
        return { call, result: [only.length > chars ? `${only.slice(0, chars)}…` : only] };
      }
      const fold = /^(\s+)… \+(\d+) lines$/u.exec(result.at(-1) ?? '');
      const body = fold ? result.slice(0, -1) : result;
      const kept = body.slice(0, lines);
      if (!fold || kept.length === body.length) return { call, result: kept };
      const [, indent, more] = fold;
      return {
        call,
        result: [...kept, `${indent}… +${Number(more) + body.length - kept.length} lines`],
      };
    });
}

/** The type size the panes are set in, and the leading each line takes. */
const TYPE = { size: 16, line: 26 };

/** The dot a call carries, as a shape: no webfont subset carries the glyph. */
const dot = `<div style="width:8px;height:8px;border-radius:4px;background:${c.ok};margin:${(TYPE.line - 8) / 2}px 10px 0 0;flex-shrink:0"></div>`;

/** The elbow under a call, drawn from two borders for the same reason. */
const elbow = `<div style="width:8px;height:11px;border-left:1.5px solid ${c.line};border-bottom:1.5px solid ${c.line};margin:5px 8px 0 22px;flex-shrink:0"></div>`;

const WRAP = 'white-space:pre-wrap;overflow-wrap:anywhere';

/** A call, painted the way `Session` paints one: the name in ink, the arguments quieter. */
function callLine(call: string): string {
  const text = call.slice(2);
  const open = text.indexOf('(');
  const name = open === -1 ? text : text.slice(0, open);
  const args = open === -1 ? '' : `<span style="color:${c.muted}">${esc(text.slice(open))}</span>`;
  return `<div style="display:flex;margin-top:8px">${dot}<div style="${WRAP}">${esc(name)}${args}</div></div>`;
}

/** A result line: the elbow on the first, the same indent on the rest, the marker read off. */
function resultLine(text: string, first: boolean): string {
  const match = /^(\s+)(⎿ )?([!+] )?(.*)$/u.exec(text);
  const [, , , marker, rest = text] = match ?? [];
  const tone =
    marker === '! ' ? c.bad : marker === '+ ' ? c.ok : /^… \+\d+ lines$/u.test(rest) ? c.dim : c.fg;
  const lead = first ? elbow : `<div style="width:38px;flex-shrink:0"></div>`;
  return `<div style="display:flex">${lead}<div style="color:${tone};${WRAP}">${esc(rest)}</div></div>`;
}

function pane(heading: string, transcript: string, ground: string, ink: string): string {
  const reads = excerpt(transcript, { chars: 118, lines: 4 });
  const body = reads
    .map(
      ({ call, result }) =>
        callLine(call) + result.map((line, index) => resultLine(line, index === 0)).join(''),
    )
    .join('');
  return `<div style="display:flex;flex-direction:column;flex:1;padding:24px 28px;background:${ground};overflow:hidden">
    <div style="font-family:'Oswald';font-size:32px;color:${ink};margin-bottom:8px">${esc(heading)}</div>
    <div style="display:flex;flex-direction:column;font-family:'JetBrains Mono';font-size:${TYPE.size}px;line-height:${TYPE.line}px">${body}</div>
  </div>`;
}

// A thumbnail-sized comparison uses the site's headings, palette, and typefaces,
// and shows the first screen as it is on the page: the same two transcripts,
// drawn as the tool calls they are, cut to the last two calls a side and a few
// lines of what each got back. At the size a link preview is actually read,
// red markup against green markdown is two different shapes before it is two
// different meanings, and nothing has to be read for the point to land. The
// tagline sits close above the panes so the panes get the height.
const card = `<div style="
  width:100%;height:100%;display:flex;flex-direction:column;
  background:${c.bg};color:${c.fg};font-family:'Inter';padding:40px 56px
">
  <div style="
    display:flex;align-items:center;justify-content:space-between;font-size:24px;font-family:'JetBrains Mono';
    padding-bottom:18px;border-bottom:1px solid ${c.line}
  ">
    <div style="display:flex;align-items:center">
    <img src="${mark}" width="38" height="38" style="margin-right:16px" />
    <span>${esc(HOME)}</span>
    </div>
  </div>

  <div style="display:flex;font-size:60px;font-weight:500;line-height:1.15;margin:26px 0 22px">${esc(copy.tagline)}</div>

  <div style="display:flex;flex:1;border:1px solid ${c.line}">
    ${pane(copy.hero.before, terminals.today, c.term, c.muted)}
    <div style="width:1px;background:${c.line}"></div>
    ${pane(copy.hero.after, terminals.after, c.panel, c.fg)}
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
