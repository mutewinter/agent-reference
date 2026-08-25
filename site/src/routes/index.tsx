import { createFileRoute } from '@tanstack/react-router';

import cliReference from 'virtual:cli-reference';

import {
  agents,
  cd,
  copy,
  type Example as ExampleData,
  examples,
  format,
  type FormatRow,
  heroDrafts,
  howItWorks,
  install,
  prompt,
  setupPrompt,
  terminals,
  trees,
} from '../../code-samples.ts';
import {
  Drafts,
  Highlighted,
  Panel,
  Prose,
  Session,
  Term,
  Tree,
  source,
} from '../components/panels';
import { ForYou, ForYourAgent, Or } from '../components/start';

export const Route = createFileRoute('/')({ component: Home });

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="mt-16">
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

/**
 * What the prompt above it does, watched once. The session runs on the left; the
 * file appears on the right at the moment it is written and is replaced by the
 * one the agent leaves after it finds more. Nothing is on the right before the
 * `Write`, because before the `Write` there is no file.
 */
function Hero() {
  return (
    <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
      <Panel tone="term" label="agent">
        <Session text={terminals.setup} reveal />
      </Panel>
      <div className="rv rv-s3">
        <Panel label="agent-reference.json" copy={source('shared')}>
          <Drafts names={heroDrafts} />
        </Panel>
      </div>
    </div>
  );
}

/** What the config is for, one screen after the config gets written. */
function Format() {
  return (
    <>
      <Prose text={format.lead} className="max-w-3xl text-muted" />
      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <Panel label="a value may be">
          <Rows rows={format.values} />
        </Panel>
        <Panel label="a source may be">
          <Rows rows={format.sources} />
        </Panel>
      </div>
      <Prose text={format.note} className="mt-6 max-w-3xl text-muted" />
    </>
  );
}

/** Two columns of code against prose, highlighted the way every other block is. */
function Rows({ rows }: { rows: FormatRow[] }) {
  return (
    <dl className="grid items-baseline gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr]">
      {rows.map((row) => (
        <div key={row.fragment} className="contents">
          <dt>
            <Highlighted name={row.fragment} />
          </dt>
          <dd className="text-muted">{row.means}</dd>
        </div>
      ))}
    </dl>
  );
}

function Home() {
  return (
    <>
      <section className="pt-8">
        <h1 className="text-2xl text-fg">{copy.title}</h1>
        <p className="mt-2 mb-6 text-lg text-muted">{copy.tagline}</p>
        <div className="grid gap-4 md:grid-cols-[1fr_auto_1fr] md:gap-6">
          <ForYourAgent text={setupPrompt} />
          <Or />
          <ForYou cd={cd} install={install} prompt={prompt} agents={agents} />
        </div>
      </section>

      <Section label={copy.demo.heading}>
        <Hero />
        <Prose text={copy.demo.configNote} className="mt-4 max-w-3xl text-muted" />

        <h3 className="mt-12 text-fg">{copy.thenUse.heading}</h3>
        <Prose text={copy.thenUse.note} className="mt-1 mb-4 max-w-3xl text-muted" />
        <div className="max-w-3xl">
          <Panel tone="term" label="agent">
            <Session text={terminals.session} />
          </Panel>
        </div>
      </Section>

      <Section label={copy.examples.heading}>
        {examples.map((example) => (
          <Example key={example.sample} {...example} />
        ))}
      </Section>

      <Section label={howItWorks.heading}>
        <HowItWorks />
      </Section>

      <Section label={format.heading}>
        <Format />
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
