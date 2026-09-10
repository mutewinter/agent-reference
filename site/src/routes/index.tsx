import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';

import cliReference from 'virtual:cli-reference';

import {
  copy,
  type Example as ExampleData,
  examples,
  howItWorks,
  setup,
  setupPrompt,
  terminals,
  trees,
} from '../../code-samples.ts';
import {
  Highlighted,
  Panel,
  Prose,
  ReferenceScope,
  Session,
  Term,
  Tree,
  source,
} from '../components/panels';
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

/** One comparison, joined horizontally on desktop and vertically on mobile. */
function BeforeAfter() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const panes = [...ref.current.querySelectorAll<HTMLDivElement>('.comparison-reads')];
    let nextReadAt = 0;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const pane of panes) {
          if (!entries.some((entry) => entry.target === pane && entry.isIntersecting)) continue;
          const now = performance.now();
          const start = Math.max(now, nextReadAt);
          const heading =
            pane.parentElement?.querySelectorAll<HTMLSpanElement>('[data-heading-word]');
          const headingDuration = heading?.length ? (heading.length - 1) * 140 + 600 : 0;
          pane.parentElement?.style.setProperty('--heading-lead', `${start - now}ms`);
          const readsStart = start + headingDuration;
          pane.style.setProperty('--sequence-lead', `${readsStart - now}ms`);
          pane.parentElement?.style.setProperty(
            '--sequence-end',
            `${readsStart - now + (pane.children.length - 1) * 1150 + 1250}ms`,
          );
          nextReadAt = readsStart + pane.children.length * 1150 + 300;
          pane.dataset.reveal = 'playing';
          observer.unobserve(pane);
        }
      },
      { threshold: 0.1 },
    );
    for (const pane of panes) {
      pane.parentElement
        ?.querySelectorAll<HTMLSpanElement>('[data-heading-word]')
        .forEach((word, index) => {
          word.style.setProperty('--word-delay', `${index * 140}ms`);
        });
      const steps = pane.querySelectorAll<HTMLDivElement>('.comparison-step');
      steps.forEach((step, index) => {
        step.style.setProperty('--read-delay', `${index * 1150}ms`);
      });
      pane.dataset.reveal = 'waiting';
      observer.observe(pane);
    }
    return () => {
      observer.disconnect();
      for (const pane of panes) delete pane.dataset.reveal;
    };
  }, []);

  return (
    <div ref={ref} className="comparison mt-10 text-sm">
      <div className="comparison-before min-w-0">
        <h2 className="mb-5 font-heading text-3xl text-muted">{copy.hero.before}</h2>
        <ComparisonReads text={terminals.today} />
      </div>
      <div className="comparison-after min-w-0">
        <h2 className="mb-5 font-heading text-3xl text-fg">
          {copy.hero.after.split(' ').map((word, index) => (
            <span key={`${index}-${word}`} data-heading-word>
              {word}{' '}
            </span>
          ))}
        </h2>
        <ComparisonReads text={terminals.after} />
        <p className="comparison-aside mt-5 text-right text-sm text-muted italic">
          <a
            href={copy.hero.asideUrl}
            target="_blank"
            rel="noreferrer"
            className="decoration-line underline-offset-4 hover:text-fg hover:underline"
            aria-label="Any questions? Watch the original TV ad on YouTube"
          >
            {copy.hero.aside}
          </a>
        </p>
      </div>
    </div>
  );
}

/** Each pane begins once in view, so the mobile source sequence is visible as it plays. */
function ComparisonReads({ text }: { text: string }) {
  const reads = text.split(/\n(?=\* )/u);

  return (
    <div className="comparison-reads">
      {reads.map((read) => (
        <div key={read} className="comparison-step">
          <Session text={read} />
        </div>
      ))}
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
  const names =
    config?.marks ??
    [...(session ? terminals[session] : '').matchAll(/\[\[([^\]]+)\]\]/gu)].map(
      (match) => match[1],
    );
  return (
    <ReferenceScope names={names}>
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
    </ReferenceScope>
  );
}

/**
 * The configs on the left and the disk they produced on the right. The tree is
 * where the explaining happens, so the two sentences framing it are both
 * skippable on purpose, and the first one says so.
 */
function Store() {
  return (
    <ReferenceScope names={howItWorks.configs.flatMap((config) => config.marks)}>
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
    </ReferenceScope>
  );
}

/**
 * The chain the prompt above sets off, one step a row: where the skill lands,
 * what it says, and the agent acting on it. The step's words sit left of the
 * thing they describe, and the numeral carries the sequence so the titles do
 * not have to say "then".
 */
function Setup() {
  return (
    <>
      <Prose text={setup.lead} className="max-w-3xl text-muted" />
      <ol className="mt-10 space-y-10">
        {setup.steps.map((step, index) => (
          <li key={step.title}>
            <ReferenceScope names={step.marks ?? []}>
              <div className="grid gap-4 lg:grid-cols-3 lg:gap-8">
                <div>
                  <span className="font-mono text-sm text-accent">{index + 1}</span>
                  <h3 className="mt-1 text-lg font-medium text-fg">{step.title}</h3>
                  <Prose text={step.note} className="mt-2 text-sm text-muted" />
                </div>
                <div className="min-w-0 lg:col-span-2">
                  {step.tree ? (
                    <Panel>
                      <Tree text={trees[step.tree]} />
                    </Panel>
                  ) : null}
                  {step.file ? (
                    <Panel label={step.file.label} copy={source(step.file.sample)}>
                      <Highlighted name={step.file.sample} />
                    </Panel>
                  ) : null}
                  {step.session ? (
                    <Panel tone="term">
                      <Session text={terminals[step.session]} />
                    </Panel>
                  ) : null}
                </div>
              </div>
            </ReferenceScope>
          </li>
        ))}
      </ol>
    </>
  );
}

/** Transcripts from the real CLI, run at build time so they cannot go stale. */
function Commands() {
  return (
    <>
      <p className="max-w-2xl text-muted">{copy.commands.note}</p>
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
 * and why would I want it, how do I get it, what does that leave on my
 * machine, how does it work underneath, what does it look like in use, and
 * the commands last, for the reader who wants them. The README and /index.md
 * follow the same order out of the same data.
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
      <section className="mx-auto mt-16 max-w-3xl text-center" aria-labelledby="get-started">
        <h2 id="get-started" className="text-3xl font-medium tracking-tight text-fg">
          {copy.getStarted.heading}
        </h2>
        <p className="mt-3 text-lg text-muted">
          <span className="font-mono text-base font-medium text-accent">
            {copy.getStarted.summaryLabel}:
          </span>{' '}
          {copy.getStarted.lead}
        </p>
        <div className="mt-6">
          <ForYourAgent text={setupPrompt} />
          <div className="mt-7 text-sm text-muted">
            <p className="font-medium">{copy.install.heading}</p>
            <Prose text={copy.install.note} className="mt-1" />
          </div>
        </div>
      </section>

      <Section label={setup.heading}>
        <Setup />
      </Section>

      <Section label={howItWorks.heading}>
        <Store />
      </Section>

      <Section label={copy.examples.heading}>
        {examples.map((example) => (
          <Example key={example.title} {...example} />
        ))}
      </Section>

      <Section label={copy.commands.heading}>
        <Commands />
      </Section>
    </>
  );
}
