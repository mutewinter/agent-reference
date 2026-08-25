/**
 * What the Worker answers with once negotiate.ts has decided which reader it is
 * talking to. Strings only, and no import of anything Node: this file is
 * bundled into the Worker, and the repository's own test suite reads it too, to
 * check that every path named here is a file the site actually serves.
 */

/** The two representations the homepage has, in the order the server prefers. */
export const HOMEPAGE_TYPES = ['text/html', 'text/markdown'] as const;

/**
 * The same two, with markdown first. A missing or wildcard `Accept` picks the
 * head of this list, which is what hands an agent something it can act on when
 * a URL turns out not to exist, while a browser saying `text/html` still gets
 * the page.
 */
export const NOT_FOUND_TYPES = ['text/markdown', 'text/html'] as const;

export const MARKDOWN_TYPE = 'text/markdown; charset=utf-8';

/** Where the markdown of the homepage is served from, and read back by the Worker. */
export const HOMEPAGE_MARKDOWN = '/index.md';

/**
 * Machine-readable descriptions of this page, advertised in RFC 8288 `Link`
 * headers so an agent that fetched the HTML learns they exist without parsing
 * it. `alternate` is the same page in another media type; `describedby` is the
 * document that says what this domain publishes and when the tool is worth
 * reaching for.
 */
export const LINK_HEADER = [
  `<${HOMEPAGE_MARKDOWN}>; rel="alternate"; type="text/markdown"`,
  '</llms.txt>; rel="describedby"; type="text/plain"',
].join(', ');

/**
 * The body of a 404, for a reader with no page to look at. Short on purpose: it
 * exists so an agent that guessed a URL wrong learns where the real ones are
 * listed instead of parsing an HTML error page for links.
 */
export const NOT_FOUND_MARKDOWN = `# 404 Not Found

Nothing is served at this address. These are:

- [/](/): agent-reference, the homepage
- [/index.md](/index.md): the same page as markdown
- [/llms.txt](/llms.txt): everything this domain publishes for agents, and when to reach for the tool
- [/sitemap.xml](/sitemap.xml): every page here
`;

/** Headers every negotiated response carries, whichever representation it is. */
export function negotiatedHeaders(): Record<string, string> {
  return {
    // Without this a cache that stored the HTML can hand it to an agent that
    // asked for markdown, or the other way round, depending on which one it saw
    // first. The negotiation is only true if the cache is told about it.
    Vary: 'Accept, Accept-Encoding',
    Link: LINK_HEADER,
  };
}
