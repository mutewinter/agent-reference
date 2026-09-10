// Draws the first screen's two transcripts as images, for the surfaces that
// render markdown and have no way to color a line: README.md on GitHub and on
// npm. The page keeps the real thing, and /index.md keeps it as text, which is
// what an agent reads.
//
// Chrome rather than the renderer og.ts uses: a transcript is made of the
// elbow, the dot and the box drawing that a webfont subset does not carry, and
// an image of a session without them is not an image of this session. Run by
// hand, `pnpm --dir site run hero`, and the PNGs are committed.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { terminals } from './code-samples.ts';
import { palette } from './palette.ts';

const c = palette();

/** Where a headless Chrome lives on the machines this is run from. */
const CHROME =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const escape = (text: string) =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

/**
 * One transcript line, painted the way `Session` paints it: a call carries the
 * dot, a result carries the tone its marker asked for, and the marker itself
 * never reaches the page.
 */
function line(text: string): string {
  if (text.startsWith('* ')) {
    const call = text.slice(2);
    const open = call.indexOf('(');
    const name = open === -1 ? call : call.slice(0, open);
    const args =
      open === -1 ? '' : `<span style="color:${c.muted}">${escape(call.slice(open))}</span>`;
    return `<div class="call"><span style="color:${c.ok}">● </span>${escape(name)}${args}</div>`;
  }

  const result = /^(\s+)(⎿ )?([!+] )?(.*)$/u.exec(text);
  if (!result) return `<div>${escape(text)}</div>`;
  const [, indent = '', elbow, mark, rest = ''] = result;
  const tone = mark === '! ' ? c.bad : mark === '+ ' ? c.ok : c.fg;
  const rail = elbow ? `<span style="color:${c.line}">⎿ </span>` : '';
  return `<div class="result">${indent.replaceAll(' ', '&nbsp;')}${rail}<span style="color:${tone}">${escape(rest)}</span></div>`;
}

/** The pane, at twice the width a README column has, so it stays sharp scaled down. */
const page = (transcript: string, ground: string) => `<!doctype html>
<html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400&display=swap">
<style>
  html, body { margin: 0; background: ${c.bg}; }
  .pane {
    display: inline-block; background: ${ground}; padding: 34px 40px;
    /* One width for both panes, so two images stacked in a README line up
       rather than stepping in and out with their longest line. */
    box-sizing: border-box; width: 1320px;
    font-family: 'JetBrains Mono', monospace; font-size: 26px; line-height: 1.75;
    color: ${c.fg}; white-space: pre-wrap;
  }
  /* A wrapped result hangs under the text it continues rather than under the
     elbow, which is four columns wide and would otherwise read as a new line
     of output. */
  .result { padding-left: 4ch; text-indent: -4ch; }
  .call { margin-top: 12px; }
  .call:first-child { margin-top: 0; }
</style></head>
<body><div class="pane">${transcript
  .split('\n')
  .map((text) => line(text))
  .join('')}</div></body></html>`;

const shots: Array<{ file: string; transcript: string; ground: string }> = [
  { file: 'hero-without.png', transcript: terminals.today, ground: c.term },
  { file: 'hero-with.png', transcript: terminals.after, ground: c.panel },
];

const work = mkdtempSync(join(tmpdir(), 'agent-reference-hero-'));

try {
  for (const shot of shots) {
    const html = join(work, `${shot.file}.html`);
    writeFileSync(html, page(shot.transcript, shot.ground));
    const out = fileURLToPath(new URL(`public/${shot.file}`, import.meta.url));

    execFileSync(
      CHROME,
      [
        '--headless=new',
        '--disable-gpu',
        '--hide-scrollbars',
        '--force-device-scale-factor=1',
        '--default-background-color=00000000',
        '--window-size=1720,2400',
        `--screenshot=${out}`,
        `file://${html}`,
      ],
      { stdio: 'ignore' },
    );

    // Chrome paints a window, not a box. The pane is trimmed out of it and given
    // its own ground back, so the image is the panel and nothing around it.
    execFileSync('magick', [out, '-trim', '+repage', out]);
    console.log(`wrote public/${shot.file}`);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
