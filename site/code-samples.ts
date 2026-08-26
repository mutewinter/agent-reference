// Everything the examples are made of, shared by the site and by the README.
// The JSON here is highlighted at build time by the plugin in vite.config.ts;
// the terminal output further down is not, because the Term component paints
// the colors the CLI itself prints rather than the ones a generic shell
// grammar would guess at.
export const samples = {
  shared: {
    lang: 'jsonc',
    code: `{
  "references": {
    "effect": {
      "source": "npm:effect@4.0.0-rc.111",
      "description": "v4's own examples; the ones online are v3"
    },
    "effect-docs": {
      "source": "github:Effect-TS/website",
      "directory": "apps/web/src/content/docs/v4",
      "description": "The v4 docs the site does not publish"
    },
    "pi": {
      "source": "github:earendil-works/pi",
      "description": "A small terminal coding agent, in TypeScript"
    }
  }
}`,
  },

  /** What `Write` puts on disk, before the transcript mining turns anything up. */
  heroDraft: {
    lang: 'jsonc',
    code: `{
  "references": {
    "effect": {
      "source": "npm:effect@4.0.0-rc.111",
      "description": "v4's own examples; the ones online are v3"
    }
  }
}`,
  },

  siblings: {
    lang: 'jsonc',
    code: `{
  "references": {
    "api": {
      "source": "../api",
      "description": "Acme's API"
    },
    "workers": {
      "source": "../workers",
      "description": "Acme's background workers"
    },
    "shared": {
      "source": "../shared",
      "description": "Acme's shared code"
    }
  }
}`,
  },

  upstream: {
    lang: 'jsonc',
    code: `{
  "references": {
    "codex": {
      "source": "github:openai/codex",
      "description": "OpenAI's coding agent, written in Rust"
    }
  }
}`,
  },

  pinned: {
    lang: 'jsonc',
    code: `{
  "references": {
    "ai": {
      "source": "npm:ai@7.0.78",
      "description": "Vercel's AI SDK, and the v6-to-v7 migration in its changelog"
    }
  }
}`,
  },

  skills: {
    lang: 'jsonc',
    code: `{
  "references": {
    "commit-style": {
      "source": "~/code/other-app/.claude/skills/commit",
      "description": "The commit style we use"
    }
  }
}`,
  },

  global: {
    lang: 'jsonc',
    code: `{
  "references": {
    "dotfiles": {
      "source": "~/.dotfiles",
      "description": "My shell, editor and git config"
    },
    "personal": {
      "source": "~/code/personal",
      "description": "Everything I write for myself"
    },
    "work": {
      "source": "~/code/work",
      "description": "Everything I write for the company"
    },
    "forks": {
      "source": "~/code/forks",
      "description": "Upstream repos I have patched"
    }
  }
}`,
  },

  together: {
    lang: 'jsonc',
    code: `{
  "references": {
    "harnesses": {
      "description": "How other agents solve the same problems",
      "references": {
        "pi": {
          "source": "github:earendil-works/pi",
          "description": "The smallest of the three, in TypeScript"
        },
        "codex": {
          "source": "github:openai/codex",
          "description": "Rust, with the sandbox and the approval flow"
        },
        "opencode": {
          "source": "github:anomalyco/opencode",
          "description": "Its tests sit beside each tool"
        }
      }
    }
  }
}`,
  },

  // Ordered the way `status` reports it, so the config and the output beside it
  // read down the page together: uncollected references first, then the sets.
  kitchenSink: {
    lang: 'jsonc',
    code: `{
  "references": {
    "ai": {
      "source": "npm:ai@7.0.78",
      "description": "Vercel's AI SDK, and its changelog"
    },
    "electron": {
      "source": "npm:electron@41.0.2",
      "description": "Pinned: we ship against this build's native module ABI"
    },
    // Relative, and inside this repo. A machine path belongs in
    // agent-reference.local.json, which merges over this file.
    "decisions": {
      "source": "./docs/decisions",
      "description": "Why this project is shaped the way it is, one file per decision"
    },
    "style": {
      "source": "./docs/style-guide.md",
      "description": "How prose in this repo is written"
    },

    // A set is a reference that resolves to several paths. Its key is its
    // name, so \`get harnesses\` takes all of them at once.
    "harnesses": {
      "description": "How other agents solve the same problems",
      "references": {
        "pi": {
          "source": "github:earendil-works/pi",
          "description": "The smallest of the three, in TypeScript"
        },
        "codex": {
          "source": "github:openai/codex",
          "ref": "v0.20.0",
          "description": "Pinned: we match this version's tool schema"
        }
      }
    }
  }
}`,
  },

  // Two projects in the same checkout tree, pinning two versions of one
  // dependency. A version belongs in the value and never in the key, so one
  // config cannot name two of them; two projects on a machine can, which is
  // the whole reason the store is machine-wide rather than per project.
  storeWeb: {
    lang: 'jsonc',
    code: `{
  "references": {
    "effect": {
      "source": "npm:effect@4.0.0-rc.111",
      "description": "v4's own examples; the ones online are v3"
    },
    "pi": {
      "source": "github:earendil-works/pi",
      "description": "A small terminal coding agent, in TypeScript"
    }
  }
}`,
  },

  storeApi: {
    lang: 'jsonc',
    code: `{
  "references": {
    "effect": {
      "source": "npm:effect@3.19.4",
      "description": "v3, which this service is built on"
    }
  }
}`,
  },
};

export const trees = {
  siblings: `~/code/acme/
\u251C\u2500\u2500 web/
\u2502   \u2514\u2500\u2500 agent-reference.local.json
\u251C\u2500\u2500 api/
\u251C\u2500\u2500 workers/
\u2514\u2500\u2500 shared/`,

  global: `~/
\u251C\u2500\u2500 agent-reference.local.json
\u251C\u2500\u2500 .dotfiles/
\u2514\u2500\u2500 code/
    \u251C\u2500\u2500 personal/
    \u251C\u2500\u2500 work/
    \u2514\u2500\u2500 forks/`,

  /**
   * The store those two configs produce, and the only place the how-it-works
   * section explains itself: the notes ride on the lines they describe, because
   * this is a diagram people look at rather than a paragraph they read. One
   * mirror and two worktrees for effect is the whole point of the pairing, so
   * the two notes that earn a line are the ones that say why. Host, owner and
   * repository nest as deeply as the remote's own path does; the lines here
   * collapse that chain onto one row, since what matters is the mirror against
   * the commits checked out of it, not the depth. A trailing slash marks the
   * directories that would otherwise read as files: a bare mirror already
   * announces itself with `.git`, a commit name does not.
   */
  store: `~/.agent-reference/
\u251C\u2500\u2500 git/ # one clone per repository
\u2502   \u251C\u2500\u2500 github.com/Effect-TS/effect.git
\u2502   \u2514\u2500\u2500 github.com/earendil-works/pi.git
\u251C\u2500\u2500 src/ # one checked-out worktree per version
\u2502   \u251C\u2500\u2500 github.com/Effect-TS/effect/6ba41e59c827/
\u2502   \u251C\u2500\u2500 github.com/Effect-TS/effect/c41d80f2b3e5/
\u2502   \u2514\u2500\u2500 github.com/earendil-works/pi/dcd461925db2/
\u2514\u2500\u2500 state/ # one file per project
    \u251C\u2500\u2500 web-a3f81c0426.json
    \u2514\u2500\u2500 api-5c02e7d1b8.json`,
};

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
  /**
   * The hero, and the only block on the page that plays. A first run: the agent
   * reads the brief, mines the machine's own session history for what this
   * project keeps reaching for, and writes the config filling in beside it.
   */
  setup: `> Set this project up for agent-reference: run \`npx agent-reference init\` and follow the brief it prints.
* Bash(npx agent-reference init)
  \u23BF 2,723 sessions across claude-code, codex and opencode
* Read(pnpm-lock.yaml)
  \u23BF effect 4.0.0-rc.111
* Write(agent-reference.json)
  \u23BF 1 reference
* Bash(rg -o 'github:\\S+' ~/.claude | sort | uniq -c)
  \u23BF 41 Effect-TS/website
    12 earendil-works/pi
* Update(agent-reference.json)
  \u23BF 3 references`,

  session: `> Implement an edit tool like pi's, using Effect v4
* Skill(agent-reference)
  \u23BF Launching skill: agent-reference
* Bash(agent-reference get pi)
  \u23BF pi -> ~/.agent-reference/src/\u2026/earendil-works/pi/dcd461925db2
* Read(\u2026/packages/coding-agent/src/core/tools/edit.ts)
  \u23BF Read 461 lines
* Bash(agent-reference get effect-docs)
  \u23BF effect-docs -> ~/.agent-reference/src/\u2026/website/6ee985b191a6/\u2026/docs/v4
* Read(\u2026/docs/v4/platform/file-system.mdx)
  \u23BF Read 115 lines`,

  pinned: `# your agent runs this, not you
agent-reference get ai
npm:ai@7.0.78 -> ~/.agent-reference/src/\u2026/vercel/ai/5b64c3901f7e/packages/ai

# nothing declares electron; the lockfile is the whole answer
agent-reference get electron
npm:electron@41.0.2 -> ~/.agent-reference/src/\u2026/electron/electron/22bbbc9fa06d`,

  set: `$ codex "Implement context compaction based on how
  other coding harnesses do it"

* Bash(agent-reference get harnesses)
  \u23BF pi -> ~/.agent-reference/src/\u2026/earendil-works/pi/dcd461925db2
    codex -> ~/.agent-reference/src/\u2026/openai/codex/a4f10b27e83c
    opencode -> ~/.agent-reference/src/\u2026/anomalyco/opencode/7b0e5c31d4a9

* Read(\u2026/pi/packages/coding-agent/src/core/compaction/compaction.ts)`,

  complex: `# your agent runs this, not you
agent-reference status
agent-reference.json (shared)
  ai         npm \u00B7 ready \u00B7 7.0.78 verified \u00B7 ~/.agent-reference/src/\u2026/vercel/ai/5b64c3901f7e/packages/ai
             "Read its docs/ and changelog before writing v7"
  electron   npm \u00B7 declared \u00B7 41.0.2
             "Pinned: we ship against this build's native module ABI"
  decisions  folder \u00B7 ready \u00B7 ~/code/acme/web/docs/decisions
             "Why this project is shaped the way it is; read before calling a design a bug"
  style      file \u00B7 ready \u00B7 ~/code/acme/web/docs/style-guide.md
             "How prose in this repo is written"

  harnesses  set \u00B7 2 references
             "How other agents solve the same problems"
    pi     git \u00B7 ready \u00B7 ~/.agent-reference/src/\u2026/pi/dcd461925db2
           "The smallest one: read it first"
    codex  git \u00B7 declared \u00B7 github:openai/codex#v0.20.0
           "Pinned: we match this version's tool schema"

package versions read from pnpm-lock.yaml

2 of 6 not fetched yet, which is normal \u00B7 agent-reference get <name>`,
};

/** The examples section, in the order somebody meets these problems. */
/**
 * One example, on the site and in the README. Every key here names an entry in
 * one of the maps above, so a snippet renamed in `samples` or a tree dropped
 * from `trees` fails to typecheck rather than rendering an empty panel.
 */
export interface Example {
  title: string;
  note: string;
  file: string;
  sample: keyof typeof samples;
  tree?: keyof typeof trees;
  terminal?: keyof typeof terminals;
}

export const examples: Example[] = [
  {
    title: 'Reference other folders on your computer',
    note: 'By name, and read where they already are, so there is nothing to keep in sync.',
    tree: 'siblings',
    file: 'web/agent-reference.local.json',
    sample: 'siblings',
  },
  {
    title: 'Reference public or private repos, automatically cloned',
    note: 'From GitHub or any git remote, kept up to date, and fetched the first time your agent asks for it.',
    file: 'agent-reference.json',
    sample: 'upstream',
  },
  {
    title: 'Check out source for exact npm versions',
    note: 'Your agent reads the version this project installs, from the repository rather than from build output. No entry is needed for that. Declare one when there is something about a dependency worth remembering.',
    file: 'agent-reference.json',
    sample: 'pinned',
    terminal: 'pinned',
  },
  {
    title: 'Reference a skill from another project',
    note: 'Let your agent use a skill that lives in another project, without copying it in and letting the two drift.',
    file: 'agent-reference.local.json',
    sample: 'skills',
  },
  {
    title: 'Define references for every agent on your computer',
    note: 'References every agent on this machine can reach, from any folder that has no config of its own.',
    tree: 'global',
    file: '~/agent-reference.local.json',
    sample: 'global',
  },
  {
    title: 'Group references under one name',
    note: 'A set is a reference that resolves to more than one path. Its key is its name, like any other, so one get takes all of them.',
    file: 'agent-reference.json',
    sample: 'together',
    terminal: 'set',
  },
  {
    title: 'A complex example',
    note: 'Every kind of source in one map, a set among them, and what your agent sees when it asks.',
    file: 'agent-reference.json',
    sample: 'kitchenSink',
    terminal: 'complex',
  },
];

/**
 * Two configs and the disk they leave behind. The tree carries its own notes, so
 * everything this section has to say is in the picture: the prose around it is
 * one line in and one line out, and a reader who skips both has still seen it.
 * Two projects rather than one, because a single mirror against two worktrees is
 * the thing worth showing, and only two projects can pin two versions at once.
 * Neither config carries a path reference: a path is read where it already is,
 * so it would put a line on the left with nothing to answer it on the right.
 */
/** The walkthrough section, keyed to the same maps the examples use. */
export interface HowItWorks {
  heading: string;
  lead: string;
  configs: Array<{ file: string; sample: keyof typeof samples }>;
  tree: keyof typeof trees;
  cache: string;
}

export const howItWorks: HowItWorks = {
  heading: 'Where the source lands',
  lead: 'Skip this if you like: your agent handles all of it. It is here for anyone who wants to see where the source it reads lands. Two projects, pinning two versions of the same dependency, sharing one store.',
  configs: [
    { file: 'web/agent-reference.json', sample: 'storeWeb' },
    { file: 'api/agent-reference.json', sample: 'storeApi' },
  ],
  tree: 'store',
  cache:
    'All of it is cache. Delete any of it and the next get rebuilds what it needs, mirror first, network last. agent-reference store --prune drops the checkouts that have gone unused.',
};

/**
 * The two states the file is in, in order: what `Write` leaves and what `Update`
 * leaves. The agent writes what it knows, keeps looking, and edits; the panel
 * shows the same file twice rather than a document assembling itself line by
 * line, which is not a thing that happens. When each lands is in styles.css,
 * next to the session's own steps, because the two are tuned against each other.
 */
export const heroDrafts = ['heroDraft', 'shared'] as const;

/**
 * The pieces of JSON the format section points at. Separate from `samples`
 * because none of them is a config: they are the shapes a value or a source may
 * take, and running them through the parser the way a sample is run would ask
 * a fragment to be a whole file.
 */
export const fragments = {
  valueReference: { lang: 'jsonc', code: '{ "source": "…", "description": "…" }' },
  valueSet: { lang: 'jsonc', code: '{ "description": "…", "references": { … } }' },
  sourcePath: { lang: 'jsonc', code: '"./docs/decisions"' },
  sourceRepo: { lang: 'jsonc', code: '"github:openai/codex"' },
  sourceRef: { lang: 'jsonc', code: '"openai/codex#v0.20.0"' },
  sourcePackage: { lang: 'jsonc', code: '"npm:zod@3.22.0"' },
} as const;

/**
 * The whole format, which is short enough to put on the page now that a value is
 * one shape. The first table is what a value may be, the second what a source
 * may be.
 */
export interface FormatRow {
  fragment: keyof typeof fragments;
  means: string;
}

export const format: {
  heading: string;
  lead: string;
  values: FormatRow[];
  sources: FormatRow[];
  note: string;
} = {
  heading: 'The format',
  lead: 'One `references` map, from the name your agent asks for to where that source comes from. Every value is an object holding either `source` or `references`: the first is a reference, the second is a set. That is the only rule.',
  values: [
    { fragment: 'valueReference', means: 'a reference: one name, one source' },
    { fragment: 'valueSet', means: 'a set: one name, several references' },
  ],
  sources: [
    { fragment: 'sourcePath', means: 'a folder or a file, read where it lives' },
    { fragment: 'sourceRepo', means: 'a repository, at its default branch' },
    { fragment: 'sourceRef', means: 'the same, at a tag, branch, or commit' },
    { fragment: 'sourcePackage', means: 'a package, at an exact version' },
  ],
  note: 'A set is a reference that resolves to more than one path, so its name works everywhere a name works: `get harnesses` takes all of them, `status harnesses` reports the group. Its members are keyed by name exactly as the outer map is, so every name your agent can ask for is written down. The description is required on both: a name is what the agent already has, and what it needs is when the thing behind it is worth opening.',
};

/**
 * The page's own words, shared so the README says them too rather than keeping
 * a second copy that drifts. `tagline` also names the browser tab and heads the
 * link preview; `description` is the meta description, and the only line of
 * prose a search result or a social card gets, so it says what the thing does
 * rather than what shape it ships in.
 */
export const copy = {
  title: 'agent-reference',
  tagline: 'Give your agents the source',
  description:
    'Give your agents the source. Readable upstream code on disk, at the exact version your project installs.',
  /**
   * The two section headings the page states outright rather than taking from
   * the data under them. They are here so the markdown the site serves and the
   * README both head those sections the way the page does.
   */
  getStarted: {
    heading: 'Get started',
  },
  examples: {
    heading: 'Examples',
  },
  agent: {
    heading: 'Let your agent set it up',
    note: 'Instructs your agent to install the skill and set up a config for the folders, repositories, and packages you often reference.',
  },
  install: {
    heading: 'Install it yourself',
  },
  /**
   * The one section that shows the thing working: a first run, and then any run
   * after it. The note under the figure is there because the file on the right
   * is the only artifact on the page nobody is expected to write.
   */
  demo: {
    heading: 'How it works',
    configNote:
      'Your agent maintains this file, adding references as it needs them and cloning anything new on first use.',
  },
  thenUse: {
    heading: 'Now use your agent normally',
    note: 'From here your agent reads the real source of the libraries you depend on, and checks out the repositories it needs, at the version this project installs.',
  },
  commands: {
    heading: 'The commands',
    note: 'You will not need these. Your agent runs them. They are here anyway.',
  },
};

/**
 * The one command that sets a project up. Short enough to retype off a link
 * preview, which is the only place it appears without something to copy it.
 */
export const quickStart = 'npx agent-reference init';

/** The one sentence a person hands their agent. The site and the README share it. */
export const setupPrompt = `Set this project up for agent-reference: run \`${quickStart}\` and follow the brief it prints.`;

export const cd = 'cd ~/code/acme/web';
export const install = 'npm install -g agent-reference';
export const prompt = 'Help me set up agent-reference';

/** Cycled in the install example, to say that no harness is special. */
export const agents = ['claude', 'codex', 'opencode', 'pi'];
