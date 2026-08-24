# agent-reference.dev

The project site. [TanStack Start](https://tanstack.com/start) on a Cloudflare Worker, every route prerendered to HTML at build time.

```bash
pnpm install && pnpm dev
```

`pnpm build` writes `dist/`, `pnpm preview` serves that build, and `pnpm deploy` builds and pushes to Cloudflare.

This directory is its own project with its own lockfile, not a workspace package, the same arrangement `talks/` uses. The library's `files` allowlist in the root `package.json` is opt-in, so nothing here reaches the published tarball.

## Conventions

- **Prerendered, not server-rendered.** `tanstackStart({ prerender: { enabled: true } })` in [vite.config.ts](./vite.config.ts) crawls from `/` and writes an HTML file per route. The Worker is still deployed, because Start's server entry is what serves those files, but no page is rendered per request. Anything added here has to survive being generated at build time.
- **The CLI's own visual language.** Monospace, hairline rules, and the middle dot the `status` output uses between a reference's facts. Amber carries every interactive and emphatic thing; green means one thing only, the same thing it means in the CLI, which is that a reference is on disk. Dark only, deliberately: a second palette is a second thing to keep honest.
- **One page, one thing to copy.** The only copy affordance on the site is `ForYourAgent` in [src/components/copy.tsx](./src/components/copy.tsx), the sentence a person says to their agent. Install commands deliberately have none: installing is the agent's job, and it is the one that knows which package manager this machine uses. `ForYourAgent` is also styled so it cannot be mistaken for tool output, because the authority to act on a brief has to come from the person rather than from something that looks like the tool talking.
- **Above the fold has to carry the whole idea.** A config file on the left, an agent resolving names on the right, a caption under each, then the prompt. Words explain it badly; the two panels explain it at a glance. Anything added here is measured against whether the prompt still lands above the fold on a 720-pixel viewport.
- **Snippets are highlighted in Node, at build time.** They live in [code-samples.mjs](./code-samples.mjs) and a plugin in [vite.config.ts](./vite.config.ts) runs Shiki over them and serves the HTML as `virtual:highlighted`. Shiki never reaches the browser or the Worker, which is the point: a prerendered page has nothing to highlight at runtime.
- **The stylesheet is the design system, and `pnpm lint` enforces it.** [.oxlintrc.json](./.oxlintrc.json) points `oxlint-tailwindcss` at [src/styles.css](./src/styles.css), so every class on the page is resolved against the tokens declared in `@theme`: `no-arbitrary-value` rejects a size or a color written into a class, and a misspelled class is an unknown class rather than a rule that silently does nothing. A new size belongs in `@theme` under a name. `1fr auto 1fr` and its kind are the one exception, because a grid track list is a layout rather than a token.
- **`pnpm check-types` is the only thing that typechecks.** `vite build` does not. The `.mjs` sample modules are in [tsconfig.json](./tsconfig.json) with `allowJs`, so TypeScript infers their shape from the literals instead of handing the page an `any`, which means a key in `examples` that no longer exists in `samples` is a type error rather than an empty panel.
- **One palette, taken from the syntax theme.** [jellybeans-plus.json](./jellybeans-plus.json) is Jellybeans+ by Simon Watts (MIT, vendored from `siwatts/jellybeans-theme-vscode` because a CI build cannot fetch it). Shiki highlights with it, and the tokens in [src/styles.css](./src/styles.css) are derived from the same file: panels use its editor background, body text its foreground, and the amber and green come from its own token colors. Changing the theme means changing both.
- **The link preview is drawn, not screenshotted.** [og.mjs](./og.mjs) renders `public/og.png` and `public/apple-touch-icon.png` with [Takumi](https://takumi.kane.tw), reading the tagline and the quick start command out of [code-samples.mjs](./code-samples.mjs) and the palette out of the `@theme` block in [src/styles.css](./src/styles.css), so the card cannot say something the page does not. It carries the two beats a person needs and nothing an agent would run: what the tool is for, and the one line to type. Run it by hand with `pnpm og` and commit the PNGs; it is deliberately not part of the build, because a deploy should not depend on a font download or a native renderer. Regenerate after changing the tagline, the quick start, the palette, or the mark.
- **The version comes from the CLI.** `vite.config.ts` reads `version` out of the repository root `package.json` and defines `__CLI_VERSION__`, so the badge in the header cannot disagree with the package it links to.
- **This page is the source the README renders from.** Every word the page says about itself lives in [code-samples.mjs](./code-samples.mjs): the tagline and meta description, the two get-started headings, the examples, and the section copy. `scripts/sync-readme.mjs` renders them, plus the transcripts from [cli-reference.mjs](./cli-reference.mjs), into the marked regions of [the README](../README.md), and a test fails when it is behind. Change the copy here and run `npm run sync-readme` at the root. The README's reference sections below `## Configure` are written for a README and have no counterpart here.

## Deployment

Pushing to `main` builds and deploys through Workers Builds. Other branches build too and get a preview URL rather than production, which works here only because this Worker has no Durable Objects; Cloudflare does not generate preview URLs for Workers that do.

The Worker is `agent-reference-site` and serves `agent-reference.dev` as a custom domain, declared in [wrangler.jsonc](./wrangler.jsonc). The name there and the name in the Cloudflare dashboard have to match or every build fails.

The build renders the CLI reference by running the CLI out of the repository root, and that CLI imports its own dependencies. A build installs this directory's lockfile and nothing else, which leaves the root without `node_modules` and the first command failing to resolve `semver`, so `pnpm build` runs [cli-deps.mjs](./cli-deps.mjs) first: it installs the root's runtime dependencies when they are not already resolvable, and on a machine that has installed the root it does nothing.

## Gotchas

- `allowBuilds` in [pnpm-workspace.yaml](./pnpm-workspace.yaml) is a map of name to boolean, not a list. A YAML sequence is silently rewritten to keys `'0'`, `'1'` and matches nothing, so the install keeps failing with `ERR_PNPM_IGNORED_BUILDS` while the setting looks present.
- Route components are prerendered, so anything reaching for `window` has to do it in an effect or an event handler.
- [public/sitemap.xml](./public/sitemap.xml) lists routes by hand, because there is one. A second route means a second entry there, and the canonical URLs it and [src/routes/__root.tsx](./src/routes/__root.tsx) carry have no trailing slash, matching the `html_handling` in [wrangler.jsonc](./wrangler.jsonc).
