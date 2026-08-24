import { createFileRoute } from '@tanstack/react-router'

import { Command, ForYourAgent, Snippet } from '../components/copy'

export const Route = createFileRoute('/docs')({
  component: Docs,
  head: () => ({
    meta: [{ title: 'Docs — agent-reference' }],
  }),
})

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="mt-16">
      <div className="rule mb-5">{label}</div>
      {children}
    </section>
  )
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 max-w-2xl text-muted">{children}</p>
}

const CONFIG_EXAMPLE = `{
  "packages": {
    "prettier": "3.6.2"
  },
  "folders": {
    "design-notes": "./references/design-notes"
  },
  "git": {
    "typescript": "github:microsoft/TypeScript#main"
  },
  "sets": [
    {
      "description": "Documentation sources to read before writing docs",
      "folders": ["./references/style-guide"],
      "git": ["github:acme/design-system#v4"]
    }
  ]
}`

function Docs() {
  return (
    <>
      <section className="pt-16">
        <h1 className="text-2xl text-fg">Docs</h1>
        <P>
          Everything here is also printed by the CLI itself.{' '}
          <span className="text-fg">agent-reference guide</span> emits the full agent
          instructions for the version you have installed, which is what keeps a project that
          installed the skill months ago from following stale advice.
        </P>
      </section>

      <Section label="Install">
        <Command
          lines={[
            ['npm install -g agent-reference'],
            ['npx skills add mutewinter/agent-reference', 'teaches your agent to use it'],
          ]}
        />
        <P>
          Needs Node 20+ and git 2.19+ on your PATH. That is the whole setup:{' '}
          <span className="text-fg">get</span> works immediately, with no config file and no
          prefetching.
        </P>
      </Section>

      <Section label="Set a project up">
        <ForYourAgent
          text="Set this project up for agent-reference: run `npx agent-reference@latest init` and follow the brief it prints."
          note="init reads and prints. Every write is the agent's, and it ends by showing you status, which is exactly what your agent sees from then on."
        />
      </Section>

      <Section label="The verbs">
        <Command
          lines={[
            ['agent-reference get zod', 'the version your lockfile has; prints the path'],
            ['agent-reference get zod@3.22.0', 'any other version, side by side'],
            ['agent-reference versions zod', 'every version this project installs, and where'],
            ['agent-reference get vercel-labs/just-bash', 'any GitHub repo'],
            ['agent-reference get design-notes', 'a configured reference, by name'],
            ['agent-reference status', 'every reference, its scope and state'],
            ['agent-reference validate', 'check the config files'],
            ['agent-reference guide', 'the full agent instructions, from this version'],
            ['agent-reference store', 'what the store holds, and how big'],
          ]}
        />
        <P>
          <span className="text-fg">get</span> is the verb agents live in: it takes a coordinate
          and returns a path. When a bare name is ambiguous, because a workspace installs two
          versions of it, get prints the coordinates and stops rather than picking one. Add{' '}
          <span className="text-fg">--json</span> to any command for structured output.
        </P>
      </Section>

      <Section label="Configure">
        <P>
          Two files, same format. <span className="text-fg">agent-reference.json</span> is
          committed and holds anything fetchable and shareable.{' '}
          <span className="text-fg">agent-reference.local.json</span> is gitignored and holds
          machine paths and private references; entries there override same-named committed ones.
        </P>
        <div className="mt-5">
          <Snippet title="agent-reference.json" code={CONFIG_EXAMPLE} />
        </div>
        <P>
          There are no commands for editing config. Agents and humans write the JSON directly,
          and validate checks it. A set is a labeled list: a description saying what the
          collection is for, with members declared inline the way you would paste them.
        </P>
        <div className="mt-5">
          <ForYourAgent
            text="Add the repository I just mentioned to this project's agent-reference config, with a description saying when to read it, and show me `agent-reference status` afterward."
            note="Descriptions are the whole point of a config entry. A reference with no description tells a later session what to read but not when."
          />
        </div>
      </Section>

      <Section label="When resolution fails">
        <P>
          Some repositories tag releases in ways no tool can guess, and some packages carry no
          repository in their registry metadata. Failures are reported by status as{' '}
          <span className="text-fg">unresolvable</span>, together with the fix and the JSON to
          add. Three keys exist for this: <span className="text-fg">ref</span> when the right
          commit cannot be guessed, <span className="text-fg">repository</span> when registry
          metadata is missing or wrong, and <span className="text-fg">directory</span> when a
          monorepo subdirectory was not detected. One unresolvable reference never stops the
          others.
        </P>
      </Section>

      <Section label="Where things live">
        <P>
          A project carries one committed file plus the optional gitignored one. Everything else
          is in a single machine-wide store at{' '}
          <span className="text-fg">~/.agent-reference</span>, shared across projects and
          worktrees the way the pnpm store is. Mirrors are cloned without file contents until
          something asks for them, and checkouts are keyed by commit, so two projects on the same
          version share one directory. Nothing in the store is precious: delete it and the next
          get rebuilds what it needs.
        </P>
        <P>
          A checkout is a git worktree on the mirror, so{' '}
          <span className="text-fg">git log</span>, <span className="text-fg">blame</span> and{' '}
          <span className="text-fg">show</span> all work at the path get printed. There is no
          separate command for history.
        </P>
      </Section>
    </>
  )
}
