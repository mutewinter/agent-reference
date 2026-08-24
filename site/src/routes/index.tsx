import { Link, createFileRoute } from '@tanstack/react-router'

import { Command, ForYourAgent } from '../components/copy'
import { Declared, Dim, Output, Ready } from '../components/terminal'

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
      <section className="pt-16">
        <h1 className="text-2xl text-fg">agent-reference</h1>
        <p className="mt-6 max-w-2xl text-fg">
          Your coding agent reads <span className="text-accent">node_modules</span> to work out
          how a library behaves. node_modules is build output.
        </p>
        <p className="mt-4 max-w-2xl text-muted">
          agent-reference checks out a dependency&rsquo;s actual repository at the exact version
          your lockfile installs, so an agent reads the real source, the tests, the examples and
          the history. It also does the same for any git repository and any folder on your
          machine, addressable by name. Nothing is fetched until an agent asks for it.
        </p>

        <div className="mt-8">
          <Command
            lines={[
              ['npm install -g agent-reference'],
              ['npx skills add mutewinter/agent-reference', 'teaches your agent to use it'],
            ]}
          />
        </div>
      </section>

      <Section label="Start here">
        <ForYourAgent
          text="Set this project up for agent-reference: run `npx agent-reference@latest init` and follow the brief it prints."
          note="Say it yourself rather than pasting the bare command. init prints instructions, and an agent is right to treat tool output as data rather than as orders. The authority to act on a brief has to come from you."
        />

        <p className="mt-6 text-muted">
          <span className="text-fg">init</span> surveys the project and prints a brief for your
          agent to carry out. It reads and prints; every write is the agent&rsquo;s.
        </p>

        <ul className="mt-4 space-y-2 text-muted">
          <li>
            <Dim>{'→ '}</Dim>installs the skill, so later sessions find the tool without
            being told
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
          That second one is the part worth reading twice. The repositories and folders you keep
          pasting paths to are already in your own session history, so the first config does not
          start from a blank file. Anything found that way lands in the gitignored file first.
          Promoting an entry to the committed one is your call, not a heuristic.
        </p>
      </Section>

      <Section label="What an agent does with it">
        <Output title="one verb: a coordinate in, a path out">
          <div>
            <Dim>$ </Dim>agent-reference get semver
          </div>
          <div>
            <Dim>agent-reference: updating npm/node-semver</Dim>
          </div>
          <div>semver@7.8.4 {'→'} ~/.agent-reference/src/github.com/npm/node-semver/8640bd68f165</div>
        </Output>

        <p className="mt-4 max-w-2xl text-muted">
          The version comes from your lockfile, read at the moment of the call, so a checkout
          cannot drift from what you install. Every candidate commit is verified before it is
          handed over: the package&rsquo;s own manifest at that commit has to report the same name
          and version, which is what stops a monorepo tag from pointing an agent at the wrong
          package.
        </p>
      </Section>

      <Section label="What you keep">
        <Output title="agent-reference status">
          <div>agent-reference.json (shared)</div>
          <div>
            {'  '}semver{'      '}
            <Dim>package {'·'} </Dim>
            <Ready />
            <Dim> {'·'} 7.8.4 verified</Dim>
          </div>
          <div>
            {'  '}typescript{'  '}
            <Dim>package {'·'} </Dim>
            <Declared />
            <Dim> {'·'} 5.9.3</Dim>
          </div>
          <div>{' '}</div>
          <div>
            {'  '}
            <Dim>Schema libraries we compare against</Dim>
          </div>
          <div>
            {'    '}zod{'   '}
            <Dim>git {'·'} </Dim>
            <Declared />
            <Dim> {'·'} github:colinhacks/zod</Dim>
          </div>
          <div>
            {'    '}hono{'  '}
            <Dim>git {'·'} </Dim>
            <Declared />
            <Dim> {'·'} github:honojs/hono</Dim>
          </div>
        </Output>

        <p className="mt-4 max-w-2xl text-muted">
          Config is optional and holds what is worth remembering, not an inventory. A reference
          that has never been fetched reads <Declared />, which is the normal state of a healthy
          project rather than a problem.
        </p>
      </Section>

      <Section label="What people put in it">
        <dl className="space-y-6">
          <div>
            <dt className="text-fg">Exact versions of what you already depend on</dt>
            <dd className="mt-1 max-w-2xl text-muted">
              No entry needed at all: <span className="text-fg">get zod</span> reads the lockfile.
              A package earns an entry only when there is something to remember about it, and it
              always carries an exact version, never a range.
            </dd>
          </div>
          <div>
            <dt className="text-fg">Repositories you keep going back to</dt>
            <dd className="mt-1 max-w-2xl text-muted">
              A specification, a design system, a fork you maintain, the service you are
              integrating against. Declare it once and every session after this one can reach it
              by name.
            </dd>
          </div>
          <div>
            <dt className="text-fg">Folders on your machine</dt>
            <dd className="mt-1 max-w-2xl text-muted">
              Notes, a sibling checkout, an internal repository that never leaves your laptop.
              Machine paths go in a gitignored file, and{' '}
              <span className="text-fg">validate</span> fails if an absolute path reaches the
              committed one, so your directory names cannot end up in someone else&rsquo;s clone.
            </dd>
          </div>
        </dl>
      </Section>

      <Section label="Next">
        <p className="max-w-2xl text-muted">
          <Link to="/docs" className="text-accent hover:underline">
            Read the docs
          </Link>{' '}
          for the config format, how versions resolve, and what to do when a package tags its
          releases in a way no tool can guess.
        </p>
      </Section>
    </>
  )
}
