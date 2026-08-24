import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'

import { copy } from '../../code-samples.mjs'
import appCss from '../styles.css?url'

const { title: TITLE, tagline: TAGLINE, description: DESCRIPTION } = copy

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { name: 'color-scheme', content: 'dark' },
      { title: `${TITLE} \u00b7 ${TAGLINE}` },
      { name: 'description', content: DESCRIPTION },
      { property: 'og:title', content: TITLE },
      { property: 'og:description', content: DESCRIPTION },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
    ],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <div className="mx-auto max-w-6xl px-6 pb-24">
          <Header />
          <main>{children}</main>
        </div>
        <Scripts />
      </body>
    </html>
  )
}

function Header() {
  return (
    <header className="flex items-center justify-between border-b border-line py-4 text-[13px]">
      <a href="/" className="text-fg hover:text-accent">
        agent-reference
      </a>
      <nav className="flex items-center gap-5 text-muted">
        <a
          href={`https://www.npmjs.com/package/agent-reference/v/${__CLI_VERSION__}`}
          className="hover:text-accent"
        >
          v{__CLI_VERSION__}
        </a>
        <a href="https://github.com/mutewinter/agent-reference" className="hover:text-accent">
          github
        </a>
        <a href="https://www.npmjs.com/package/agent-reference" className="hover:text-accent">
          npm
        </a>
      </nav>
    </header>
  )
}
