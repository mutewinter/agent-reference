# Locating a reference is its own verb

## Context

Every trigger in the skill description named a read-the-source task: how a library implements something, how its maintainers test it, why it behaves a certain way. That is the expensive verb, and `get` is built for it.

A session observed in the wild used the tool for something else entirely. The user referred to a folder by name and gave no path. The agent, which had never run the CLI, read `agent-reference.json` and `agent-reference.local.json` directly, looked for the name, found it absent, said so, and asked for the path. Three file reads, no materialization, no command. It opened none of the nine references it had just seen listed.

That is the config working as an index, which is what it is: names, paths, and descriptions, already on disk, free to read. Nothing in the skill described that use, and nothing needed to change in the CLI to support it.

## Decision

Locating is named as a trigger alongside reading: the skill fires when the user refers to a repository, app, or folder that is not in this repo and gives no path for it. A short section tells the agent to read the two config files directly for that case, and to treat a name's absence as "not declared, ask for the path" rather than a reason to search the filesystem.

No CLI verb is added. Reading the JSON is already the cheapest correct answer, it carries the descriptions along with the paths, and a `where` command would be a slower version of `cat`.

## Consequences

- The description gains one trigger clause, so the skill loads slightly more often. The clause is narrowed to references outside the current repo, which is the observed case; an in-repo path is a filesystem question, not a reference question.
- `status` stays the human surface. Agents reach for the config file, and that is fine: both read the same declarations, and only one of them needs formatting.
- Descriptions carry more weight than before. They are now read in a context where no source is being opened at all, so a description is often the only thing an agent learns about a reference.
