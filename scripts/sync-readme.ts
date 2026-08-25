// Renders the site's own content into README.md. The README says what the site
// says and nothing else, in the same order, so everything it carries comes from
// site/code-samples.ts or from running the CLI and neither has a second copy
// here. This script pastes both into the regions the README marks, and
// tests/readme.test.ts fails when the README no longer matches.
import { readFileSync, writeFileSync } from 'node:fs';

import { renderCliReference } from '../site/cli-reference.ts';
import {
  type Example,
  agents,
  cd,
  copy,
  examples,
  format,
  howItWorks,
  install,
  prompt,
  samples,
  setupPrompt,
  terminals,
  trees,
} from '../site/code-samples.ts';

const README = new URL('../README.md', import.meta.url);

/** A fenced block. No sample contains a fence, so three backticks are enough. */
const fence = (lang: string, text: string) => '```' + lang + '\n' + text + '\n```';

/** A snippet under the filename it belongs in, the way the site labels its panels. */
const labeled = (file: string, name: keyof typeof samples) =>
  `\`${file}\`\n\n${fence(samples[name].lang, samples[name].code)}`;

function renderExample({ title, note, tree, file, sample, terminal }: Example): string {
  const blocks = [`### ${title}`, note];
  if (tree) blocks.push(fence('text', trees[tree]));
  blocks.push(labeled(file, sample));
  if (terminal) blocks.push(fence('text', terminals[terminal]));
  return blocks.join('\n\n');
}

/**
 * The install card, which cycles the harness name on the site. Markdown cannot
 * cycle, so the alternatives ride along as a comment on the line they replace.
 */
function renderInstall(): string {
  const [first, ...rest] = agents;
  return [
    `### ${copy.install.heading}`,
    fence(
      'sh',
      [install, cd, `${first} "${prompt}"`.padEnd(46) + `# or ${rest.join(', ')}`].join('\n'),
    ),
  ].join('\n\n');
}

function renderCommands(): string {
  return renderCliReference()
    .map((entry) => `### ${entry.command}\n\n${fence('text', entry.transcript)}`)
    .join('\n\n');
}

/**
 * The format, as two tables. The site sets these as facing panels; markdown has
 * no columns, so the panel labels become the table headings instead.
 */
function renderFormat(): string {
  const table = (heading: string, rows: Array<{ code: string; means: string }>) =>
    [
      `| ${heading} | |`,
      '| --- | --- |',
      ...rows.map((row) => `| \`${row.code}\` | ${row.means} |`),
    ].join('\n');

  return [
    format.lead,
    table('a value may be', format.values),
    table('a source may be', format.sources),
    format.note,
  ].join('\n\n');
}

/** The two configs, the store they leave behind, and a line on either side. */
function renderHowItWorks(): string {
  return [
    howItWorks.lead,
    ...howItWorks.configs.map((config) => labeled(config.file, config.sample)),
    fence('text', trees[howItWorks.tree]),
    howItWorks.cache,
  ].join('\n\n');
}

/** Marker id to the markdown it stands for. */
const generated: Record<string, string> = {
  // Bold, so a lone sentence under the title reads as the tagline it is.
  tagline: `**${copy.tagline}**`,
  hero: [labeled('agent-reference.json', 'shared'), fence('text', terminals.setup)].join('\n\n'),
  agent: [`### ${copy.agent.heading}`, fence('text', setupPrompt), copy.agent.note].join('\n\n'),
  install: renderInstall(),
  'then-use': [copy.thenUse.note, fence('text', terminals.session)].join('\n\n'),
  format: renderFormat(),
  examples: examples.map(renderExample).join('\n\n'),
  'how-it-works': renderHowItWorks(),
  commands: [copy.commands.note, renderCommands()].join('\n\n'),
};

export function render(readme: string): string {
  const seen = new Set<string>();
  const rendered = readme.replaceAll(
    /<!-- generated:(\S+) -->[\s\S]*?<!-- \/generated -->/g,
    (_match, id) => {
      if (!(id in generated)) throw new Error(`README marks a region '${id}' that nothing renders`);
      seen.add(id);
      return `<!-- generated:${id} -->\n${generated[id]}\n<!-- /generated -->`;
    },
  );

  const missing = Object.keys(generated).filter((id) => !seen.has(id));
  if (missing.length > 0) throw new Error(`README has no region for: ${missing.join(', ')}`);
  return rendered;
}

export function readReadme(): string {
  return readFileSync(README, 'utf8');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const before = readReadme();
  const after = render(before);
  if (after === before) {
    console.log('README.md is already in sync');
  } else {
    writeFileSync(README, after);
    console.log('README.md updated from the site');
  }
}
