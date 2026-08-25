# Two readers, one URL

## Context

The site is one prerendered page served off Cloudflare's assets layer. It is written for a person, and it earns that: the hero holds a config still while two agent sessions move past it, the panels are highlighted with the same theme the CLI colors with, and the whole thing is measured against whether the prompt still lands above the fold.

The other half of its readership cannot see any of it. An agent that fetches `https://agent-reference.dev` gets 40 KB of markup wrapping the same words, and has to guess from prose which of them are the config format and which are the pitch. That is a strange thing for this project in particular to serve, since the tool exists because a docs site is a worse source than the repository behind it.

Two audits of the domain, run against the checklists at is-agentic.com and isitagentready.com, said the same thing from the outside. There was no markdown representation and no `Vary`, so a cache could hand either reader the other one's copy. There was no llms.txt, so nothing said what the domain publishes or when an agent should reach for the tool at all. A wrong URL returned a real 404 and then rendered the page's own shell into it, which is a fine answer for a browser and nothing at all for a program.

Both checklists also list a dozen things this site has no honest way to satisfy. It has no HTTP API, so it has no OpenAPI document, no `/.well-known/api-catalog`, and nothing to authenticate against. It runs no MCP server and exposes no browser tools. Publishing a manifest for any of them would describe a service that does not exist.

## Decision

The site answers to both readers at the same URLs, out of the same source, and publishes nothing it does not have.

`site/page-markdown.ts` renders the page's own words as markdown. It is the same module `scripts/sync-readme.ts` has always used to fill the README, so the page, the README, and `/index.md` are three renderings of `site/code-samples.ts` and cannot disagree. `scripts/sync-agent-files.ts` writes that markdown, an llms.txt, the skill, and the config schema into `site/public/`, and a test fails when what is committed is behind what the renderers produce.

The homepage negotiates. `Accept: text/markdown` gets `/index.md`; anything else gets the page it always got; `Vary: Accept` goes on both so no cache confuses them. That needs a request-time decision, which a static file cannot make, so `wrangler.jsonc` routes `/` to a Worker before the assets layer answers it. Only `/`: everything else is still served straight from assets, and reaches the Worker only when nothing matched, which is the 404. A URL that matches nothing hands markdown to a caller that did not ask for a browser page, naming the four URLs that do exist, so an agent that guessed wrong can recover from the response it already has instead of parsing an error page for links.

What gets published is what the project actually has. llms.txt says when to reach for this tool, in jobs rather than in pitch, and lists the page, the skill, the schema, the repository, and the package. `Link` headers advertise the markdown alternate and llms.txt with registered relation types and nothing else. The catalogs, the auth metadata, and the server cards are all absent, and this is where that is written down.

The skill is published twice, because the well-known convention for skills forked and neither half can express the other. `/.well-known/agent-skills/` is the Agent Skills Discovery RFC, where an entry carries a `url` and a sha256 digest over the bytes at it; that is the tree a readiness scanner grades, and no installer reads it yet. `/.well-known/skills/` is what `npx skills add https://agent-reference.dev` reads, where an entry names its files instead and the client fetches each one from beside the index; that tree has no integrity field at all, and it is the one that actually installs. Publishing only the graded one would have been a checkbox. `npx skills add` is already the install route [the stub and the served guide](2026-08-20-a-stub-on-disk-and-a-served-guide.md) chose, because the installer records where a file came from and a copy does not, so the tree that route reads is the one worth having. Both are written by the same script from the one `SKILL.md` in the package, and a test hashes every served copy against it.

## Consequences

The homepage costs a Worker invocation it did not cost before. That is the price of the URL having two representations at all, and it is bounded: one route, and the Worker's own answer is the prerendered file read back off the assets binding rather than a render.

`Accept: application/pdf` on the homepage is now a 406 rather than the page. RFC 9110 allows either, and the acceptmarkdown.com checklist asks for the refusal; the exposure is a client that names a media type this site does not have and no wildcard, which no browser and no unfurler sends.

Anything added to the page has a second surface to keep honest. A new section is a new `## ` in `/index.md`, and the test that checks the markdown headings against the page's own is what says so. That is the same bargain the README already made, and the reason both are rendered from one place rather than written twice.

The published skill is a second copy of `skills/agent-reference/SKILL.md`, and only the sync script keeps it a copy. The guide is deliberately not published beside it: [the stub on disk and the served guide](2026-08-20-a-stub-on-disk-and-a-served-guide.md) exists because instructions that describe a moving format have to come out of the binary being run, and a URL is not that binary. The skill is the artifact meant to travel, so the skill is the one that travels.
