# Knowledge base

Versioned documentation is the system of record for this project's architecture and decisions; prefer it over chat history. Keep documents evergreen and safe to share: no secrets, no machine paths, no names of local checkouts or sibling repositories, nothing tied to one person, machine, or moment. Content that only makes sense on one system does not belong in a repository at all.

| Section | What belongs there | Shape |
| --- | --- | --- |
| [architecture/](architecture/README.md) | How the system works today | Undated topic slugs, corrected in place |
| [decisions/](decisions/README.md) | Why the design is the way it is | One file per decision, `YYYY-MM-DD-short-slug.md`, superseded rather than edited |
| [positioning.md](positioning.md) | Why it exists and what it claims, in the words that become slides and site copy | One file, revised in place |
| [plans/](plans/README.md) | Work not yet landed | One file per plan, `Status:` line first, moved to `completed/` when it lands |
| visual-explanations/ | Single-use visuals an agent writes for a human to read now | Gitignored, not history |

Each section's README carries its conventions and an index of its files. The governing distinction: architecture is corrected, decisions are superseded.
