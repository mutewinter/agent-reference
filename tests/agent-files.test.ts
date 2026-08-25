import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { LINK_HEADER, NOT_FOUND_MARKDOWN } from '../site/agent-responses.ts';
import { copy, format, howItWorks } from '../site/code-samples.ts';
import { LINKS, SITE, renderLlmsTxt } from '../site/page-markdown.ts';
import { renderAgentFiles } from '../scripts/sync-agent-files.ts';

const PUBLIC = new URL('../site/public/', import.meta.url);

const served = (path: string) => readFileSync(new URL(path, PUBLIC), 'utf8');

// Rendering is not free: it runs the CLI once for the command reference. One call, read
// by every test below.
const rendered = renderAgentFiles();

test('what is committed under site/public is what the renderers produce', () => {
  for (const [path, contents] of Object.entries(rendered)) {
    assert.equal(
      served(path),
      contents,
      `site/public/${path} is behind its source. Run \`npm run sync-agent-files\`.`,
    );
  }
});

test('llms.txt has the shape llmstxt.org describes', () => {
  const lines = renderLlmsTxt().split('\n');

  assert.equal(lines[0], `# ${copy.title}`, 'an H1 with the name comes first');
  assert.equal(lines[1], '', 'a blank line separates it from the summary');
  assert.match(lines[2] ?? '', /^> \S/, 'a blockquote summary comes next');

  // The sections, in order, each split into the heading line and the body under it.
  const [, ...sections] = renderLlmsTxt().split('\n## ');
  assert.equal(sections.length, 2, 'when to use it, then where everything is');
  const body = (section: string) => section.split('\n').slice(1).join('\n').trim().split('\n');

  const [when, docs] = sections as [string, string];
  assert.match(when, /^when to use/i);
  const jobs = body(when);
  assert.ok(jobs.length >= 3, 'the guidance names several jobs');
  for (const job of jobs) assert.match(job, /^- \S/);

  // The last section is the file list the format is really about, so every item in it is
  // a link with a note, which is the shape a parser collecting URLs expects.
  for (const item of body(docs)) {
    assert.match(item, /^- \[[^\]]+\]\([^)]+\): \S/, `every doc links: ${item}`);
  }
});

test('index.md carries the page sections, in the page order', () => {
  const headings = [...served('index.md').matchAll(/^## (.+)$/gm)].map((match) => match[1]);
  assert.deepEqual(headings, [
    copy.getStarted.heading,
    copy.demo.heading,
    copy.examples.heading,
    howItWorks.heading,
    format.heading,
    copy.commands.heading,
    'More',
  ]);
  assert.match(served('index.md'), /^# agent-reference\n/, 'and one H1 with the name');
});

test('neither markdown surface offers a reader the document it is already holding', () => {
  assert.ok(!served('llms.txt').includes(`(${SITE}/llms.txt)`));
  assert.ok(!served('index.md').includes(`(${SITE}/index.md)`));
  // Both still name everything else, so either one is a complete way in.
  for (const link of LINKS) {
    const elsewhere = link.url.startsWith(`${SITE}/llms.txt`) ? 'index.md' : 'llms.txt';
    assert.ok(served(elsewhere).includes(link.url), `${elsewhere} names ${link.url}`);
  }
});

test('the skills index describes the file it is served beside', () => {
  const index = JSON.parse(served('.well-known/agent-skills/index.json')) as {
    $schema: string;
    skills: Array<{ name: string; type: string; description: string; url: string; digest: string }>;
  };

  assert.equal(index.$schema, 'https://schemas.agentskills.io/discovery/0.2.0/schema.json');
  const [skill, ...rest] = index.skills;
  assert.equal(rest.length, 0, 'this repository publishes one skill');
  assert.ok(skill);

  assert.match(skill.name, /^[a-z0-9-]{1,64}$/);
  assert.equal(skill.type, 'skill-md');
  assert.ok(skill.description.length <= 1024, 'the RFC caps a description at 1024 characters');

  // Root-relative, so it resolves against wherever the index itself is served rather
  // than pinning one origin. The digest is over the bytes at that path, which are right
  // here to hash.
  assert.match(skill.url, /^\/\.well-known\/agent-skills\//);
  const path = skill.url.slice(1);
  assert.equal(skill.digest, `sha256:${createHash('sha256').update(served(path)).digest('hex')}`);
});

test('the index npx skills reads names files it can fetch from beside itself', () => {
  const index = JSON.parse(served('.well-known/skills/index.json')) as {
    skills: Array<{ name: string; description: string; files: string[] }>;
  };

  const [skill, ...rest] = index.skills;
  assert.equal(rest.length, 0);
  assert.ok(skill);

  // The rules skills-cli enforces before it will install: a name it can use as a
  // directory, a description, and a file list that has a SKILL.md in it and cannot
  // climb out of the skill's own folder.
  assert.match(skill.name, /^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?$/);
  assert.ok(skill.description.length > 0);
  assert.ok(skill.files.some((file) => file.toLowerCase() === 'skill.md'));
  for (const file of skill.files) {
    assert.ok(!file.startsWith('/') && !file.includes('..'), `${file} escapes the skill`);
    // Path-derived rather than declared: the client fetches this exact URL.
    assert.doesNotThrow(() => served(`.well-known/skills/${skill.name}/${file}`));
  }
});

test('every served copy of the skill is the one the package ships, byte for byte', () => {
  const shipped = readFileSync(new URL('../skills/agent-reference/SKILL.md', import.meta.url));
  for (const tree of ['agent-skills', 'skills']) {
    const published = readFileSync(new URL(`.well-known/${tree}/agent-reference/SKILL.md`, PUBLIC));
    assert.deepEqual(published, shipped, `the copy under ${tree}/ has drifted`);
  }
});

test('the served schema is the one the CLI prints, byte for byte', () => {
  const shipped = readFileSync(new URL('../schema/agent-reference.schema.json', import.meta.url));
  const published = readFileSync(new URL('schema/agent-reference.schema.json', PUBLIC));
  assert.deepEqual(published, shipped);
});

test('every path the Worker points an agent at is one this site serves', () => {
  const paths = [
    ...NOT_FOUND_MARKDOWN.matchAll(/\]\((\/[^)]*)\)/g),
    ...LINK_HEADER.matchAll(/<(\/[^>]+)>/g),
  ].map((match) => match[1] ?? '');
  assert.ok(paths.length > 0);

  for (const path of new Set(paths)) {
    // `/` is the prerendered page, which is built rather than committed. Everything else
    // is a file under site/public.
    if (path === '/') continue;
    assert.doesNotThrow(() => served(path.slice(1)), `nothing serves ${path}`);
  }
});

test('nothing generated carries a path off the machine that generated it', () => {
  for (const [path, contents] of Object.entries(rendered)) {
    assert.doesNotMatch(contents, /\/Users\/|\/home\/[a-z]|[A-Z]:\\\\/, `${path} leaks a path`);
  }
});
