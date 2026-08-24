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
- **Two kinds of copyable block**, in [src/components/copy.tsx](./src/components/copy.tsx). `Command` is shell you run yourself. `ForYourAgent` is a sentence you say to an agent, and it is styled so it cannot be mistaken for tool output, because the authority to act on a brief has to come from the person, not from something that looks like the tool talking.
- **Copy that matches the README.** The site and [the README](../README.md) make the same claims about the same tool. When one changes, check the other.

## Deployment

Pushing to `main` builds and deploys through Workers Builds. Other branches build too and get a preview URL rather than production, which works here only because this Worker has no Durable Objects; Cloudflare does not generate preview URLs for Workers that do.

The Worker is `agent-reference-site` and serves `agent-reference.dev` as a custom domain, declared in [wrangler.jsonc](./wrangler.jsonc). The name there and the name in the Cloudflare dashboard have to match or every build fails.

## Gotchas

- `allowBuilds` in [pnpm-workspace.yaml](./pnpm-workspace.yaml) is a map of name to boolean, not a list. A YAML sequence is silently rewritten to keys `'0'`, `'1'` and matches nothing, so the install keeps failing with `ERR_PNPM_IGNORED_BUILDS` while the setting looks present.
- Route components are prerendered, so anything reaching for `window` has to do it in an effect or an event handler.
