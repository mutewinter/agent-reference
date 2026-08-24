import { createFileRoute } from '@tanstack/react-router'

import { ForYourAgent } from '../components/copy'
import { Dim, Highlighted, Panel, Shell } from '../components/panels'

export const Route = createFileRoute('/')({ component: Home })

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="mt-16">
      <div className="rule mb-5">{label}</div>
      {children}
    </section>
  )
}

function Home() {
  return (
    <>
      <section className="pt-8">
        <h1 className="max-w-2xl text-2xl leading-snug text-fg">
          Declare what your agent should read.
          <br />
          One command turns a name into a path.
        </h1>
        <p className="mt-3 max-w-2xl text-muted">
          A config file and a CLI. Repositories, folders, and dependencies at the exact version
          you install, resolved on demand and never before.
        </p>

        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <Panel title="agent-reference.json" caption="You write this once.">
            <Highlighted name="config" />
          </Panel>

          <Panel title="any session, months later" caption="Your agent asks by name.">
            <pre className="leading-relaxed">
              <div>
                <Dim>$ </Dim>agent-reference get zod
              </div>
              <div>
                zod@4.1.5 <Dim>{'→'}</Dim> ~/.agent-reference/src/
              </div>
              <div>
                <Dim>{'  '}github.com/colinhacks/zod/a1f9c02</Dim>
              </div>
              <div>{' '}</div>
              <div>
                <Dim>$ </Dim>agent-reference get notes
              </div>
              <div>
                notes <Dim>{'→'}</Dim> ./references/notes
              </div>
            </pre>
          </Panel>
        </div>

        <div className="mt-6">
          <ForYourAgent
            text="Set this project up for agent-reference: run `npx agent-reference@latest init` and follow the brief it prints."
            note="Say it yourself rather than pasting a command: init prints instructions, and the authority to act on them has to come from you."
          />
        </div>

        <div className="mt-4 text-[12px] text-faint">
          <Shell
            lines={[['npm install -g agent-reference', 'or let the agent do it. Node 20+, git 2.19+']]}
          />
        </div>
      </section>

      <Section label="The first run">
        <p className="max-w-2xl text-muted">
          <span className="text-fg">init</span> surveys the project and prints a brief for your
          agent to carry out. It reads and prints; every write is the agent&rsquo;s.
        </p>
        <ul className="mt-4 space-y-2 text-muted">
          <li>
            <Dim>{'→ '}</Dim>installs the skill, so later sessions find the tool without being
            told
          </li>
          <li>
            <Dim>{'→ '}</Dim>
            <span className="text-fg">
              mines your recent agent sessions on this machine for the references this project
              already needs
            </span>
          </li>
          <li>
            <Dim>{'→ '}</Dim>writes the config, then shows you{' '}
            <span className="text-fg">status</span> so you see what the agent will see
          </li>
        </ul>
        <p className="mt-4 max-w-2xl text-muted">
          The second one means the first config does not start from a blank file: the
          repositories and folders you keep pasting paths to are already in your own session
          history. Anything found that way lands in the gitignored file, and promoting an entry
          to the committed one is your call rather than a heuristic.
        </p>
      </Section>

      <Section label="How people use it">
        <dl className="space-y-6">
          <div>
            <dt className="text-fg">The libraries this project already depends on</dt>
            <dd className="mt-1 max-w-2xl text-muted">
              No entry needed. <span className="text-fg">get zod</span> reads your lockfile at the
              moment of the call and checks out that repository at the published commit, so what
              the agent reads cannot drift from what you install.
            </dd>
          </div>
          <div>
            <dt className="text-fg">Repositories you read but do not depend on</dt>
            <dd className="mt-1 max-w-2xl text-muted">
              A specification, a fork you maintain, the service you integrate against, the library
              you are deciding whether to adopt. Declare it once and every session after this one
              reaches it by name.
            </dd>
          </div>
          <div>
            <dt className="text-fg">Folders already on your machine</dt>
            <dd className="mt-1 max-w-2xl text-muted">
              Notes, a sibling checkout, an internal repository that never leaves your laptop.
              Those paths go in a gitignored second file, and{' '}
              <span className="text-fg">validate</span> fails if an absolute path reaches the
              committed one, so your directory names cannot end up in someone else&rsquo;s clone.
            </dd>
          </div>
        </dl>
      </Section>

      <Section label="What it does not do">
        <p className="max-w-2xl text-muted">
          Nothing is fetched until an agent asks. A reference that has never been fetched reads{' '}
          <span className="text-faint">declared</span>, which is the resting state of a healthy
          project rather than a problem. The store is a single directory shared across every
          project, keyed by commit, and safe to delete.
        </p>
      </Section>
    </>
  )
}
