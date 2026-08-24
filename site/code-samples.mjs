// Everything the examples are made of, shared by the site and by the README.
// The JSON here is highlighted at build time by the plugin in vite.config.ts;
// the terminal output further down is not, because the Term component paints
// the colors the CLI itself prints rather than the ones a generic shell
// grammar would guess at.
export const samples = {
  shared: {
    lang: 'jsonc',
    code: `{
  "packages": {
    "effect": "4.0.0-rc.111"
  },
  "git": {
    "pi": {
      "repository": "github:earendil-works/pi",
      "description": "AI agent toolkit: LLM API, loop, TUI, CLI"
    },
    "effect-docs": {
      "repository": "github:Effect-TS/website",
      "directory": "apps/web/src/content/docs/v4",
      "description": "Effect's v4 documentation"
    }
  }
}`,
  },

  siblings: {
    lang: 'jsonc',
    code: `{
  "paths": {
    "api": {
      "path": "../api",
      "description": "Acme's API"
    },
    "workers": {
      "path": "../workers",
      "description": "Acme's background workers"
    },
    "shared": {
      "path": "../shared",
      "description": "Acme's shared code"
    }
  }
}`,
  },

  upstream: {
    lang: 'jsonc',
    code: `{
  "git": {
    "codex": {
      "repository": "github:openai/codex",
      "description": "OpenAI's coding agent, written in Rust"
    }
  }
}`,
  },

  pinned: {
    lang: 'jsonc',
    code: `{
  "packages": {
    "npm:ai": {
      "version": "7.0.78",
      "description": "Read its docs/ and changelog before writing v7; v6 examples still dominate search results"
    }
  }
}`,
  },

  skills: {
    lang: 'jsonc',
    code: `{
  "paths": {
    "commit-style": {
      "path": "~/code/other-app/.claude/skills/commit",
      "description": "The commit style we use"
    }
  }
}`,
  },

  global: {
    lang: 'jsonc',
    code: `{
  "paths": {
    "dotfiles": "~/.dotfiles",
    "personal": "~/code/personal",
    "work": "~/code/work",
    "forks": {
      "path": "~/code/forks",
      "description": "Upstream repos I have patched"
    }
  }
}`,
  },

  together: {
    lang: 'jsonc',
    code: `{
  "sets": [
    {
      "name": "coding harnesses",
      "description": "How other agents solve the same problems",
      "git": [
        "github:earendil-works/pi",
        "github:openai/codex",
        "github:anomalyco/opencode"
      ]
    }
  ]
}`,
  },

  kitchenSink: {
    lang: 'jsonc',
    code: `{
  "git": {
    "pi": "github:earendil-works/pi"
  },
  "packages": {
    "npm:ai": "7.0.78",
    "electron": {
      "version": "41.0.2",
      "description": "Pinned: we ship against this build's native module ABI"
    }
  },
  // Relative, and inside this repo. A machine path belongs in
  // agent-reference.local.json, which merges over this file.
  "paths": {
    "decisions": "./docs/decisions",
    "style": "./docs/style-guide.md"
  },
  "sets": [
    {
      "name": "coding harnesses",
      "description": "How other agents solve the same problems",
      "git": [
        "github:earendil-works/pi",
        {
          "repository": "github:openai/codex",
          "ref": "v0.20.0",
          "description": "Pinned: we match this version's tool schema"
        }
      ]
    }
  ]
}`,
  },
}

export const trees = {
  siblings: `~/code/acme/
\u251c\u2500\u2500 web/
\u2502   \u2514\u2500\u2500 agent-reference.local.json
\u251c\u2500\u2500 api/
\u251c\u2500\u2500 workers/
\u2514\u2500\u2500 shared/`,

  global: `~/
\u251c\u2500\u2500 agent-reference.local.json
\u251c\u2500\u2500 .dotfiles/
\u2514\u2500\u2500 code/
    \u251c\u2500\u2500 personal/
    \u251c\u2500\u2500 work/
    \u2514\u2500\u2500 forks/`,
}

/**
 * Terminal output, keyed so an example can name the block it pairs with. Not
 * highlighted: the Term component paints the colors the CLI itself prints
 * rather than the ones a shell grammar would guess at.
 *
 * `session` is shaped after a real session against real checkouts. Both
 * coordinates, both commits, both file paths and both line counts are what
 * agent-reference hands back today. The two references are deliberately
 * different kinds: a repository you read but never install, and a dependency
 * you do. The docs reference carries a `directory`, so it resolves straight
 * into the v4 pages that match the pinned 4.0.0-rc.111 rather than into the
 * repository root: a prerelease whose documentation npm does not distribute
 * and whose published site is not the default view.
 */
export const terminals = {
  session: `$ claude "Implement an edit tool like pi's, using Effect v4"

* Skill(agent-reference)
  \u23bf Launching skill: agent-reference

* Bash(agent-reference get pi)
  \u23bf ~/.agent-reference/src/\u2026/earendil-works/pi/dcd46192
* Read(\u2026/packages/coding-agent/src/core/tools/edit.ts)
  \u23bf Read 461 lines

* Bash(agent-reference get effect-docs)
  \u23bf ~/.agent-reference/src/\u2026/website/6ee985b1/\u2026/docs/v4
* Read(\u2026/docs/v4/platform/file-system.mdx)
  \u23bf Read 115 lines`,

  pinned: `# your agent runs this, not you
agent-reference get ai
~/.agent-reference/src/\u2026/vercel/ai/5b64c390/packages/ai

# nothing declares electron; the lockfile is the whole answer
agent-reference get electron
~/.agent-reference/src/\u2026/electron/electron/22bbbc9f`,

  set: `$ codex "Implement context compaction based on how
  other coding harnesses do it"

* Bash(agent-reference status --set "coding harnesses")
  \u23bf codex  git \u00b7 ready \u00b7 ~/.agent-reference/src/\u2026/codex/a4f10b27
    pi     git \u00b7 ready \u00b7 ~/.agent-reference/src/\u2026/pi/dcd46192

* Read(\u2026/pi/packages/coding-agent/src/core/compaction.ts)`,

  complex: `# your agent runs this, not you
agent-reference status
agent-reference.json (shared)
  ai         npm \u00b7 ready \u00b7 7.0.78 verified
  electron   npm \u00b7 declared \u00b7 41.0.2
  decisions  folder \u00b7 ready \u00b7 ./docs/decisions
  style      file \u00b7 ready \u00b7 ./docs/style-guide.md

  How other agents solve the same problems
    pi     git \u00b7 ready \u00b7 ~/.agent-reference/src/\u2026/pi/dcd46192
    codex  git \u00b7 declared \u00b7 github:openai/codex

package versions read from pnpm-lock.yaml`,
}

/** The examples section, in the order somebody meets these problems. */
export const examples = [
  {
    title: 'Multiple repositories',
    note: 'Let your agent read other repositories checked out on your computer, by name.',
    tree: 'siblings',
    file: 'web/agent-reference.local.json',
    sample: 'siblings',
  },
  {
    title: 'Source code you reference',
    note: 'agent-reference keeps up-to-date clones of anything you want your agent to read, from GitHub or any git remote.',
    file: 'agent-reference.json',
    sample: 'upstream',
  },
  {
    title: 'Dependencies, at the version you install',
    note: 'Your agent reads the version this project installs, from the repository rather than from build output. No entry is needed for that. Declare one when there is something about a dependency worth remembering.',
    file: 'agent-reference.json',
    sample: 'pinned',
    terminal: 'pinned',
  },
  {
    title: 'Skills from another project',
    note: 'Let your agent use a skill that lives in another project, without copying it in and letting the two drift.',
    file: 'agent-reference.local.json',
    sample: 'skills',
  },
  {
    title: 'Global references',
    note: 'References every agent on this machine can reach, from any folder that has no config of its own.',
    tree: 'global',
    file: '~/agent-reference.local.json',
    sample: 'global',
  },
  {
    title: 'Use sets to group references',
    note: 'Group references so your agent can pull all of them in by name.',
    file: 'agent-reference.json',
    sample: 'together',
    terminal: 'set',
  },
  {
    title: 'A complex example',
    note: 'Every kind at once, and what your agent sees when it asks.',
    file: 'agent-reference.json',
    sample: 'kitchenSink',
    terminal: 'complex',
  },
]

/**
 * The page's own words, shared so the README says them too rather than keeping
 * a second copy that drifts. `tagline` also names the browser tab, and
 * `description` is both the meta description and the README's opening line.
 */
export const copy = {
  title: 'agent-reference',
  tagline: 'Give your agents the source',
  description:
    'Give your agents the source. A CLI that resolves any dependency, git repository, file, or folder to a path on disk, at the exact version you install.',
  agent: {
    heading: 'Let your agent do it',
    note: 'Instructs your agent to install the skill and set up a config for the folders, repositories, and packages you often reference.',
  },
  install: {
    heading: 'Install it yourself',
  },
  commands: {
    heading: 'The commands',
    note: 'You will not need these. Your agent runs them. They are here anyway.',
  },
}

/** The one sentence a person hands their agent. The site and the README share it. */
export const setupPrompt =
  'Set this project up for agent-reference: run `npx agent-reference@latest init` and follow the brief it prints.'

export const cd = 'cd ~/code/acme/web'
export const install = 'npm install -g agent-reference'
export const prompt = 'Help me set up agent-reference'

/** Cycled in the install example, to say that no harness is special. */
export const agents = ['claude', 'codex', 'opencode', 'pi']
