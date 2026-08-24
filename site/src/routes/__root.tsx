import { HeadContent, Link, Scripts, createRootRoute } from '@tanstack/react-router'

import appCss from '../styles.css?url'

const TITLE = 'agent-reference'
const DESCRIPTION =
  'A CLI that gives coding agents readable upstream source on demand: any dependency at the exact version your lockfile installs, any git repository, any local folder, all by name.'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { name: 'color-scheme', content: 'dark' },
      { title: `${TITLE} — readable upstream source for coding agents` },
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
        <div className="mx-auto flex min-h-screen max-w-3xl flex-col px-5">
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
        </div>
        <Scripts />
      </body>
    </html>
  )
}

function Header() {
  return (
    <header className="flex items-center justify-between border-b border-line py-4">
      <Link to="/" className="text-fg hover:text-accent">
        agent-reference
      </Link>
      <nav className="flex gap-4 text-muted">
        <Link to="/docs" className="hover:text-accent">
          docs
        </Link>
        <a
          href="https://github.com/mutewinter/agent-reference"
          className="hover:text-accent"
        >
          github
        </a>
        <a href="https://www.npmjs.com/package/agent-reference" className="hover:text-accent">
          npm
        </a>
      </nav>
    </header>
  )
}

function Footer() {
  return (
    <footer className="mt-20 flex flex-wrap items-center justify-between gap-2 border-t border-line py-5 text-[12px] text-faint">
      <span>MIT licensed. Needs Node 20+ and git 2.19+.</span>
      <span>Nothing is fetched until an agent asks for it.</span>
    </footer>
  )
}
