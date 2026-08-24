import { readFileSync } from 'node:fs'

import { cloudflare } from '@cloudflare/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { createHighlighter } from 'shiki'
import { defineConfig } from 'vite'

import { samples } from './code-samples.mjs'

// The site states the version of the CLI it documents, read from the package
// at the repository root rather than restated here, so the two cannot disagree.
const cliVersion = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
).version

const THEME = 'vitesse-dark'

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
      const html = Object.fromEntries(
        Object.entries(samples).map(([name, sample]) => [
          name,
          highlighter.codeToHtml(sample.code, { lang: sample.lang, theme: THEME }),
        ]),
      )
      return `export default ${JSON.stringify(html)}`
    },
  }
}

export default defineConfig({
  resolve: { tsconfigPaths: true },
  define: { __CLI_VERSION__: JSON.stringify(cliVersion) },
  plugins: [
    highlightedSnippets(),
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    tailwindcss(),
    // Every route is prerendered to HTML at build time and served from the
    // assets layer. The Worker stays in the deployment because Start's server
    // entry is what serves them, but no page is rendered per request.
    tanstackStart({ prerender: { enabled: true, crawlLinks: true } }),
    viteReact(),
  ],
})
