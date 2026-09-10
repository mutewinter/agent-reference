// Every snippet the build-time highlighter files, keyed the way the page asks
// for them. Most are written in code-samples.ts; the skill is read off disk,
// because it is a file this repository already ships and a copy of it here
// would be a second version of the thing the page is showing you. Node only:
// the browser sees the rendered output through `virtual:highlighted`, never
// this module.
import { readFileSync } from 'node:fs';

import { SKILL_SAMPLE, samples } from './code-samples.ts';

/** The shipped skill, whole, the way `npx skills add` installs it. */
const skill = {
  lang: 'markdown',
  code: readFileSync(
    new URL('../skills/agent-reference/SKILL.md', import.meta.url),
    'utf8',
  ).trimEnd(),
};

export const blocks: Record<string, { lang: string; code: string }> = {
  ...samples,
  [SKILL_SAMPLE]: skill,
};
