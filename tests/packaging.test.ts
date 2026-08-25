import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { load } from 'js-yaml';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

test('every file the CLI reads at runtime is one npm packs', async () => {
  const manifest = JSON.parse(await fs.readFile(path.join(repoRoot, 'package.json'), 'utf8')) as {
    files: string[];
  };
  const packed = new Set([...manifest.files.map((entry) => entry.split('/')[0]), 'package.json']);
  const sourceDir = path.join(repoRoot, 'src');
  const missing: string[] = [];

  for (const file of await fs.readdir(sourceDir)) {
    const contents = await fs.readFile(path.join(sourceDir, file), 'utf8');
    // Anything resolved against the module's own location is read from the installed
    // package, so leaving it out of `files` breaks only for users and never in this repo.
    for (const match of contents.matchAll(/new URL\('\.\.\/([^'/]+)/g)) {
      if (!packed.has(match[1])) missing.push(`${file} reads ../${match[1]}`);
    }
  }

  assert.deepEqual(missing, []);
});

test('the built CLI is executable', async (t) => {
  const cli = path.join(repoRoot, 'dist', 'cli.js');
  const stat = await fs.stat(cli).catch(() => null);
  if (!stat) {
    t.skip('dist is not built');
    return;
  }

  // tsc emits 0644 and `clean` deletes the file npm's install-time chmod fixed, so a bin
  // linked from a source checkout stops running until the build restores the mode itself.
  assert.ok(stat.mode & 0o111, `${cli} is mode ${(stat.mode & 0o777).toString(8)}, not executable`);
  assert.match(await fs.readFile(cli, 'utf8'), /^#!/);
});

test('every shipped skill has frontmatter a real YAML parser accepts', async () => {
  const skillsDir = path.join(repoRoot, 'skills');
  const skills = await fs.readdir(skillsDir);
  assert.ok(skills.length > 0, `no skills under ${skillsDir}`);

  for (const skill of skills) {
    const file = path.join(skillsDir, skill, 'SKILL.md');
    const contents = await fs.readFile(file, 'utf8');
    const frontmatter = /^---\n([\s\S]*?)\n---\n/.exec(contents);
    assert.ok(frontmatter, `${skill}/SKILL.md opens with no frontmatter block`);

    // The harness that installs a skill reads this leniently; nothing else does. An unquoted
    // scalar holding ": " is a mapping entry rather than prose, so a description phrased as
    // one sentence with a colon in it stops the whole file loading for every other consumer.
    // The description is the part that gets rewritten whenever the trigger is tuned, which is
    // what puts this failure in front of users rather than in front of this repo.
    let parsed: unknown;
    assert.doesNotThrow(() => {
      parsed = load(frontmatter[1]);
    }, `${skill}/SKILL.md frontmatter is not valid YAML`);

    const fields = parsed as Record<string, unknown>;
    assert.equal(typeof fields.name, 'string', `${skill}/SKILL.md frontmatter has no name`);
    assert.equal(
      typeof fields.description,
      'string',
      `${skill}/SKILL.md frontmatter has no description`,
    );
  }
});
