# One shape for a reference, and a description is required

## Context

[One references map](2026-08-25-one-references-map.md) folded four top-level keys into one, and left four shapes behind the values in it: a source string, an object with `source`, a bare array, and an object with `references`. Inside a set, an array index cannot be a name, so members carried an optional `name` and otherwise took the basename of their source.

The shapes were built for a writer optimizing keystrokes. That writer does not exist. Parsing every config on this machine, 8 files holding 26 top-level entries and 43 references once sets are flattened:

- the string shorthand: 0 uses, at the top level and as a set member
- the bare array set: 0 uses; all 7 sets carry the object form and its heading
- the object with `source`: 19 uses, and all 19 carry a `description`
- set members: 24, every one an object, every one with a description, and exactly 1 declaring a `name`
- source spellings: 28 rooted paths, 11 `github:`, 4 `npm:`, and no bare `owner/repo`, bare package name, or `#ref` inside a source

Every `configPatch` the tool emits already used the object form and only the object form, without being told to. The actual writer is an agent, and an agent is not saving keystrokes: it is writing for the next agent, so it reaches for the form with room to say why.

## Decision

**A value is an object, holding either `source` or `references`.** The string shorthand and the bare array are gone, and each is a parse error naming what replaced it, following the `folders`-to-`paths` precedent.

**A set's members are a map keyed by name**, exactly as the top-level map is, so a member is written the way a top-level entry is and `name` is gone with the array that made it necessary. Every name `get` accepts is now a key written down in the file; before this, a member's handle was derived from a basename and appeared only in `status` output.

**`description` is required, on a reference and on a set alike.** It is the whole value of a reference to a future agent: a name is what the agent already has, and what it needs is when the thing behind the name is worth opening. Requiring it costs nothing that anyone is doing today, and the shorthand that was removed is exactly the shape that let an agent skip it.

**A `configPatch` carries the description of the entry it patches**, and `<when to read this, and what it answers>` only when it is adding one. A patch is pasted into a config, so a placeholder over an existing entry would destroy the sentence its own fix text tells you to edit.

**The source string is unchanged**, including the bare `owner/repo` and bare `name@version` shorthands that no config uses. It reads like the loose part and is the invariant worth protecting: `get <spec>` and a `source` value are the same string through one classifier, so a spelling that works in one works in the other by construction. Refusing the shorthands in the config alone would break that to save one regex, and declaring the kind instead is what the previous decision removed.

## Consequences

- Every existing config fails to parse until it is rewritten, one day after the last time that was true. Eight configs exist, all agent-editable, and the package is pre-launch; this is the last cheap moment.
- The examples get taller. The README hero ended on a one-line entry chosen to show how little a reference costs, and it is four lines now. It also stops changing shape halfway through, and what fills the extra lines is the description, which is the thing being sold.
- Two errors disappear because the ambiguity behind them does. A member could be a bare string that was also the name of another reference, which both readers of the guide wrote and which the parser had to name; and an array item could itself be an array. A map key is a name and its value is a reference, so neither reading exists.
- The basename collision that [one references map](2026-08-25-one-references-map.md) recorded as a new problem, two members deriving one name, cannot be expressed.
- Duplicate JSON keys still collapse silently in `JSON.parse`, and a set's members are now a second place that can happen. That is the same open item it was before, one level deeper.
