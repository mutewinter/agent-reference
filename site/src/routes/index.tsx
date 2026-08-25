import { createFileRoute } from '@tanstack/react-router';

import cliReference from 'virtual:cli-reference';

import {
  agents,
  cd,
  copy,
  type Example as ExampleData,
  examples,
  howItWorks,
  install,
  prompt,
  setupPrompt,
  terminals,
  trees,
} from '../../code-samples.ts';
import { Highlighted, Panel, Session, Term, Tree, source } from '../components/panels';
import { ForYou, ForYourAgent, Or } from '../components/start';

export const Route = createFileRoute('/')({ component: Home });

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="mt-20">
      {/* A real heading, not a styled label: it is the only thing between the
          page's h1 and the h3 on every example, and a document with no outline
          reads to a crawler as one undivided page. */}
      <h2 className="rule mb-6">{label}</h2>
      {children}
    </section>
  );
}

// The props are the data. A key renamed in `samples`, `trees`, or `terminals`
// fails here rather than rendering an empty panel.
function Example({ title, note, tree, terminal, file, sample }: ExampleData) {
  const paired = Boolean(tree ?? terminal);
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
  );
}

/**
 * The configs on the left and the disk they produced on the right. The tree is
 * where the explaining happens, so the two sentences framing it are both
 * skippable on purpose, and the first one says so.
 */
function HowItWorks() {
  return (
    <>
      <p className="max-w-3xl text-muted">{howItWorks.lead}</p>
      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <div className="flex flex-col gap-5">
          {howItWorks.configs.map((config) => (
            <Panel key={config.sample} label={config.file} copy={source(config.sample)}>
              <Highlighted name={config.sample} />
            </Panel>
          ))}
        </div>
        <Panel>
          <Tree text={trees[howItWorks.tree]} />
        </Panel>
      </div>
      <p className="mt-6 max-w-3xl text-muted">{howItWorks.cache}</p>
    </>
  );
}

function Home() {
  return (
    <>
      <section className="pt-12">
        <h1 className="text-2xl text-fg">{copy.title}</h1>
        <p className="mt-2 text-lg text-muted">{copy.tagline}</p>

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

      <Section label={howItWorks.heading}>
        <HowItWorks />
      </Section>

      <Section label={copy.commands.heading}>
        <p className="mb-6 max-w-2xl text-muted">{copy.commands.note}</p>
        <div className="max-w-3xl space-y-4">
          {cliReference.map((entry) => (
            <Panel key={entry.command} tone="term">
              <Term text={entry.transcript} />
            </Panel>
          ))}
        </div>
      </Section>
    </>
  );
}
