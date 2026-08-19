# Sets replace groups

## Context

Groups collected references through a secondary structure: membership strings repeated on
each entry, plus a separate `groups` object holding descriptions. Real users keep these
collections as labeled lists (a heading sentence, then paths), and the group machinery
expressed that sideways: the heading lived at the bottom of the file, the name key
duplicated the folder basename, and glancing at the config showed mechanism before
meaning. The indirection also meant an agent setting up a config had nothing inviting it
to mirror the user's actual collections.

## Decision

A `sets` array replaces `groups`. Each set is a labeled list: a required `description`
that says what the collection is for (and doubles as the status heading), an optional
short `name` for CLI selection, and members declared inline under `folders`, `git`, and
`packages`. Member names derive from the path or repository basename, overridable with
`name`. The same reference listed in several sets merges into one reference with several
labels; two declarations disagreeing about a name's target is an error. Top-level
`folders`, `git`, and `packages` remain for uncollected references, and reference-level
membership strings are gone.

Selection accepts a set's name, its exact description, or any substring matching exactly
one set, so "the documentation sources" works in chat and as `--set documentation` alike.
`status` renders each set as its own subsection under its description, inside the scope
section of the file that declared it.

## Consequences

- The config reads the way the collection was written: heading first, members under it.
- Repetition across sets is allowed and cheap; there is no cross-membership machinery to
  keep normalized.
- Cross-kind collections still work, since one set can hold folders, git repositories,
  and packages together.
- Sets are per-file: a set declared in the committed config and another with the same
  description in the local file are two sets. Merging them across scopes is future work
  if it ever matters.
