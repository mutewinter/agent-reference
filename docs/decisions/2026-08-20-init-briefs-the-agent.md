# init briefs the agent instead of scaffolding a config

## Context

Setting a project up is the one part of this tool that no single command can do. Deciding
which references are worth declaring means reading how someone has actually been working,
choosing five or ten out of everything they have ever pointed an agent at, and writing a
description for each saying when it is worth opening. That is judgment, and it belongs to
the agent and the user, not to a scaffolder.

The parts around it are not judgment at all. Whether a config already exists, how many
references it declares, whether the gitignored file is actually ignored, which instruction
file this project's agent reads, whether two of those names are the same file behind a
symlink, whether the skill is reachable from here, where this machine keeps agent
transcripts: every one of those is a question with a determinate answer that a command can
compute faster and more reliably than an agent can guess.

Two observed sessions made the cost of the missing half concrete. Both ran in a project
that declared a sibling checkout as a folder reference, with a description naming what the
sibling held and when to read it. In neither session was the skill loaded, so in neither
session was the config opened. One agent resolved the sibling for free because the name
happened to match a parent directory. The other guessed wrong, landed on a directory with
no manifest in it, and recovered only because it had bundled a directory listing into the
same command. A config nothing points at is decoration.

## Decision

`init` surveys the project and prints a numbered brief for the agent to carry out. It reads
and prints; it writes nothing, which keeps the standing rule that no command edits config.
The survey supplies the facts, the brief supplies the judgment calls, and the split follows
the existing division of labor: the agent decides when, the tool computes what.

The brief always covers the same six moves, adapted to what the survey found: install the
skill where this project will find it, mine recent sessions for references this project
already needs, propose a small ranked set, write the JSON and validate it, run `status` and
show the user the result, and add one sentence to the instruction file. Steps that the
survey has already satisfied say so and ask for nothing.

Three rules travel inside the brief rather than in the code:

- Anything mined goes to `agent-reference.local.json` first, whatever the path looks like,
  because it came out of the user's own session history. Promotion to the committed file is
  a question for the user, not a path-shape heuristic.
- Folders inside the project are not hunted for. The agent's own tools already find them,
  and listing one invites the reading that the index rule exists to prevent. One earns a
  reference only when repeated use shows the description is doing the work, not the path.
- Five to ten, no more. A long index costs every later session tokens and gets skimmed.

Transcript mining stays the agent's job. `init` contributes only the stores it found on
disk, probed against a list of known locations, reporting nothing it could not stat. A
deterministic ranker would need a parser per agent per format, all of them moving targets,
to replace a job the agent can do in the shell.

Because the printed brief is a prompt something will act on, only values `init` computed
itself are interpolated into it: paths it stat'd, filenames from a fixed list, and counts.
Nothing read out of a config file or a transcript is ever rendered into the brief. A
description is free text that ships with a repository, so without that rule a checked-in
config could write instructions to a future agent in this tool's voice.

The brief is untrusted in the other direction as well, and that constraint is sharper. From
the agent's side, `init` is a package writing instructions to its own stdout, and acting on
tool output without the user's say-so is the thing prompt injection exists to exploit. An
eval run refused the brief outright and was right to: it read a machine-wide self-install, a
sweep of private cross-project session history, and an explicit instruction to skip
confirmation, and named the combination for what it looked like. Three rules follow.

- Authority to act on the brief comes from the user, so the documented one-liner is a
  sentence the user says rather than a bare command they paste. A command alone authorizes
  running it, not obeying what it prints.
- The brief never waives confirmation. It asks before installing anything machine-wide and
  before reading session history, both of which are the user's call and neither of which a
  tool gets to grant itself.
- It does not editorialize about how private the session history is. Warning language meant
  as care reads as an admission when it sits inside an instruction to go read that history.

## Consequences

- `init` is the whole entry point. One sentence from the user gets the skill installed, the
  config written, and the instruction file updated, so setup is one line they say rather
  than a sequence they have to understand. The line names the command and authorizes acting
  on what it prints, because the second half is not something the command can grant itself.
- The name promises scaffolding that does not happen, so the first line of output says it
  writes nothing. That is cheaper than the alternative name, which would explain the
  mechanism to everyone in exchange for matching nobody's muscle memory.
- The list of transcript locations will go stale. It degrades quietly: an unknown store is
  simply not listed, and the brief tells the agent to check its own knowledge and then the
  user when the survey comes back empty.
- The brief is text, so it is the surface that will need tuning against real runs. Its steps
  are returned as an array in `--json`, which keeps them addressable rather than buried in a
  formatted blob.
- A second command in this family would inherit both rules. They are properties of any
  command that prints instructions, not details of this one.
- When a step gets skipped, the tempting fix is to phrase it more forcefully. That is exactly
  backwards here, and it is how the refusal was provoked in the first place. A test asserts
  the brief contains no confirmation-waiving phrasing, so the temptation fails loudly.
