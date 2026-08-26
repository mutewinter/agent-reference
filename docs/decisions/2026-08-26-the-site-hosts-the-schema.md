# The site hosts the schema, not a package CDN

## Context

A config carries a `$schema` line, and `agent-reference schema` prints the same document out of the installed CLI. Both need a URL an editor can fetch. That URL gets committed into every user's config, which makes it close to permanent and worth getting right once.

The first choice resolved through npm's `latest` dist-tag on a package CDN. It returned 404, because `latest` still pointed at the first alpha and that tarball had no `schema/` directory. Moving the tag fixed it. The URL was then pinned to the major, on the reasoning that a pin keeps a future 2.0 schema off 1.x configs, and that the pin would go live with a 1.0.0 publish expected the same day.

The publish slipped. A semver range excludes prereleases, so a major-pinned URL matches nothing while every published version is a prerelease, and it 404s. The pin also reached the default branch inside an unrelated config-reshape commit rather than riding a release, so the config this repository ships and the README generated from the schema both named a URL that did not resolve.

The argument that had carried the CDN over self-hosting was drift, and it runs the direction that hurts. The site deploys on push; the package publishes on release. A self-hosted schema therefore describes the default branch while the installed CLI enforces the last release, and because `assertKnownKeys` fails on anything it does not recognize, an editor would complete a key the binary refuses. A URL that resolves through a published tarball cannot get ahead of a release that way.

That argument survives, but it is smaller than it first reads. A major-pinned URL resolves to the newest release in that major, so it never eliminated drift either; it capped drift at the newest published version instead of the newest commit. The difference between the two is only what is merged and not yet published, and this project publishes on every format change.

What does not survive is the cost. Correctness under the pin depends on release-day sequencing: the edit is dead until the publish lands and has to travel with it. That sequencing failed the first time it was attempted, and the repository carried a broken `$schema` for a day as a result.

## Decision

The canonical URL is `https://agent-reference.dev/schema/agent-reference.schema.json`. It is the `$id` inside the schema, the `$schema` this repository's own config carries, and the string the demo config on the slides writes.

Nothing new had to be built for it. `scripts/sync-agent-files.ts` has copied that document into the site's assets since [the site started answering agents](2026-08-25-two-readers-one-url.md), `site/public/_headers` already serves it as `application/schema+json` with an open `Access-Control-Allow-Origin`, and a test already fails when the served copy is not byte-identical to the one in the package. The URL was live and correct for the entire time the pinned one was returning 404.

The CLI remains the authority. `agent-reference schema` prints the document from the installed binary, and `agent-reference validate` decides whether a config is valid. The hosted copy exists for an editor, and for an agent writing a config before anything is installed.

## Consequences

An editor can complete a key that a sufficiently old installed CLI rejects, for as long as a format change sits merged and unpublished. The bound on that window is release cadence rather than the URL, and the failure is legible rather than silent: `validate` names the unknown key and lists the ones that are valid.

Keeping a future breaking schema away from existing configs becomes a path rather than a version range. If a 2.0 format is ever on the horizon, the site serves it under a versioned path and configs keep pointing at the one they were written against. Nothing is versioned before there is a second version to distinguish, because a `v1` in the URL while no v2 exists is the restated version number this repository avoids everywhere else.

The schema's availability is now the site's availability. llms.txt, the published skill, and the markdown homepage already depend on it, so this adds a document to an existing dependency rather than introducing a new one.
