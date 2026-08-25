# Packages entries are exceptions, not an inventory

## Context

The config's `packages` section originally selected which dependencies the tool tracked, so using the tool on a dependency meant declaring it first. That made the config an inventory to maintain, and raised the question of whether the resolve-installed-version machinery should exist at all or the agent should drive resolution by hand.

## Decision

Both, split cleanly: the agent decides when, the tool computes what. `get <name>` resolves any lockfile dependency with no config entry, reading the lockfile at call time so the result cannot drift from what is installed. A `packages` entry exists only when there is something worth remembering about a dependency: a pin the resolver could not find, a description, or a group. The deterministic resolver stays as the engine behind `get`.

## Consequences

- Onboarding for the dependency use case is "install it and you are done"; no config edit precedes the first useful `get`.
- Enumerated `"installed"` lists are pointless and should not be written.
- An explicit `get name@version` is a one-off: it materializes but is not recorded as the project's current checkout, so bisecting old versions never corrupts `status`.
- A pin applies only to the version it was made for; an explicit historical request ignores it.
