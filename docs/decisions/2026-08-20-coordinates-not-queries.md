# A config entry is a coordinate, never a query

## Context

A `folders` entry is a path. A `git` entry is a repository plus a ref. Both are inert: they
mean the same thing on every machine and next month. A `packages` entry was different. It
could say `"installed"`, meaning "whatever this project has right now", which is not a fact
but a question, executed at read time against a file the tool does not own.

Three failures in one dogfooding session traced back to that. Reproduced against a scratch
workspace, from the repository root of a monorepo:

- `get <dep>` returned the registry's **latest** version, silently, exit zero, labeled
  `verified`, because the lockfile scan read only the importer nearest the working directory
  and a dependency held by a workspace package looked like one nothing installed. The
  README's central promise is that a checkout cannot drift from what is installed. In a
  workspace it silently did, and the confidence label endorsed the result.
- With every importer read, a name installed at two versions resolved to whichever version
  sorted first as a *string*, so `1.10.0` would beat `1.9.0`. Also silent, also `verified`.
- A workspace dependency, recorded in the lockfile as `link:../shared`, had that string sent
  to the npm registry, and the answer was an HTTP 404 for source sitting in the repository.

The same session showed the cost of the surrounding failure paths. A repository that could
not be cloned printed the tag-pinning advice, which tells an agent to run `git tag --list`
inside a bare repository that was never created, and names `ref` when `repository` is the
key that is wrong. A version with no matching tag printed a full explanation and a config
patch from `status`, and from `get` printed one word, `fallback`, and exited zero. `get` is
the verb an agent runs.

## Decision

Every config entry is a fixed coordinate. `packages` survives, holding an exact version and
nothing else: `"installed"`, semver ranges, and dist-tags are rejected at parse time, with
the error naming `agent-reference versions <name>` as the way to find the number.

The lockfile is still read, but never to resolve a declared reference. It has three jobs
now, all of them answering questions rather than deciding outcomes:

- `versions <name>`, a read-only verb reporting every version this project installs and
  which workspace package installs it. It cannot fail the way `get` can: an absent package
  or an unreadable ecosystem is an answer with a reason attached.
- Backing the bare `get <name>` shorthand. Every importer is read; the importer the command
  ran in wins when several disagree; anything still ambiguous is reported with the
  coordinates to choose from, and never guessed. A name nothing installs still resolves from
  the registry, because looking at a library before adopting it is a real use, but the result
  says where the version came from.
- Auditing pins for drift. `status` reports a pinned version that no longer matches what the
  project installs, offline and for free. It reports; it never follows. A pin is a decision
  somebody made.

Two rules about what a path is allowed to mean:

- A package subdirectory is used only when a `package.json` there reports this exact name
  **and** version. A name alone is not enough, because repositories bundle demo apps that
  claim the package's name. When nothing confirms, the path is the repository root.
- A `directory` set in the config wins outright, the way a pinned ref does, and a manifest
  there that disagrees leaves the commit unconfirmed rather than sending it to a fallback.

Coordinates may carry an ecosystem prefix, `npm:zod@3.22.0`. npm is the default and the only
one resolved today; the prefix is accepted and printed back now rather than retrofitted once
coordinates are sitting in committed configs.

Finally, every failure exit hands back the same three things: what was tried, what was
found, and the exact config key to change. A failed clone names `repository`, not `ref`. A
fallback checkout carries its problem and its config patch on `get`, not only on `status`.

## Consequences

- `allImporters` is gone as behavior. The key still parses, and `validate` says it does
  nothing, because a key that silently stopped working is the failure this decision exists to
  prevent.
- Package support stops being load-bearing for whether the tool works. `get name@version`
  needs no lockfile at all and already runs in a Python or Rust repository; teaching
  `versions` to read another ecosystem's lockfile is an upgrade that cannot break `get`. That
  is the answer to whether every package manager has to be supported: none of them do.
- Existing configs using `"installed"` fail to parse. Nothing has shipped, and the error
  names the command that produces the replacement value.
- Drift is now reported where it was previously silent, but only for pins. A `git` reference
  tracking a branch still drifts unobserved, since noticing would cost a fetch and `status`
  is offline by design.
- Relayed text is stripped of control characters before it reaches the human formatter. This
  decision adds git's stderr and registry metadata to what gets printed, and the surrounding
  work established that authority comes from the user's prompt rather than the tool's stdout;
  output shaped like instructions must not be forgeable by a config or a repository.
