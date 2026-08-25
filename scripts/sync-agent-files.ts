// Writes the files the site serves to agents rather than to browsers, into
// site/public/ where the build copies them as static assets. Each one is
// rendered from something this repository already has: the page's own words in
// site/code-samples.ts, the skill in skills/, and the config schema in schema/.
// None of them is edited by hand, and tests/agent-files.test.ts fails when what
// is committed no longer matches what these renderers produce.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { renderHomeMarkdown, renderLlmsTxt } from '../site/page-markdown.ts';

const ROOT = new URL('../', import.meta.url);

/**
 * The two well-known trees this site publishes the skill under, because the
 * convention forked and the two halves want different things.
 *
 * `agent-skills/` is the Agent Skills Discovery RFC: an entry carries a `url`
 * and a `sha256` digest, and it is what a readiness scanner grades. `skills/`
 * is what `npx skills add https://agent-reference.dev` reads: an entry names
 * its files instead, and the client fetches each one from beside the index. No
 * client reads both, and neither format can be expressed in the other, so the
 * file is published twice and generated both times.
 */
const SKILL_PATH = '.well-known/agent-skills/agent-reference/SKILL.md';
const SKILLS_CLI_PATH = '.well-known/skills/agent-reference/SKILL.md';

/** The version of the discovery index this repository writes. */
const DISCOVERY_SCHEMA = 'https://schemas.agentskills.io/discovery/0.2.0/schema.json';

/** What a discovery entry's `description` may not exceed, per that RFC. */
const DESCRIPTION_LIMIT = 1024;

function read(path: string): string {
  return readFileSync(new URL(path, ROOT), 'utf8');
}

/**
 * The `description` out of a SKILL.md's frontmatter. The discovery index says
 * the same thing the skill says about itself rather than a second summary that
 * can drift from it, so this reads the one that ships.
 */
function skillDescription(skill: string): string {
  const frontmatter = /^---\n([\s\S]*?)\n---\n/.exec(skill)?.[1];
  const description = frontmatter && /^description:[ \t]*(.+)$/m.exec(frontmatter)?.[1];
  if (!description) throw new Error('SKILL.md has no description in its frontmatter');
  if (description.length > DESCRIPTION_LIMIT) {
    throw new Error(
      `SKILL.md's description is ${description.length} characters; the discovery index allows ${DESCRIPTION_LIMIT}`,
    );
  }
  return description;
}

/**
 * The discovery index at /.well-known/agent-skills/index.json. The digest is
 * over the bytes served at `url`, which is why it is taken from the same string
 * this run writes there: a skill edited without running this script leaves a
 * digest that no longer matches, and the test says so.
 */
function renderSkillsIndex(skill: string): string {
  const index = {
    $schema: DISCOVERY_SCHEMA,
    skills: [
      {
        name: 'agent-reference',
        type: 'skill-md',
        description: skillDescription(skill),
        // Root-relative, resolved against the index's own URL per RFC 3986. An
        // absolute one would send a reader of a preview deployment back to
        // production, where the bytes the digest describes may be different.
        url: `/${SKILL_PATH}`,
        digest: `sha256:${createHash('sha256').update(skill, 'utf8').digest('hex')}`,
      },
    ],
  };
  return JSON.stringify(index, null, 2) + '\n';
}

/**
 * The index `npx skills add` reads. It has no digest field and no `$schema`:
 * the client validates the shape it wants, fetches every name in `files` from
 * `.well-known/skills/<name>/`, and takes the skill's real metadata out of the
 * SKILL.md frontmatter once it has it.
 */
function renderSkillsCliIndex(skill: string): string {
  const index = {
    skills: [
      {
        name: 'agent-reference',
        description: skillDescription(skill),
        files: ['SKILL.md'],
      },
    ],
  };
  return JSON.stringify(index, null, 2) + '\n';
}

/**
 * Every file this script owns, keyed by its path under site/public/. Rendering
 * and writing are separate so the test can compare against what is committed
 * without touching the working tree.
 */
export function renderAgentFiles(): Record<string, string> {
  const skill = read('skills/agent-reference/SKILL.md');

  return {
    // The page without its markup, served both at this path and by the homepage
    // itself to a request that asks for `text/markdown`.
    'index.md': renderHomeMarkdown(),
    'llms.txt': renderLlmsTxt(),
    // Served verbatim: the copy an agent fetches has to be byte-identical to the
    // one in the package, or the digest above describes a different file.
    [SKILL_PATH]: skill,
    [SKILLS_CLI_PATH]: skill,
    '.well-known/agent-skills/index.json': renderSkillsIndex(skill),
    '.well-known/skills/index.json': renderSkillsCliIndex(skill),
    // The same document `agent-reference schema` prints, at a URL an editor or
    // an agent writing a config can reach without installing anything.
    'schema/agent-reference.schema.json': read('schema/agent-reference.schema.json'),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let written = 0;
  for (const [path, contents] of Object.entries(renderAgentFiles())) {
    const file = new URL(`site/public/${path}`, ROOT);
    mkdirSync(dirname(file.pathname), { recursive: true });
    let before: string | undefined;
    try {
      before = readFileSync(file, 'utf8');
    } catch {
      before = undefined;
    }
    if (before === contents) continue;
    writeFileSync(file, contents);
    console.log(`wrote site/public/${path}`);
    written += 1;
  }
  console.log(written === 0 ? 'agent files are already in sync' : `${written} file(s) updated`);
}
