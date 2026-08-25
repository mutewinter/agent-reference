# Update notification

Status: considered, not started. The package is published, so half the deferral is spent; still waiting on machines running a version behind.

## Problem

The CLI is installed globally, so nothing updates it alongside a project. A machine can run an old version indefinitely, and schema or behavior changes would surface as confusing errors instead of "you are out of date."

## What no longer belongs here

Two pieces of the original scope have been solved locally, without a registry check.

The skill file was the worst of it: copied into a project once, describing a config format, updated by nothing. It is now a stub holding only what stays true across versions, and everything that moves is printed by `agent-reference guide` out of the installed CLI. Those instructions cannot describe a different version than the one running.

A command an agent names that this build does not have used to fail as a reference miss, blaming the config. It now says so: the failure lists the commands this build does have and states that instructions naming a missing one are newer than the CLI. That is the skew signal an agent can actually act on, and it costs no network.

## Shape, when built

- Check the registry for the latest version at most once a day, cached in the store (`<store>/state/`), never on the critical path of a command.
- Notify on stderr, one line, at most once per day: version available and the install command. Never block, never prompt.
- Respect an opt-out (env var or config key), and stay silent when stderr is not a TTY.

## Why the non-TTY silence stays

The case for inverting it is that agents read tool output and act on it, so they are the audience that would benefit most. That is exactly the reason not to. This tool's stated position is that an agent is right to treat tool output as data rather than orders, which is why `init` prints a brief for a human to authorize rather than acting on it. A line that says "run `npm install -g agent-reference@latest`" is a tool instructing an agent to change the tool it is running, mid-task, on someone's machine. The nag is for the human at the terminal.

The signal an agent needs is not "a newer version exists on npm." It is "what you were told does not match what you are running," and that is answerable offline, from the binary itself, which is where the two fixes above put it.

## Why not now

Update nags are irritating in exact proportion to how often they fire, and before the package has users on old versions the check can only misfire. Revisit when a released version has been superseded long enough for machines to be behind it.
