import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'

import { copy, quickStart } from '../../code-samples.mjs'
import appCss from '../styles.css?url'

const { title: TITLE, tagline: TAGLINE, description: DESCRIPTION } = copy

/** Where the page lives, and the two places the thing it documents is published. */
const SITE = 'https://agent-reference.dev'
const REPOSITORY = 'https://github.com/mutewinter/agent-reference'
const NPM = 'https://www.npmjs.com/package/agent-reference'

const HEADLINE = `${TITLE} \u00B7 ${TAGLINE}`

/**
 * The link preview, drawn by og.mjs and committed under public/. Absolute,
 * because the crawler that reads it has no page to resolve a relative path
 * against.
 */
const CARD = `${SITE}/og.png`
const CARD_ALT = `${TAGLINE}. Under it, the one command that sets a project up: ${quickStart}.`

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { name: 'color-scheme', content: 'dark' },
      // The color a browser paints its own chrome with while the page loads,
      // so a phone does not flash white in front of a page this dark.
      { name: 'theme-color', content: '#101010' },
      { title: HEADLINE },
      { name: 'description', content: DESCRIPTION },
      // Indexing is the default; the preview size is not. Without this a search
      // result shows the card as a thumbnail rather than at full width.
      { name: 'robots', content: 'index, follow, max-image-preview:large' },

      // The title stays the bare name here. Every card puts the description
      // directly under it, and that description opens with the tagline, so
      // repeating it in both lines only spends the one line a card has.
      { property: 'og:title', content: TITLE },
      { property: 'og:description', content: DESCRIPTION },
      { property: 'og:type', content: 'website' },
      { property: 'og:site_name', content: TITLE },
      { property: 'og:url', content: SITE },
      { property: 'og:image', content: CARD },
      { property: 'og:image:type', content: 'image/png' },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height', content: '630' },
      { property: 'og:image:alt', content: CARD_ALT },
      // Everything else X reads it takes from the og tags above.
      { name: 'twitter:card', content: 'summary_large_image' },

      // A page about making a codebase legible to a machine should be legible
      // to one itself. This is what a crawler reads instead of guessing from
      // the prose which name, repository, and package the page is about.
      {
        'script:ld+json': {
          '@context': 'https://schema.org',
          '@type': 'SoftwareApplication',
          name: TITLE,
          description: DESCRIPTION,
          url: SITE,
          applicationCategory: 'DeveloperApplication',
          operatingSystem: 'macOS, Linux, Windows',
          codeRepository: REPOSITORY,
          downloadUrl: NPM,
          license: 'https://spdx.org/licenses/MIT.html',
          offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        },
      },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'canonical', href: SITE },
      { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
      // iOS will not take the SVG, so the same mark is committed as a PNG.
      { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
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
        <div className="mx-auto max-w-6xl px-6 pb-12">
          <Header />
          <main>{children}</main>
          <Footer />
        </div>
        <Scripts />
      </body>
    </html>
  )
}

function Header() {
  return (
    <header className="flex items-center justify-between border-b border-line py-4 text-sm">
      <a href="/" className="text-fg hover:text-accent">
        {TITLE}
      </a>
      <nav className="flex items-center gap-5 text-muted">
        <a href={`${NPM}/v/${__CLI_VERSION__}`} className="hover:text-accent">
          v{__CLI_VERSION__}
        </a>
        <a href={REPOSITORY} className="hover:text-accent">
          github
        </a>
        <a href={NPM} className="hover:text-accent">
          npm
        </a>
      </nav>
    </header>
  )
}

/**
 * The same two links as the header, for a reader who got to the bottom rather
 * than back to the top, under a line that is only half a joke: the config, the
 * skill, and most of this page were written by the thing they are for.
 */
function Footer() {
  return (
    <footer className="mt-20 flex items-center justify-between gap-5 border-t border-line py-4 text-sm text-muted">
      <span>Made by agents, for agents</span>
      <nav className="flex items-center gap-5">
        <a href={REPOSITORY} className="hover:text-accent">
          github
        </a>
        <a href={NPM} className="hover:text-accent">
          npm
        </a>
      </nav>
    </footer>
  )
}
