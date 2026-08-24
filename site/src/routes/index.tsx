import { createFileRoute } from '@tanstack/react-router'

import cliReference from 'virtual:cli-reference'

import {
  agents,
  cd,
  examples,
  install,
  prompt,
  setupPrompt,
  terminals,
  trees,
} from '../../code-samples.mjs'
import { Highlighted, Panel, Session, Term, Tree, source } from '../components/panels'
import { ForYou, ForYourAgent, Or } from '../components/start'

export const Route = createFileRoute('/')({ component: Home })

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="mt-20">
      <div className="rule mb-6">{label}</div>
      {children}
    </section>
  )
}

function Example({
  title,
  note,
  tree,
  terminal,
  file,
  sample,
}: {
  title: string
  note?: string
  tree?: string
  terminal?: string
  file: string
  sample: string
}) {
  const paired = Boolean(tree || terminal)
  return (
    <div className="mt-12 first:mt-0">
      <h3 className="text-fg">{title}</h3>
      {note ? <p className="mt-1 max-w-2xl text-muted">{note}</p> : null}
      <div className={`mt-4 grid gap-5 ${paired ? 'lg:grid-cols-2' : 'max-w-3xl'}`}>
        {tree ? (
          <Panel>
            <Tree text={trees[tree]} />
          </Panel>
        ) : null}
        <Panel label={file} copy={source(sample)}>
          <Highlighted name={sample} />
        </Panel>
        {terminal ? (
          <Panel tone="term">
            <Term text={terminals[terminal]} />
          </Panel>
        ) : null}
      </div>
    </div>
  )
}

function Home() {
  return (
    <>
      <section className="pt-12">
        <h1 className="text-2xl text-fg">agent-reference</h1>
        <p className="mt-2 text-lg text-muted">Give your agents the source</p>

        <div className="mt-10 grid gap-5 lg:grid-cols-2">
          <Panel label="agent-reference.json" copy={source('shared')}>
            <Highlighted name="shared" />
          </Panel>
          <Panel tone="term">
            <Session text={terminals.session} />
          </Panel>
        </div>
      </section>

      <Section label="Get started">
        <div className="grid gap-6 md:grid-cols-[1fr_auto_1fr] md:gap-8">
          <ForYourAgent text={setupPrompt} />
          <Or />
          <ForYou cd={cd} install={install} prompt={prompt} agents={agents} />
        </div>
      </Section>

      <Section label="Examples">
        {examples.map((example) => (
          <Example key={example.sample} {...example} />
        ))}
      </Section>

      <Section label="The commands">
        <p className="mb-6 max-w-2xl text-muted">
          You will not need these. Your agent runs them. They are here anyway.
        </p>
        <div className="max-w-3xl space-y-4">
          {cliReference.map((entry) => (
            <Panel key={entry.command} tone="term">
              <Term text={entry.transcript} />
            </Panel>
          ))}
        </div>
      </Section>
    </>
  )
}
