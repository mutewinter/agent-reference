import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { cloudflare } from '@cloudflare/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { createHighlighter } from 'shiki'
import { defineConfig } from 'vite'

import { commands, fixture } from './cli-reference.mjs'
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
 * Runs the CLI in this repository against a throwaway project and pastes what
 * it prints onto the page. The reference cannot drift from the tool, which is
 * the entire reason it is generated rather than written. Machine paths are
 * replaced with placeholders, because this site is public.
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

      const root = mkdtempSync(join(tmpdir(), 'agent-reference-site-'))
      // macOS hands back /var/... and resolves it to /private/var/..., so the
      // CLI prints a path that the un-resolved prefix does not match.
      const real = realpathSync(root)
      const project = join(real, 'my-app')
      const store = join(real, 'store')
      try {
        for (const [name, contents] of Object.entries(fixture)) {
          const file = join(project, name)
          mkdirSync(dirname(file), { recursive: true })
          writeFileSync(file, contents)
        }

        const cli = new URL('../src/cli.ts', import.meta.url).pathname
        const clean = (text: string) =>
          text.split(project).join('~/code/my-app').split(store).join('~/.agent-reference')

        const entries = commands.map(({ argv, note }) => {
          const out = execFileSync(
            process.execPath,
            ['--experimental-strip-types', cli, ...argv],
            {
              cwd: project,
              encoding: 'utf8',
              env: { ...process.env, AGENT_REFERENCE_STORE_DIR: store, NO_COLOR: '1' },
            },
          )
          return {
            note,
            command: `agent-reference ${argv.join(' ')}`,
            transcript: clean(`# ${note}\n$ agent-reference ${argv.join(' ')}\n${out.trimEnd()}`),
          }
        })

        return `export default ${JSON.stringify(entries)}`
      } finally {
        rmSync(real, { recursive: true, force: true })
      }
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
