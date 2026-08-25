# Your Agent is Starving

Talk for [NashJS](https://www.meetup.com/nashjs/events/316153682/), August 25, 2026, at Vaco Nashville.

Built with [Slidev](https://sli.dev). Slides live in [slides.md](./slides.md).

```bash
pnpm install && pnpm dev
```

The public view is <http://localhost:6181>, the presenter view with notes and a timer is <http://localhost:6181/presenter>, and `pnpm export` writes a PDF (add `playwright-chromium` first).

This directory is its own project with its own lockfile, not a workspace package. The library's `files` allowlist already excludes it from the published tarball, so the only question a workspace would answer is whether `pnpm install` at the repository root should also install a presentation framework. It should not.

## Conventions

- **Swiss look.** [style.css](./style.css) ports the Marp theme from the previous talk: Helvetica, black on white, one idea per slide. The `anti-pattern`, `outcome`, and `dark` classes carry the emotional beats and are applied per slide with `class:` in the slide's frontmatter.
- **Speaker notes** are the trailing HTML comment in a slide. They show only in the presenter view.
- **Terminal output is text, not screenshots.** `pnpm capture` runs the CLI from this repository's working tree against a throwaway project of public dependencies and writes the ANSI to `snippets/`, which Shiki renders on the slide. The colors are the tool's own, the text stays selectable and scales to any projector, and a slide cannot keep showing output the code stopped producing. Re-run it after any change to the CLI's output.
- **Nothing machine-specific on a slide.** The capture project holds pinned public coordinates and no lockfile, so no local path or private repository name can reach a public deck.
- Editing a file under `snippets/` does not hot-reload. Restart the dev server to see a new capture.
