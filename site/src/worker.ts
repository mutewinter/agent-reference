/**
 * The Worker in front of the prerendered site. Everything here still comes off
 * the assets layer; this entry exists for the one thing a static file cannot
 * do, which is answer the same URL differently depending on who asked.
 *
 * A browser sends `Accept: text/html` and gets the page it always got. An agent
 * sends `Accept: text/markdown` and gets /index.md, the same words without the
 * markup, under `Vary: Accept` so no cache hands one reader the other's copy.
 * A URL that matches nothing answers in whichever of the two the caller can
 * read, rather than an HTML error page a program has to scrape.
 *
 * wrangler.jsonc routes only `/` here first. Every other request is served by
 * the assets layer and reaches this handler only when nothing matched it.
 */
import startEntry from '@tanstack/react-start/server-entry';

import {
  HOMEPAGE_MARKDOWN,
  HOMEPAGE_TYPES,
  MARKDOWN_TYPE,
  NOT_FOUND_MARKDOWN,
  NOT_FOUND_TYPES,
  negotiatedHeaders,
} from '../agent-responses.ts';
import { chooseType } from '../negotiate.ts';

/**
 * The assets binding, declared in wrangler.jsonc. Typed here rather than from
 * `wrangler types`, whose output is generated and gitignored, so a fresh clone
 * still typechecks.
 *
 * Optional because the build calls this entry too: prerendering asks it for
 * every page and writes the HTML out, and at that point there is no deployment
 * and nothing bound. Every read of it below falls back to rendering.
 */
type Env = { ASSETS?: { fetch: (request: Request) => Promise<Response> } } | undefined;

/** A response with the same body and status, plus the headers a negotiation owes. */
function negotiated(response: Response, extra?: Record<string, string>): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries({ ...negotiatedHeaders(), ...extra })) {
    headers.set(name, value);
  }
  return new Response(response.body, { status: response.status, headers });
}

/**
 * The homepage, in whichever representation the caller asked for. The markdown
 * is read back off the assets layer rather than bundled here, so the file an
 * agent gets at /index.md and the one it gets from `/` are the same bytes.
 */
async function homepage(request: Request, env: Env): Promise<Response> {
  const type = chooseType(request.headers.get('accept'), HOMEPAGE_TYPES);

  // Nothing this URL has is acceptable to the caller. RFC 9110 lets a server
  // answer anyway, but a client that named neither HTML nor markdown asked for
  // something this site does not have, and saying so is the honest answer.
  if (type === undefined) {
    return new Response('Not Acceptable\n', {
      status: 406,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', ...negotiatedHeaders() },
    });
  }

  if (type === 'text/markdown') {
    const markdown = await env?.ASSETS?.fetch(new Request(new URL(HOMEPAGE_MARKDOWN, request.url)));
    if (markdown?.ok) return negotiated(markdown, { 'Content-Type': MARKDOWN_TYPE });
    // No markdown to hand over, so the page is the only representation there is.
    // Falling through beats a 404 on a URL that does have something to say.
  }

  // The prerendered file when there is one, and a render of it otherwise, which
  // is what the build itself asks for while it is writing that file.
  const prerendered = await env?.ASSETS?.fetch(request);
  return negotiated(prerendered?.ok ? prerendered : await startEntry.fetch(request));
}

/**
 * A URL that matched no asset and no route. The status is what it always was;
 * what changes is that a caller which did not ask for a browser page gets a few
 * lines of markdown naming the URLs that do exist, rather than the rendered
 * page it would have to parse to find them.
 *
 * A 404 never answers 406: that the address is wrong is the more useful fact,
 * and refusing to say it because the caller wanted a media type nobody serves
 * would leave it with nothing.
 */
function notFound(request: Request, rendered: Response): Response {
  const type = chooseType(request.headers.get('accept'), NOT_FOUND_TYPES) ?? 'text/markdown';
  if (type === 'text/html') return negotiated(rendered);

  return new Response(NOT_FOUND_MARKDOWN, {
    status: 404,
    headers: { 'Content-Type': MARKDOWN_TYPE, ...negotiatedHeaders() },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (new URL(request.url).pathname === '/') return homepage(request, env);

    const response = await startEntry.fetch(request);
    return response.status === 404 ? notFound(request, response) : response;
  },
};
