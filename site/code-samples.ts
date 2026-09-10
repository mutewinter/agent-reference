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

  repos: {
    lang: 'jsonc',
    code: `{
  "references": {
    "remotion": {
      "source": "github:remotion-dev/remotion",
      "description": "Video in React, and the renderers behind it"
    },
    "codex": {
      "source": "github:openai/codex",
      "description": "OpenAI's coding agent, written in Rust"
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

/**
 * Folder layouts. `[[name]]` marks an entry the panel beside it declares, so
 * the eye can join the two; the markers are read off before the line is drawn.
 */
export const trees = {
  siblings: `~/code/acme/
├── web/
│   └── agent-reference.local.json
├── [[api/]]
├── [[workers/]]
└── [[shared/]]`,

  global: `~/
├── agent-reference.local.json
├── [[.dotfiles/]]
└── code/
    ├── [[personal/]]
    ├── [[work/]]
    └── [[forks/]]`,

  /**
   * What two `get`s of one package leave on disk, with no entry in any
   * config: the repository behind each version, side by side, because a
   * checkout is keyed by version and two versions are two checkouts. The
   * root is the readable form of the path the page uses everywhere.
   */
  checkout: `~/.agent-reference/src/
├── [[ai@6.0.43]]/
│   └── packages/ai/
│       ├── CHANGELOG.md
│       └── src/
└── [[ai@7.0.78]]/
    └── packages/ai/
        ├── CHANGELOG.md
        └── src/`,

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
   * announces itself with `.git`, a commit name does not. The host is left off
   * every path for the same reason the chain is collapsed: the panel is half
   * a page wide, and the notes have to fit beside the longest line. This is the one
   * place on the page a commit appears, since this is the section about the
   * store as it is, and each one carries the version it was resolved from,
   * underlined against the source in the config that named it.
   */
  store: `~/.agent-reference/
├── git/ # one clone per repo
│   ├── Effect-TS/effect.git
│   └── earendil-works/pi.git
├── src/ # a worktree per version
│   ├── Effect-TS/effect/[[6ba41e59c827]]/ # 4.0.0-rc.111
│   ├── Effect-TS/effect/[[c41d80f2b3e5]]/ # 3.19.4
│   └── earendil-works/pi/[[dcd461925db2]]/ # tip of main
└── state/ # one file per project
    ├── web-a3f81c0426.json
    └── api-5c02e7d1b8.json`,
};

/**
 * Agent transcripts, keyed so an example can name the one it pairs with. Not
 * highlighted: the Session component paints them the way a harness does, and
 * underlines the names that correspond to the panel beside it, since that
 * correspondence is what an example exists to show.
 *
 * `today` and `after` are the first screen, and carry no prompt: two things
 * an agent does when it needs a library and what each got back, against what
 * the tool gives it. One library throughout, because a reader recognizes
 * Effect. The markup is what the docs site hands a fetch, and every line on
 * the right is real: the README and `src/FileSystem.ts` of the effect package
 * at that tag, quoted verbatim. The bundle line on the left is the pattern
 * rather than the package: Effect's own published build keeps its comments,
 * and the row stands for the many that do not. A result line marked `! ` went
 * wrong and `+ ` went right; the markers are read off before the line is
 * painted. `[[name]]` anywhere in a transcript marks a name
 * the config or the tree beside it declares, so the eye can join the two.
 *
 * Paths are the readable form, not the literal one. The store keys a checkout
 * by commit, and a commit is not something a person reads, so the page names
 * the repository and, for a package, the version the commit was resolved
 * from. The repository paths under them are real, and the tools they name
 * are the few that show the agent using what it was handed. Re-check the
 * quoted lines before swapping a library.
 */
export const terminals = {
  today: `* Read(node_modules/effect/dist/FileSystem.js)
  ⎿ ! import*as t from"./Array.js";import*as e from…
    ! …r=t=>e.fail(new n({module:"FileSystem",method…
    ! …class extends r{readFile(t){return e.suspend(…
* WebFetch(effect.website/docs/platform/file-system)
  ⎿ ! <!doctype html><html lang="en" class="dark">…
    ! …<nav class="sidebar"><a href="/docs/getting…
    ! …<div class="prose"><h1>FileSystem</h1><p>The…
    ! …<script id="__NEXT_DATA__" type="applicat…`,

  after: `* Bash(agent-reference get effect)
  ⎿ effect@4.0.0-rc.111 -> ~/.agent-reference/src/effect@4.0.0-rc.111
* Read(…/effect@4.0.0-rc.111/packages/effect/README.md)
  ⎿ + # effect
    + Effect is a library for building robust, maintainable, type-safe, and…
    + ## Installation
* Read(…/effect@4.0.0-rc.111/packages/effect/src/FileSystem.ts)
  ⎿ + /**
    +  * Open a file at \`path\` with the specified \`options\`.
    +  *
    +  * **Details**
    +  *
    +  * The file handle will be automatically closed when the scope is closed.
    +  */
    + readonly open: (
    +   path: string,
    +   options?: {
    +     readonly flag?: OpenFlag | undefined
    +     readonly mode?: number | undefined
    +   }
    + ) => Effect.Effect<File, PlatformError, Scope>`,

  session: `> Implement an edit tool like [[pi]]'s, using [[Effect]] v4
* Bash(agent-reference get [[effect]])
  ⎿ effect -> ~/.agent-reference/src/effect@4.0.0-rc.111
* Bash(agent-reference get [[effect-docs]])
  ⎿ effect-docs -> ~/.agent-reference/src/effect-website/docs/v4
* Read(…/docs/v4/platform/file-system.mdx)
* Update(agent-reference.json)
  ⎿ + "[[pi]]": { "source": "github:earendil-works/pi", … }
* Bash(agent-reference get [[pi]])
  ⎿ pi -> ~/.agent-reference/src/pi
* Read(…/pi/packages/coding-agent/src/core/tools/edit.ts)`,

  remotion: `> can [[remotion]] render a video right in the browser? if so wire it up
* Bash(agent-reference get [[remotion]])
  ⎿ remotion -> ~/.agent-reference/src/remotion
* Read(…/remotion/packages/webcodecs/README.md)
* Update(src/Export.tsx)
> copy [[codex]]'s shell approval flow into ours
* Bash(agent-reference get [[codex]])
  ⎿ codex -> ~/.agent-reference/src/codex
* Read(…/codex/codex-rs/core/src/exec_policy.rs)
* Update(src/approval.ts)`,

  ai: `> upgrade the chat route to ai v7
* Bash(agent-reference get ai)
  ⎿ [[ai@6.0.43]] -> ~/.agent-reference/src/ai@6.0.43/packages/ai
* Bash(agent-reference get ai@7.0.78)
  ⎿ [[ai@7.0.78]] -> ~/.agent-reference/src/ai@7.0.78/packages/ai
* Read(…/ai@7.0.78/packages/ai/CHANGELOG.md)
* Update(src/routes/chat.ts)`,

  set: `> Implement context compaction based on how other [[harnesses]] do it
* Bash(agent-reference get [[harnesses]])
  ⎿ [[pi]] -> ~/.agent-reference/src/pi
    [[codex]] -> ~/.agent-reference/src/codex
    [[opencode]] -> ~/.agent-reference/src/opencode
* Read(…/coding-agent/src/core/compaction/compaction.ts)`,
};

/**
 * One example, on the site and in the README. Every key here names an entry in
 * one of the maps above, so a snippet renamed in `samples` or a tree dropped
 * from `trees` fails to typecheck rather than rendering an empty panel. A
 * `config` is a file the agent wrote, with an optional line under it and the
 * keys in it that the session or the tree beside it names, which are marked
 * the same way; a `tree` is a folder layout; a `session` is the agent using
 * what the panels beside it declare. Not every example has a config: the one
 * about package versions has no file to show, because none is needed.
 */
export interface Example {
  title: string;
  session?: keyof typeof terminals;
  tree?: keyof typeof trees;
  config?: { file: string; sample: keyof typeof samples; note?: string; marks?: string[] };
}

/**
 * The examples section, opening on the agent using the tool, then in the
 * order somebody meets these needs. Titles say what the tool does for the
 * agent; the panels say the rest, and the one line of prose in the section
 * sits under the file it is about.
 */
export const examples: Example[] = [
  {
    title: 'Your agent uses agent-reference',
    session: 'session',
    config: {
      file: 'agent-reference.json',
      sample: 'shared',
      marks: ['effect', 'effect-docs', 'pi'],
      note: 'Committed beside your `package.json`. Your agent writes it and adds to it as it goes.',
    },
  },
  {
    title: 'Clones repositories on demand',
    session: 'remotion',
    config: { file: 'agent-reference.json', sample: 'repos', marks: ['remotion', 'codex'] },
  },
  {
    title: 'Provides references to other folders on your computer',
    tree: 'siblings',
    config: {
      file: 'web/agent-reference.local.json',
      sample: 'siblings',
      marks: ['api', 'workers', 'shared'],
    },
  },
  {
    title: 'Checks out the full source for exact package versions',
    session: 'ai',
    tree: 'checkout',
  },
  {
    title: 'Provides references for every agent on your computer',
    tree: 'global',
    config: {
      file: '~/agent-reference.local.json',
      sample: 'global',
      marks: ['~/.dotfiles', '~/code/personal', '~/code/work', '~/code/forks'],
    },
  },
  {
    title: 'Groups references for easy mentioning',
    session: 'set',
    config: {
      file: 'agent-reference.json',
      sample: 'together',
      marks: ['harnesses', 'pi', 'codex', 'opencode'],
    },
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
export interface HowItWorks {
  heading: string;
  lead: string;
  configs: Array<{ file: string; sample: keyof typeof samples; marks: string[] }>;
  tree: keyof typeof trees;
  cache: string;
}

export const howItWorks: HowItWorks = {
  heading: 'How it works',
  lead: 'Skip this if you like: your agent handles all of it. Two projects, pinning two versions of the same dependency, sharing one store.',
  configs: [
    {
      file: 'web/agent-reference.json',
      sample: 'storeWeb',
      marks: ['npm:effect@4.0.0-rc.111', 'github:earendil-works/pi'],
    },
    { file: 'api/agent-reference.json', sample: 'storeApi', marks: ['npm:effect@3.19.4'] },
  ],
  tree: 'store',
  cache:
    'All of it is cache. Delete any of it and the next get rebuilds what it needs, mirror first, network last. agent-reference store --prune drops the checkouts that have gone unused.',
};

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
  note: 'A set is a reference that resolves to more than one path, so its name works everywhere a name works: `get harnesses` takes all of them, `status harnesses` reports the group. The description is required on both: a name is what the agent already has, and what it needs is when the thing behind it is worth opening.',
};

/**
 * The page's own words, shared so the README says them too rather than keeping
 * a second copy that drifts. `tagline` also names the browser tab and heads the
 * link preview; `description` is the meta description, and the only line of
 * prose a search result or a social card gets, so it says what the thing does
 * rather than what shape it ships in. `lead` is the one sentence the markdown
 * surfaces set under the tagline; the page itself shows rather than says it.
 */
export const copy = {
  title: 'agent-reference',
  tagline: 'Give your agents the source',
  lead: 'A CLI your agent uses to read the real source of your dependencies, at the version you actually have installed, plus any repo or folder you point it at.',
  description:
    'Give your agents the source. A CLI your agent uses to read the real source of your dependencies, at the version you have installed, plus any repo or folder you point it at.',
  /**
   * The first screen: what an agent does today when it needs a library, and
   * what it does with the tool. The headings name whose session each is, and
   * the sessions say the rest.
   */
  hero: {
    before: 'Your agent, without the source',
    after: 'Your agent, with the source',
    aside: 'Any questions?',
    asideUrl: 'https://www.youtube.com/watch?v=F0kCYP_iPtg',
  },
  /**
   * The section headings the page states outright rather than taking from the
   * data under them. They are here so the markdown the site serves and the
   * README both head those sections the way the page does.
   */
  getStarted: {
    heading: 'Get started',
    summaryLabel: 'TL;DR',
    lead: 'Give your agent this prompt; it’ll handle the rest.',
  },
  agent: {
    heading: 'Let your agent set it up',
    followThrough: 'Your agent keeps track of references and fetches the source when it needs it.',
  },
  install: {
    heading: 'Prefer to install it yourself?',
    note: 'Run `npm install -g agent-reference`, then `agent-reference init` in your project and follow the printed setup brief.',
  },
  examples: {
    heading: 'Examples',
  },
  commands: {
    heading: 'The commands',
    note: 'You will not need these. Your agent runs them. They are here anyway.',
  },
};

/** The setup command included in the prompt a person hands their agent. */
export const quickStart = 'npx agent-reference init';

/** The one sentence a person hands their agent. The site and the README share it. */
export const setupPrompt = `Set this project up for agent-reference: run \`${quickStart}\` and follow the brief it prints.`;
