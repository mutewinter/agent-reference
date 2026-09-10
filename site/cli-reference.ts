// The CLI reference the site and the README both carry. A throwaway project is
// built in a temp directory, the real CLI is run inside it, and the output is
// pasted out verbatim apart from path normalisation, so neither surface can
// describe a command the tool no longer has. Nothing here touches the network
// or the real store, so a deploy cannot hang on a clone.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const fixture = {
  'agent-reference.json': `{
  "references": {
    "semver": {
      "source": "npm:semver@7.8.4",
      "description": "Read its range grammar before writing one by hand"
    },
    "brief": {
      "source": "./notes/brief.md",
      "description": "What this project is for, in one page"
    },
    "notes": {
      "source": "./notes",
      "description": "Everything written down while building this"
    },
    "opencode": {
      "source": "github:anomalyco/opencode",
      "description": "A coding agent for terminal dwellers"
    }
  }
}
`,
  'package.json': `{ "name": "my-app", "dependencies": { "semver": "^7.8.4" } }\n`,
  'pnpm-lock.yaml': `lockfileVersion: "9.0"

importers:

  .:
    dependencies:
      semver:
        specifier: ^7.8.4
        version: 7.8.4
`,
  'notes/brief.md': '# Project brief\n',
};

/**
 * Run in this order; it reads as somebody finding their way around. The note
 * becomes a shell comment above the command, because the output on its own is
 * too terse to explain what you were asking for. Four commands and no more:
 * `help` already lists every verb and flag, and the rest are the ones anybody
 * opens, so anything past them is the reference restating itself.
 *
 * `activity` runs last because it reports on the runs above it. What it prints
 * here is the record those three left in this fixture's own store, which is
 * also the shortest way to show what the command is for.
 */
export const commands = [
  { argv: ['help'], note: 'every command, from the version you have installed' },
  { argv: ['status'], note: 'what this project declares, and whether it is on disk yet' },
  { argv: ['get', 'brief'], note: 'a name in, a path out. This is the one agents live in' },
  { argv: ['activity'], note: 'whether your agents are reaching for it, and for what' },
];

/**
 * The environment the fixture runs under, with anything that would name the
 * machine's own harness taken out of it. `activity` reports who ran a command,
 * and it is right to: it reads the variables a harness sets on itself. That
 * makes the transcript a record of whoever last ran this script, which differs
 * between a laptop, a CI job, and a deploy, so the committed output would flip
 * with the operator. Broader than the CLI's own table on purpose, so a harness
 * added there cannot quietly sign the page.
 */
function anonymous(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const name of Object.keys(env)) {
    if (name === 'CI' || /^(AIDER|AMP|CLAUDE|CODEX|COPILOT|CURSOR|GEMINI|OPENCODE)/u.test(name)) {
      delete env[name];
    }
  }
  return env;
}

/**
 * Runs every command above against the fixture and returns what each printed.
 * Machine paths are replaced with placeholders, because both surfaces are
 * public. The CLI is read from source so this needs no build step.
 */
export function renderCliReference() {
  const root = mkdtempSync(join(tmpdir(), 'agent-reference-ref-'));
  // macOS hands back /var/... and resolves it to /private/var/..., so the CLI
  // prints a path that the un-resolved prefix does not match.
  const real = realpathSync(root);
  const project = join(real, 'my-app');
  const store = join(real, 'store');

  try {
    for (const [name, contents] of Object.entries(fixture)) {
      const file = join(project, name);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, contents);
    }

    const cli = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
    const clean = (text: string) =>
      text.split(project).join('~/code/my-app').split(store).join('~/.agent-reference');

    return commands.map(({ argv, note }) => {
      const printed = execFileSync(process.execPath, ['--experimental-strip-types', cli, ...argv], {
        cwd: project,
        encoding: 'utf8',
        env: { ...anonymous(), AGENT_REFERENCE_STORE_DIR: store, NO_COLOR: '1' },
      });
      return {
        note,
        command: `agent-reference ${argv.join(' ')}`,
        transcript: clean(`# ${note}\n$ agent-reference ${argv.join(' ')}\n${printed.trimEnd()}`),
      };
    });
  } finally {
    rmSync(real, { recursive: true, force: true });
  }
}
