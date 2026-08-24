// The CLI reference the site and the README both carry. A throwaway project is
// built in a temp directory, the real CLI is run inside it, and the output is
// pasted out verbatim apart from path normalisation, so neither surface can
// describe a command the tool no longer has. Nothing here touches the network
// or the real store, so a deploy cannot hang on a clone.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export const fixture = {
  'agent-reference.json': `{
  "git": {
    "opencode": {
      "repository": "github:anomalyco/opencode",
      "description": "A coding agent for terminal dwellers"
    }
  },
  "paths": {
    "brief": "./notes/brief.md",
    "notes": "./notes"
  },
  "packages": {
    "semver": "7.8.4"
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
}

/**
 * Run in this order; it reads as somebody finding their way around. The note
 * becomes a shell comment above the command, because the output on its own is
 * too terse to explain what you were asking for.
 */
export const commands = [
  { argv: ['help'], note: 'every command, from the version you have installed' },
  { argv: ['status'], note: 'what this project declares, and whether it is on disk yet' },
  { argv: ['get', 'brief'], note: 'a name in, a path out. This is the one agents live in' },
  { argv: ['versions', 'semver'], note: 'which versions this project installs, and where. Never fetches' },
  { argv: ['validate'], note: 'check the config, including that no machine path reached the committed file' },
  { argv: ['schema'], note: 'the JSON Schema for the config, for an editor or an agent writing one' },
]

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

    const cli = new URL('../src/cli.ts', import.meta.url).pathname;
    const clean = (text) =>
      text.split(project).join('~/code/my-app').split(store).join('~/.agent-reference');

    return commands.map(({ argv, note }) => {
      const out = execFileSync(process.execPath, ['--experimental-strip-types', cli, ...argv], {
        cwd: project,
        encoding: 'utf8',
        env: { ...process.env, AGENT_REFERENCE_STORE_DIR: store, NO_COLOR: '1' },
      });
      return {
        note,
        command: `agent-reference ${argv.join(' ')}`,
        transcript: clean(`# ${note}\n$ agent-reference ${argv.join(' ')}\n${out.trimEnd()}`),
      };
    });
  } finally {
    rmSync(real, { recursive: true, force: true });
  }
}
