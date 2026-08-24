# The stylesheet is the design system, and the linter enforces it

## Context

Nothing in this repository was linted. The CLI had grown to thirty-four source modules and
eighteen test files without a linter ever running over them, and the site arrived later
still, bringing the first React and the first Tailwind in the project with it.

The site declares its palette in a Tailwind `@theme` block derived from the syntax theme
Shiki highlights with, so that code and chrome are one palette rather than two that nearly
agree. It declared no type scale. Every size on the page was therefore written into a
class as an arbitrary value: `text-[13px]` in six places, `leading-[1.75]` in five, and a
button shadow carrying an amber that had drifted from the accent it was supposed to be.
Each of those is a value that lives in exactly one class and agrees with nothing.

## Decision

Two oxlint configs, one per project, matching the split that already exists between the
CLI and the site.

The root config turns on `correctness` and `perf` wholesale and then names every other
rule individually. `pedantic` and `style` together report several thousand things in this
codebase, and nearly all of it is house style someone would have to agree to rather than a
defect, so a category flip is the wrong shape for that decision. Rules that fight
something deliberate here are off with the reason written beside them.

The site config adds React and `oxlint-tailwindcss`, pointed at `src/styles.css`. That
makes the stylesheet the design system in a checkable sense: every class on the page is
resolved against the tokens the file declares, `no-arbitrary-value` rejects a size or a
color written into a class instead of declared in `@theme`, and a misspelled class is an
unknown class rather than a rule that silently produces nothing.

The values the linter found were moved into `@theme` rather than allowlisted. The page now
carries a type scale of its own — an editor's scale, 14px of body text over 13px of chrome
and code, which is why the three small Tailwind steps are redefined rather than a fourth
added beside them — and two named shadows for the one thing on the page you click.

## Consequences

- A new size or color on the site is a token with a name, or it does not pass. `grid-cols-`
  is the one allowed arbitrary prefix, because `1fr auto 1fr` is a layout rather than a
  token.
- The refactor was checked by computed style rather than by eye: every element on the page
  measures the same after it as before, the deliberate exception being the selection
  color, which now uses the accent token instead of a hardcoded amber that had drifted
  from it.
- The site's `.mjs` sample modules are in its `tsconfig` with `allowJs`, so TypeScript
  infers their shape instead of handing the page an `any`. That is what made the site
  typecheckable at all; it had never been typechecked, and doing it for the first time
  surfaced errors in three files.
- Type-aware rules are on in both projects, so linting needs a real install rather than a
  checkout. CI pays for that install twice, once per project.
