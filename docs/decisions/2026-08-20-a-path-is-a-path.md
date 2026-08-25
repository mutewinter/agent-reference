# A reference to something local is a path, whether it is a folder or a file

## Context

The config had three kinds: `packages`, `git`, and `folders`. A file worked in `folders`
already, because folder handling only ever asked whether the path existed and never whether
it was a directory. Nothing said so. The schema described the key as "Local folders", status
printed `folder` beside a `.md` file, and the owner of the project had to ask whether his own
tool supported it. A capability nobody can discover is not a feature.

Pointing a reference at one file is the common case, not an edge: one note out of a vault, a
brief, a checklist, a spec. The value of a reference is the description that says when to open
it, and that argument does not change with the number of files behind the name.

## Decision

`folders` is renamed to `paths`, holding files and folders alike. The three kinds now read by
where the source comes from rather than by what shape it has: `packages` from a registry, `git`
from a remote, `paths` from what is already on this machine.

Whether a path is a file or a folder is never declared. `status` stats it and reports what it
found, so a path reference renders as `file` or `folder`, and as `path` when nothing is there
to have a shape. `--json` carries the same fact as `pathType` beside `kind: "path"`.

This follows from [a config entry being a coordinate, not a query](2026-08-20-coordinates-not-queries.md).
A path is a coordinate. Its shape on disk is a fact about one machine at one moment, in the
same family as `ready` and `missing`. Splitting the key into `folders` and `files` would have
moved that fact into the config, so turning `notes.md` into `notes/` would break a config that
was correct, and `sets` would carry a fourth member array to keep the split alive.

The old key is rejected at parse time, naming its replacement:

```
folders was renamed to paths, which holds a folder or a file.
Rename the key; every entry inside it is unchanged.
```

A generic "unknown key" would have been true and useless, and the edit distance between the two
words is too large for the existing did-you-mean suggestion to bridge. Nothing is silently
accepted under both names: two vocabularies for one concept is the cost this rename was paid to
avoid.

## Consequences

Every config declaring `folders` fails until the key is renamed, which is the intended migration
and is cheap while the package is pre-launch and its configs are countable. Qualified selectors
change with it: `folder:notes` is now `path:notes`, as a positional selector and in the
ambiguity error that suggests them.

`paths` does not settle what a reference to a *set* of files should be, a glob or a directory
plus a filter. Nothing asks for that yet, and a path stays a coordinate until something does.
