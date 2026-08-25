# Your Agent is Starving

Talk for [NashJS](https://www.meetup.com/nashjs/events/316153682/), August 25, 2026, at Vaco Nashville.

Built with [Slidev](https://sli.dev). Slides live in [slides.md](./slides.md).

```bash
pnpm install && pnpm dev
```

The public view is <http://localhost:6181>, the presenter view with notes and a timer is <http://localhost:6181/presenter>, and `pnpm export` writes a PDF (add `playwright-chromium` first).

## Publishing

`pnpm talk:build` from the repository root renders the deck to `site/public/talk/`, which the site serves at <https://agent-reference.dev/talk>. That output is committed, and it is stale until the command is run again: nothing rebuilds it on the way to production.

It is built here rather than on the site's build because a Workers deploy installs `site/`'s lockfile and nothing else, and putting a presentation framework on the deploy path is the cost [the three-installs decision](../../docs/decisions/2026-08-25-one-command-three-installs.md) declined to pay. A deck for a talk that already happened is an artifact, so it is checked in like one.

`routerMode: hash` in the headmatter is what makes a link to one slide work. Under history routing `/talk/7` is a path the host has no file for, so a reload fell through to the site's 404; every slide is now `/talk/#/7`, which is the one file the host already serves. The presenter view is `/talk/#/presenter`.

This directory is its own project with its own lockfile, not a workspace package. The library's `files` allowlist already excludes it from the published tarball, so the only question a workspace would answer is whether `pnpm install` at the repository root should also install a presentation framework. It should not.

## Conventions

The deck runs in three modes and every slide is exactly one of them, so nobody in the room has to work out what they are looking at.

- **A `beat` slide is black:** one mocked agent session inside a terminal frame, revealed a step at a time. A short heading says which problem or which step this is, in the same place every time.
- **A `config` slide is white,** carrying the website's own dark panels. Config files and directory trees live here and nowhere else, so a config never gets mistaken for something the agent typed.
- **A `statement` or `interlude` slide is the swiss type** from the last talk's Marp theme, with nothing else on it. `interlude` is the aside between two sessions: gray ground, half the type size, never wraps.

Everything else follows from those.

- **Nothing implies an operating system.** The terminal bar carries one word, `agent`, and the browser has a centered address bar. No traffic lights, no window furniture, no machine or folder named.
- **A session steps only where the stepping is the point.** The four problem sessions and the setup reveal a click at a time, because watching them go wrong is the argument. The small sessions beside a config on an example slide render whole: they are read, not walked through.
- **Only the dot is colored.** Claude Code does not tint a tool name, and a wall of green reads as output rather than as a call. A failing command's output is red, in `.e`.
- **A tool call shows what it gave back.** An indented gray line under each call, so the room can follow what the agent learned rather than only what it ran.
- **No hand-wrapped prose.** An agent's own sentences fit on one line or get shortened until they do; a manually broken line reads as two separate outputs.
- **Nothing invented appears inside a transcript.** What the CLI prints inside one is faithful to what it really prints, and `⎿` goes on a tool result's first line only.
- **Prompts are written the way somebody would really type them.** No capital at the front, no period at the end. The human's turn is a full-bleed band one line tall, the way Claude Code sets it apart.
- **The filename rides inside the panel,** not above it, so a short config and a tall one still line their headers up.
- **A config line fits its panel.** Roughly 46 characters in a `pair`, 95 across a full-width panel. Break a `description` across lines rather than letting it run under the panel edge.
- **Text does not wrap.** If a line is too long for its slide, the line is wrong, not the type size.
- **Alignment uses `&nbsp;`,** since Vue's template compiler condenses runs of literal spaces, and a blank line inside a tree has to be an explicit `&nbsp;` or the div collapses. `⎿` needs its `.el` wrapper: it is not in JetBrains Mono, so it renders from a fallback whose advance width is not one character.
- **Nothing machine-specific on a slide.** Public repositories and invented projects only.
- **Speaker notes** are the trailing HTML comment in a slide and show only in the presenter view. There are none in the deck right now.
- **`pnpm capture`** runs the CLI from this repository's working tree against a throwaway project of public dependencies and writes real ANSI to `snippets/`, which Shiki renders. Nothing uses it today, because these slides draw conversations rather than quote command output. Reach for it when a slide should show the CLI's own colors instead. Editing a file under `snippets/` does not hot-reload; restart the dev server.

## Assets

`assets/brawndo.jpg` is the still the closing line refers to, at the deck's own 16:9 so it fills the frame without a crop or a gutter. The slide fades it in behind the text over sixty seconds, to 38% opacity, so nobody sees it arrive and at some point somebody notices.

## Numbers on slides

Every figure in the cold open comes from the published `interactjs@1.10.28` tarball, measured rather than estimated:

| Claim | Verified |
| --- | --- |
| `main` resolves to the minified bundle | `"main": "dist/interact.min.js"`, and the package declares no `module` or `exports` field, so there is no readable entry to resolve to instead |
| Four lines, one of 98,079 characters | `dist/interact.min.js` is 98,203 bytes over four lines: 80, 0, 98,079, 40 |
| No tests, no docs, no changelog | The whole tarball is `LICENSE`, `README.md`, `bower.json`, `dist/`, `index.d.ts`, `index.js`, `index.prod.js` and their maps. No `describe(` appears anywhere in it |
| Minification erases the names | `internal` appears 45 times in `dist/interact.js` and never in the minified build; `actionName` 42 times; `dropEvents` 15 times |

An earlier draft used `@dnd-kit/core`, which does not support any of this: its `module` entry is a readable 3,969-line build that keeps 74 comments, its minified file tops out at 42,369 characters, and `collisionDetection` greps fine. Re-measure before swapping the library on that slide.
