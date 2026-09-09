import { createFileRoute } from '@tanstack/react-router';

import cliReference from 'virtual:cli-reference';

import {
  copy,
  type Example as ExampleData,
  examples,
  format,
  type FormatRow,
  howItWorks,
  setupPrompt,
  terminals,
  trees,
} from '../../code-samples.ts';
import { Highlighted, Panel, Prose, Session, Term, Tree, source } from '../components/panels';
import { ForYourAgent } from '../components/start';

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

/**
 * The page's first beat, and the only argument it makes, side by side: on the
 * left two things an agent does when it needs a library, each with what it
 * got back in red; on the right what the tool gives it, the checkout and real
 * lines of the docs and the source read out of it. No prompts, no panels, no
 * annotations: the rows sit on the page the way a note would, so they are
 * read as an argument rather than watched as a session. Two rows against
 * three, so the columns do not read as one fix per failure, and the right
 * column is the wider one, since a path and a line of source are longer than
 * a slice of junk and a reader should not have to unwrap either.
 */
function BeforeAfter() {
  return (
    <div className="mt-10 grid gap-8 text-sm lg:grid-cols-[5fr_7fr]">
      <div>
        <h2 className="mb-3 text-lg font-medium text-fg">{copy.hero.before}</h2>
        <Session text={terminals.today} />
      </div>
      <div>
        <h2 className="mb-3 text-lg font-medium text-fg">{copy.hero.after}</h2>
        <Session text={terminals.after} />
      </div>
    </div>
  );
}

/**
 * The props are the data. A key renamed in `samples`, `trees`, or `terminals`
 * fails here rather than rendering an empty panel. The agent goes first, since
 * it is the one doing the thing the title names; a tree beside a config takes
 * only the width it needs; and every panel in a row is the height of the
 * tallest, so a pair reads as a pair.
 */
function Example({ title, session, tree, config }: ExampleData) {
  const panels = [session, tree, config].filter(Boolean).length;
  const columns = tree && !session ? 'lg:grid-cols-[auto_1fr]' : 'lg:grid-cols-2';
  return (
    <div className="mt-16 first:mt-0">
      <h3 className="mb-4 text-lg font-medium text-fg">{title}</h3>
      <div className={`grid gap-5 ${panels > 1 ? columns : 'max-w-3xl'}`}>
        {session ? (
          <Panel tone="term">
            <Session text={terminals[session]} />
          </Panel>
        ) : null}
        {tree ? (
          <Panel>
            <Tree text={trees[tree]} />
          </Panel>
        ) : null}
        {config ? (
          <div className="flex flex-col">
            <Panel label={config.file} copy={source(config.sample)}>
              <Highlighted name={config.sample} marks={config.marks} />
            </Panel>
            {config.note ? <Prose text={config.note} className="mt-2 text-muted" /> : null}
          </div>
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
function Store() {
  return (
    <>
      <p className="max-w-3xl text-muted">{howItWorks.lead}</p>
      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <div className="flex flex-col gap-5">
          {howItWorks.configs.map((config) => (
            <Panel key={config.sample} label={config.file} copy={source(config.sample)}>
              <Highlighted name={config.sample} marks={config.marks} />
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

/** What the config is for, for a reader who has seen six of them by now. */
function Format() {
  return (
    <>
      <h3 className="mt-14 text-lg font-medium text-fg">{format.heading}</h3>
      <Prose text={format.lead} className="mt-1 max-w-3xl text-muted" />
      <div className="mt-4 grid gap-5 lg:grid-cols-2">
        <Panel label="a value may be">
          <Rows rows={format.values} />
        </Panel>
        <Panel label="a source may be">
          <Rows rows={format.sources} />
        </Panel>
      </div>
      <Prose text={format.note} className="mt-4 max-w-3xl text-muted" />
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

/** Three transcripts from the real CLI, run at build time so they cannot go stale. */
function Commands() {
  return (
    <>
      <h3 className="mt-14 text-lg font-medium text-fg">{copy.commands.heading}</h3>
      <p className="mt-1 max-w-2xl text-muted">{copy.commands.note}</p>
      <div className="mt-4 max-w-3xl space-y-4">
        {cliReference.map((entry) => (
          <Panel key={entry.command} tone="term">
            <Term text={entry.transcript} />
          </Panel>
        ))}
      </div>
    </>
  );
}

/**
 * The page reads in the order a first visit asks its questions: what is this
 * and why would I want it, how do I get it, what does the agent keep and reach
 * for once it has it, and only then how it works underneath. The README and
 * /index.md follow the same order out of the same data.
 */
function Home() {
  return (
    <>
      <section className="pt-10">
        <h1 className="font-mono text-3xl font-semibold text-fg">{copy.title}</h1>
        <p className="mt-2 text-xl text-muted">{copy.tagline}</p>
        <BeforeAfter />
      </section>

      {/* One thing to do, and one sentence each on what it does and on the
          other way in. The file it writes is the first example below. */}
      <Section label={copy.getStarted.heading}>
        <div className="max-w-3xl">
          <ForYourAgent text={setupPrompt} />
          <Prose text={copy.agent.note} className="mt-3 text-muted" />
          <Prose text={copy.install.note} className="mt-3 text-muted" />
        </div>
      </Section>

      <Section label={copy.examples.heading}>
        {examples.map((example) => (
          <Example key={example.title} {...example} />
        ))}
      </Section>

      <Section label={howItWorks.heading}>
        <Store />
        <Format />
        <Commands />
      </Section>
    </>
  );
}
