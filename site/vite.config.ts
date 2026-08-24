import { readFileSync } from 'node:fs'

import { cloudflare } from '@cloudflare/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { createHighlighter } from 'shiki'
import { defineConfig } from 'vite'

import { renderCliReference } from './cli-reference.mjs'
import { samples } from './code-samples.mjs'

// The site states the version of the CLI it documents, read from the package
// at the repository root rather than restated here, so the two cannot disagree.
const cliVersion = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
).version

// Jellybeans+ by Simon Watts, MIT, vendored from siwatts/jellybeans-theme-vscode
// because a build in CI cannot fetch it. The page palette in styles.css is
// derived from the same file, so highlighted code and chrome agree.
const THEME = JSON.parse(
  readFileSync(new URL('./jellybeans-plus.json', import.meta.url), 'utf8'),
)

/**
 * Highlights every snippet once, in Node, and serves the HTML as a virtual
 * module. Shiki stays a build-time dependency: none of it ships to the browser
 * or to the Worker, and a prerendered page needs no highlighting at runtime.
 */
function highlightedSnippets() {
  const id = 'virtual:highlighted'
  const resolved = '\0' + id

  return {
    name: 'highlighted-snippets',
    resolveId(source: string) {
      return source === id ? resolved : undefined
    },
    async load(loaded: string) {
      if (loaded !== resolved) return undefined
      const highlighter = await createHighlighter({
        themes: [THEME],
        langs: [...new Set(Object.values(samples).map((s) => s.lang))],
      })
      // The raw source travels with the rendered HTML: the page offers these
      // for copying, and a clipboard wants the text, not the markup.
      const rendered = Object.fromEntries(
        Object.entries(samples).map(([name, sample]) => [
          name,
          {
            html: highlighter.codeToHtml(sample.code, { lang: sample.lang, theme: THEME.name }),
            code: sample.code,
          },
        ]),
      )
      return `export default ${JSON.stringify(rendered)}`
    },
  }
}

/**
 * Serves the generated CLI reference as a virtual module. The generating lives
 * in cli-reference.mjs, next to the fixture it runs against, because the README
 * pastes the same transcripts.
 */
function cliReference() {
  const id = 'virtual:cli-reference'
  const resolved = '\0' + id

  return {
    name: 'cli-reference',
    resolveId(source: string) {
      return source === id ? resolved : undefined
    },
    load(loaded: string) {
      if (loaded !== resolved) return undefined
      return `export default ${JSON.stringify(renderCliReference())}`
    },
  }
}

export default defineConfig({
  resolve: { tsconfigPaths: true },
  define: { __CLI_VERSION__: JSON.stringify(cliVersion) },
  plugins: [
    highlightedSnippets(),
    cliReference(),
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    tailwindcss(),
    // Every route is prerendered to HTML at build time and served from the
    // assets layer. The Worker stays in the deployment because Start's server
    // entry is what serves them, but no page is rendered per request.
    tanstackStart({ prerender: { enabled: true, crawlLinks: true } }),
    viteReact(),
  ],
})
