# Any directory is a project

## Context

The CLI required a `package.json` and a supported lockfile before any command would run,
so `status` in a non-Node repo, or in any plain folder, was an immediate error. The tool is
meant to serve any repository, and non-Node ecosystems (Python, Rust) are expected later.

## Decision

Project resolution anchors on the nearest agent-reference config, walking up from the
working directory; failing that, the nearest lockfile's root; failing that, the directory
itself. The lockfile is optional context: without one there are simply no package
references, and folders and git references work everywhere. An empty directory reports "no
references configured" rather than erroring.

## Consequences

- `status`, `get`, and `validate` work in any repo, any language, or no repo at all.
- The lockfile scanners now sit behind one optional input (`LockfileProjectContext`),
  which is the seam a Python or Rust ecosystem would plug into: another way to turn a
  name into an exact version and repository, feeding the same store and verify gate.
- Config discovery walking up to the filesystem root means a config in a home directory
  would apply to everything under it. That is undesigned today, but it is the same
  mechanism a deliberate user-global scope would use.
