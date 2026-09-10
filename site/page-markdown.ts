// The page's own words as markdown, rendered once for the two surfaces that
// want them without markup: README.md, which scripts/sync-readme.ts pastes
// these regions into, and /index.md, which the site serves to an agent that
// asked for `text/markdown` instead of HTML. Everything comes from
// code-samples.ts or from running the CLI, so no surface can say something the
// page does not.
import { blocks as highlighted } from './blocks.ts';
import { renderCliReference } from './cli-reference.ts';
import {
  type Example,
  FOLD_LINES,
  type SetupStep,
  copy,
  examples,
  howItWorks,
  setup,
  setupPrompt,
  symptomsCommand,
  terminals,
  trees,
} from './code-samples.ts';

/** Where the page lives, and the two places the thing it documents is published. */
export const SITE = 'https://agent-reference.dev';
export const REPOSITORY = 'https://github.com/mutewinter/agent-reference';
export const NPM = 'https://www.npmjs.com/package/agent-reference';

/**
 * A fenced block, railed with one more backtick than the longest run inside it.
 * The shipped skill is itself markdown with fenced examples in it, so a block
 * that assumed three would end halfway through the file it is showing.
 */
const fence = (lang: string, text: string) => {
  const longest = Math.max(0, ...[...text.matchAll(/`+/gu)].map((run) => run[0].length));
  const rail = '`'.repeat(Math.max(3, longest + 1));
  return `${rail}${lang}\n${text}\n${rail}`;
};

/**
 * A block long enough that a reader scrolls past everything after it, put
 * behind the disclosure GitHub renders for one. The blank lines are load
 * bearing: markdown inside a `<details>` is only parsed as markdown when they
 * are there. The page clamps the same blocks behind a button.
 */
const folded = (summary: string, body: string) =>
  ['<details>', `<summary>${summary}</summary>`, '', body, '', '</details>'].join('\n');

/** Whichever of the two a block has earned, by the length both surfaces measure. */
const foldable = (summary: string, body: string) =>
  body.split('\n').length > FOLD_LINES ? folded(summary, body) : body;

/** A snippet under the filename it belongs in, the way the site labels its panels. */
const fenced = (name: string) => {
  const block = highlighted[name];
  if (!block) throw new Error(`nothing highlights a block named '${name}'`);
  return fence(block.lang, block.code);
};

const labeled = (file: string, name: string) => `\`${file}\`\n\n${fenced(name)}`;

function renderExample({ title, session, tree, config }: Example): string {
  const blocks = [`### ${title}`];
  if (session) blocks.push(transcript(terminals[session]));
  if (tree) blocks.push(fence('text', unmarked(trees[tree])));
  if (config) {
    blocks.push(labeled(config.file, config.sample));
    if (config.note) blocks.push(config.note);
  }
  return blocks.join('\n\n');
}

/** Text without the `[[ ]]` the site underlines with, which markdown cannot. */
const unmarked = (text: string) => text.replaceAll(/\[\[([^\]]+)\]\]/gu, '$1');

/**
 * A transcript without its markers. `! ` and `+ ` on a result line tell the
 * site what tone to paint it, and `[[name]]` which names to underline;
 * markdown has neither, so the lines go out as the agent saw them.
 */
const transcript = (text: string) =>
  fence('text', unmarked(text.replaceAll(/^(\s+(?:\u23BF )?)[!+] /gmu, '$1')));

/** The transcripts, one level under the heading that introduces them. */
function renderCommands(): string {
  return renderCliReference()
    .map((entry) => {
      const lines = entry.transcript.split('\n').length;
      const block = foldable(`Show all ${lines} lines`, fence('text', entry.transcript));
      return `#### ${entry.command}\n\n${block}`;
    })
    .join('\n\n');
}

/**
 * One step of the setup chain: its title numbered the way the page numbers it,
 * the line under it, and whichever panel it carries.
 */
function renderStep(step: SetupStep, index: number): string {
  const blocks = [`### ${index + 1}. ${step.title}`, step.note];
  if (step.tree) blocks.push(fence('text', unmarked(trees[step.tree])));
  if (step.file) {
    blocks.push(
      `\`${step.file.label}\``,
      foldable('Show the whole skill', fenced(step.file.sample)),
    );
  }
  if (step.session) blocks.push(transcript(terminals[step.session]));
  return blocks.join('\n\n');
}

/** The two configs, the store they leave behind, and a line on either side. */
function renderStore(): string {
  return [
    howItWorks.lead,
    ...howItWorks.configs.map((config) => labeled(config.file, config.sample)),
    fence('text', trees[howItWorks.tree]),
    howItWorks.cache,
  ].join('\n\n');
}

/**
 * The first screen as the two images `site/hero.ts` draws of it. Markdown can
 * fence a transcript but it cannot color one, and what the fence loses is the
 * red on what an agent got back, which is the whole argument of that screen.
 * The URLs are absolute because npm renders this file with no repository to
 * resolve against, and the alt text carries what the picture says for anyone
 * the picture does not reach.
 */
const heroImages = () =>
  [
    `### ${copy.hero.before}`,
    `![${copy.hero.beforeAlt}](${SITE}/hero-without.png)`,
    `### ${copy.hero.after}`,
    `![${copy.hero.afterAlt}](${SITE}/hero-with.png)`,
  ].join('\n\n');

/** The same screen as text, for the surface an agent reads. */
const heroText = () =>
  [
    `### ${copy.hero.before}`,
    transcript(terminals.today),
    `### ${copy.hero.after}`,
    transcript(terminals.after),
  ].join('\n\n');

/**
 * Marker id to the markdown it stands for, in the order the page puts them. A
 * function rather than a constant because rendering the commands runs the CLI
 * in a temp directory, and both callers here are scripts that should pay that
 * cost when they ask for it.
 */
export function renderRegions(): Record<string, string> {
  return {
    // Bold, so a lone sentence under the title reads as the tagline it is.
    tagline: `**${copy.tagline}**`,
    lead: copy.lead,
    hero: heroImages(),
    agent: [
      `### ${copy.agent.heading}`,
      `${copy.getStarted.summaryLabel}: ${copy.getStarted.lead}`,
      fence('text', setupPrompt),
      copy.install.note,
      `### ${copy.symptoms.heading}`,
      fence('text', symptomsCommand),
      copy.symptoms.note,
    ].join('\n\n'),
    setup: [setup.lead, ...setup.steps.map((step, index) => renderStep(step, index))].join('\n\n'),
    examples: examples.map((example) => renderExample(example)).join('\n\n'),
    store: renderStore(),
    commands: [copy.commands.note, renderCommands()].join('\n\n'),
  };
}

/** The link map as bullets, without whichever document is rendering it. */
const list = (self: string) =>
  LINKS.filter((link) => link.url !== self)
    .map((link) => `- [${link.name}](${link.url}): ${link.note}`)
    .join('\n');

/**
 * The homepage as one markdown document: the same sections in the same order
 * the page puts them in, out of the same regions the README carries, plus the
 * published links the header and the footer hold on the page itself. This is
 * what /index.md serves, and what an agent asking the homepage for
 * `text/markdown` is handed instead of the HTML.
 */
export function renderHomeMarkdown(): string {
  const regions = renderRegions();

  return (
    [
      `# ${copy.title}`,
      regions.tagline,
      regions.lead,
      heroText(),
      `## ${copy.getStarted.heading}`,
      regions.agent,
      `## ${setup.heading}`,
      regions.setup,
      `## ${howItWorks.heading}`,
      regions.store,
      `## ${copy.examples.heading}`,
      regions.examples,
      `## ${copy.commands.heading}`,
      regions.commands,
      `## ${MORE_HEADING}`,
      list(`${SITE}/index.md`),
    ].join('\n\n') + '\n'
  );
}

/**
 * Headings that only the markdown surfaces have. The page's own headings live
 * in code-samples.ts, where both surfaces read them from; these two name
 * sections the page does not have, so this is the only place they exist.
 */
const MORE_HEADING = 'More';
const WHEN_TO_USE_HEADING = 'When to use this';

/**
 * What the tool is, for a reader that arrived at llms.txt with no page around
 * it. The blockquote above it is the meta description, which sells; this says
 * plainly what the thing does and what it will not do behind your back.
 */
const SUMMARY =
  'agent-reference is a command line tool. It puts readable upstream source on disk and prints the path: any dependency at the exact version a project installs, any git repository, and any file or folder a project declares, each one asked for by name. Nothing is fetched until something asks for it, and a project declares what it references in `agent-reference.json` (committed) or `agent-reference.local.json` (machine-specific).';

/** One entry of the map llms.txt hands an agent, and of /index.md's last section. */
interface Link {
  name: string;
  url: string;
  note: string;
}

/**
 * Every machine-readable thing this domain serves, plus the two places the tool
 * itself is published. Both markdown surfaces render this list and each drops
 * its own entry from it, so llms.txt points at the page and the page points
 * back at llms.txt, and neither one offers a reader the document it is already
 * holding.
 */
export const LINKS: Link[] = [
  {
    name: 'The page, as markdown',
    url: `${SITE}/index.md`,
    note: 'the whole homepage as one markdown document. The homepage itself serves it to any request that sends `Accept: text/markdown`',
  },
  {
    name: 'llms.txt',
    url: `${SITE}/llms.txt`,
    note: 'what this domain publishes for agents, and when to reach for the tool at all',
  },
  {
    name: 'Agent skill',
    url: `${SITE}/.well-known/agent-skills/agent-reference/SKILL.md`,
    note: 'the one verb, when to reach for it, and the safety rules. `npx skills add https://agent-reference.dev` installs it into a harness from this domain',
  },
  {
    name: 'Config JSON Schema',
    url: `${SITE}/schema/agent-reference.schema.json`,
    note: 'what `agent-reference.json` and `agent-reference.local.json` are checked against. Read it before writing one; `agent-reference schema` prints the same document from the installed CLI',
  },
  {
    name: 'Source',
    url: REPOSITORY,
    note: 'the CLI, the tests that specify it, and `docs/decisions/` for why the design is what it is',
  },
  {
    name: 'Package',
    url: NPM,
    note: 'released versions. `npx agent-reference init` sets a project up without installing anything first',
  },
];

/**
 * When an agent should reach for this tool, stated as jobs rather than as a
 * pitch. These are the triggers the skill's own frontmatter carries, said
 * shorter, because an agent choosing a tool off llms.txt has not read the skill
 * yet and this is the only chance to tell it what the tool is for.
 */
const WHEN_TO_USE: string[] = [
  'You are about to write code against a library whose API you cannot recall exactly. `agent-reference get <name>` puts the repository behind that exact version on disk, with the README, `docs/`, `examples/`, and changelog a published build drops. A docs site carries whatever shipped last; the checkout carries what the project installs.',
  'You need to know how something upstream actually works: how it is implemented, how its maintainers test it, why it behaves the way it does, or whether it is worth adopting.',
  'The user names a repository, app, folder, or file that is not in the current project and gives no path for it. Read `agent-reference.json` and `agent-reference.local.json`, which are an index of names to sources and resolve without fetching anything.',
  'A project you are working in contains `agent-reference.json` or `agent-reference.local.json`, or the user asks to add a reference or set a project up. Run `agent-reference guide` before writing either file; it prints the config format from the installed CLI rather than from memory.',
];

/**
 * The llms.txt at the root, in the shape llmstxt.org describes: an H1 with the
 * name, a blockquote summary, free prose, then H2 sections, the last of which
 * is the link list the format is really about.
 *
 * The when-to-use section between them is prose rather than links, which the
 * format does not describe and which is deliberate anyway. What is being
 * answered there is whether to reach for this tool at all, and the reader
 * deciding that is a model reading the file top to bottom, not a parser
 * collecting URLs out of it.
 */
export function renderLlmsTxt(): string {
  const jobs = WHEN_TO_USE.map((job) => `- ${job}`).join('\n');

  return (
    [
      `# ${copy.title}`,
      `> ${copy.description}`,
      SUMMARY,
      `## ${WHEN_TO_USE_HEADING}`,
      jobs,
      '## Docs',
      list(`${SITE}/llms.txt`),
    ].join('\n\n') + '\n'
  );
}
