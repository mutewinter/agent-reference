# Update notification

Status: considered, not started. Deliberately deferred until the package is published and
real version skew exists.

## Problem

The CLI is installed globally, so nothing updates it alongside a project. A machine can
run an old version indefinitely, and schema or behavior changes would surface as confusing
errors instead of "you are out of date."

## Shape, when built

- Check the registry for the latest version at most once a day, cached in the store
  (`<store>/state/`), never on the critical path of a command.
- Notify on stderr, one line, at most once per day: version available and the install
  command. Never block, never prompt.
- Respect an opt-out (env var or config key), and stay silent when stderr is not a TTY so
  agents and CI never see it.

## Why not now

Update nags are irritating in exact proportion to how often they fire, and before the
package has users on old versions the check can only misfire. Revisit at first publish.
