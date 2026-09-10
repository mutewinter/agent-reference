// The page's own words as markdown, rendered once for the two surfaces that
// want them without markup: README.md, which scripts/sync-readme.ts pastes
// these regions into, and /index.md, which the site serves to an agent that
// asked for `text/markdown` instead of HTML. Everything comes from
// code-samples.ts or from running the CLI, so no surface can say something the
// page does not.
import { renderCliReference } from './cli-reference.ts';
import {
  type Example,
  copy,
  examples,
  format,
  fragments,
  howItWorks,
  samples,
  setupPrompt,
  terminals,
  trees,
} from './code-samples.ts';

/** Where the page lives, and the two places the thing it documents is published. */
export const SITE = 'https://agent-reference.dev';
export const REPOSITORY = 'https://github.com/mutewinter/agent-reference';
export const NPM = 'https://www.npmjs.com/package/agent-reference';

/** A fenced block. No sample contains a fence, so three backticks are enough. */
const fence = (lang: string, text: string) => '```' + lang + '\n' + text + '\n```';

/** A snippet under the filename it belongs in, the way the site labels its panels. */
const labeled = (file: string, name: keyof typeof samples) =>
  `\`${file}\`\n\n${fence(samples[name].lang, samples[name].code)}`;

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

/** Tool labels sit outside the results so GitHub can highlight each result's language. */
function heroTranscript(text: string): string {
  return text
    .split(/\n(?=\* )/u)
    .map((block) => {
      const [call = '', ...lines] = block.split('\n');
      const result = lines
        .map((line) => line.replace(/^(?: {2}⎿ | {4})(?:[!+] )?/u, ''))
        .join('\n');
      const language = call.startsWith('* WebFetch(')
        ? 'html'
        : call.endsWith('.ts)')
          ? 'typescript'
          : call.endsWith('.js)')
            ? 'javascript'
            : call.endsWith('.md)')
              ? 'markdown'
              : 'text';
      return `\`${call.slice(2)}\`\n\n${fence(language, result)}`;
    })
    .join('\n\n');
}

/**
 * The transcripts, one level under the heading that introduces them, which is
 * itself a subsection of how it works.
 */
function renderCommands(): string {
  return renderCliReference()
    .map((entry) => `#### ${entry.command}\n\n${fence('text', entry.transcript)}`)
    .join('\n\n');
}

/** One panel label, and the rows the site sets under it, as a two-column table. */
const table = (heading: string, rows: typeof format.values) =>
  [
    `| ${heading} | |`,
    '| --- | --- |',
    ...rows.map((row) => `| \`${fragments[row.fragment].code}\` | ${row.means} |`),
  ].join('\n');

/**
 * The format, as two tables. The site sets these as facing panels; markdown has
 * no columns, so the panel labels become the table headings instead.
 */
function renderFormat(): string {
  return [
    `### ${format.heading}`,
    format.lead,
    table('a value may be', format.values),
    table('a source may be', format.sources),
    format.note,
  ].join('\n\n');
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
    hero: [
      `### ${copy.hero.before}`,
      heroTranscript(terminals.today),
      `### ${copy.hero.after}`,
      heroTranscript(terminals.after),
      `*[${copy.hero.aside}](${copy.hero.asideUrl})*`,
    ].join('\n\n'),
    agent: [
      `### ${copy.agent.heading}`,
      `${copy.getStarted.summaryLabel}: ${copy.getStarted.lead}`,
      fence('text', setupPrompt),
      copy.agent.followThrough,
      copy.install.note,
    ].join('\n\n'),
    examples: examples.map((example) => renderExample(example)).join('\n\n'),
    store: renderStore(),
    format: renderFormat(),
    commands: [`### ${copy.commands.heading}`, copy.commands.note, renderCommands()].join('\n\n'),
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
      regions.hero,
      `## ${copy.getStarted.heading}`,
      regions.agent,
      `## ${copy.examples.heading}`,
      regions.examples,
      `## ${howItWorks.heading}`,
      regions.store,
      regions.format,
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
