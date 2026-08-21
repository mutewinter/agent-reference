---
theme: none
title: Your Agent is Starving
titleTemplate: "%s"
transition: none
fonts:
  mono: JetBrains Mono
---

# Your Agent is Starving

NashJS &middot; August 25, 2026

<!--
Proof of concept, not the talk. The question this deck answers: how hard is it
to put syntax-highlighted terminal output on a Slidev slide, and which of the
treatments actually reads from the back of the room.
-->

---
layout: statement
class: dark
---

# Six ways to put a terminal on a slide

<!--
Every block below is real output from the real CLI, pasted or piped in. None of
it is a screenshot, so all of it stays selectable, scalable, and re-recordable
after the CLI changes.
-->

---

## 1. A plain fence

```bash
$ agent-reference get semver
agent-reference: updating npm/node-semver
semver@7.8.4 -> ~/.agent-reference/src/github.com/npm/node-semver/8640bd68f165
```

Zero setup. Shiki highlights the shell, but the output lines are all one color,
because to a highlighter they are not code.

<!--
This is the free option. It is also the one that looks like a README.
-->

---

## 2. Terminal chrome

<Term title="agent-reference">

```bash
$ agent-reference get semver
agent-reference: updating npm/node-semver
semver@7.8.4 -> ~/.agent-reference/src/github.com/npm/node-semver/8640bd68f165
```

</Term>

A 60-line Vue component wrapping the same fence. The frame says "this is a real
machine" without a word of narration.

---

## 3. Real ANSI, piped straight in

<Term title="agent-reference status">

<<< @/snippets/status.ansi

</Term>

<!--
This file was produced by:
  script -q /dev/null agent-reference status > snippets/status.ansi
The escape codes survive. Shiki's ansi grammar renders them, so the green on
"ready" is the CLI's own green, not a color I picked. Re-run the command, get a
new slide.
-->

---

## 4. Walk the output one line at a time

```ansi {1|2|4-6|all}
agent-reference.json (shared)
  semver      package · ready · 7.8.4 verified
  typescript  package · declared · 5.9.3

  Schema libraries we compare against
    zod   git · declared · github:colinhacks/zod
    hono  git · declared · github:honojs/hono
```

Same block, four clicks. The dimming does the pointing, so you never have to say
"the third line down".

---

## 5. Rewrite the config in place

````md magic-move
```json
{
  "git": {
    "zod": { "repository": "github:colinhacks/zod" }
  }
}
```
```json
{
  "git": {
    "zod": { "repository": "github:colinhacks/zod", "ref": "v4.1.5" }
  }
}
```
```json
{
  "git": {
    "zod": { "repository": "github:colinhacks/zod", "ref": "v4.1.5" }
  },
  "folders": {
    "notes": { "path": "./docs/agent-notes" }
  }
}
```
````

Tokens animate between states instead of the slide cutting. Good for showing a
file growing; overused, it is a fidget toy.

---
layout: two-cols-header
---

## 6. Cause on the left, effect on the right

::left::

```json
{
  "packages": {
    "semver": "7.8.4"
  },
  "sets": [
    {
      "description": "Schema libraries",
      "git": ["github:colinhacks/zod"]
    }
  ]
}
```

::right::

<div class="pl-8">

```ansi
agent-reference.json (shared)
  semver  package · ready · 7.8.4 verified

  Schema libraries
    zod   git · declared

1 of 2 not fetched yet, which is normal
```

</div>

<!--
The shape most of the tool slides in the real talk want: what you wrote, and
what the agent sees because of it.
-->

---
layout: statement
class: outcome
---

# It's got electrolytes

<!--
The joke that got cut from the Meetup description. It survives
here, where it costs nothing and the room is already laughing.
-->

---
layout: statement
---

# Six words, one idea

<!--
The tone check: this slide is what 26 of the 54 slides in the last deck looked
like. Nothing on screen, everything in the telling.
-->
