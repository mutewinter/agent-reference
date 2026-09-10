// The CLI reference the site and the README both carry. A throwaway project is
// built in a temp directory, the real CLI is run inside it, and the output is
// pasted out verbatim apart from path normalisation, so neither surface can
// describe a command the tool no longer has. Nothing here touches the network
// or the real store, so a deploy cannot hang on a clone.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
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
 * A home directory of agent transcripts, invented, because `audit` reports the
 * machine it runs on and this one is a laptop or a build runner: the committed
 * output would otherwise be somebody's real history, or nothing at all. The
 * four sessions that carry a finding quote the same four failures the first
 * screen opens on, since a reader who scrolled past that screen should
 * recognize the lines when they turn up again down here.
 */
const call = (name: string, input: Record<string, unknown>) =>
  `${JSON.stringify({
    type: 'assistant',
    message: { role: 'assistant', content: [{ type: 'tool_use', name, input }] },
  })}\n`;

const output = (text: string) =>
  `${JSON.stringify({
    type: 'user',
    message: { role: 'user', content: [{ type: 'tool_result', content: text }] },
  })}\n`;

const shell = (command: string) =>
  `${JSON.stringify({
    type: 'response_item',
    payload: { type: 'function_call', name: 'shell', arguments: JSON.stringify({ command }) },
  })}\n`;

/**
 * The sessions with something in them, oldest first, so the last of each kind
 * is the one quoted. `copies` is what makes a share read like one: a history
 * where every failure happened exactly once is not a history anybody has.
 */
const transcripts: Array<{ directory: string; name: string; copies: number; body: string }> = [
  {
    directory: '.claude/projects/my-app',
    name: 'clone',
    copies: 1,
    body: call('Bash', {
      command: 'git clone --depth 1 https://github.com/remotion-dev/remotion.git /tmp/r',
    }),
  },
  {
    directory: '.codex/sessions/2026/09',
    name: 'rollout-build',
    copies: 1,
    body: shell("sed -n '1,80p' node_modules/zod/dist/index.js"),
  },
  {
    directory: '.claude/projects/my-app',
    name: 'guess',
    copies: 2,
    body:
      call('Edit', { file_path: '~/code/my-app/src/schema.ts' }) +
      output(`error TS2305: 'zod' has no exported member 'strictObject'`),
  },
  {
    directory: '.claude/projects/my-app',
    name: 'bundle',
    copies: 2,
    body: call('Read', { file_path: '~/code/my-app/node_modules/effect/dist/FileSystem.js' }),
  },
  {
    directory: '.claude/projects/my-app',
    name: 'docs',
    copies: 5,
    body: call('WebFetch', { url: 'https://effect.website/docs/platform/file-system' }),
  },
];

/** Enough quiet sessions around them that the shares read like a real history. */
const QUIET = { '.claude/projects/my-app': 32, '.codex/sessions/2026/09': 11 };

/**
 * Run in this order; it reads as somebody finding their way around. The note
 * becomes a shell comment above the command, because the output on its own is
 * too terse to explain what you were asking for. Four commands and no more:
 * `help` already lists every verb and flag, and the rest are the ones anybody
 * opens, so anything past them is the reference restating itself.
 *
 * `audit` runs first because it is the one a person runs before any of the
 * rest, and it is the only one pointed at a home directory rather than at the
 * project: what it reports is the machine, so the machine here is invented.
 *
 * `activity` runs last because it reports on the runs above it. What it prints
 * here is the record those left in this fixture's own store, which is also the
 * shortest way to show what the command is for.
 */
export const commands = [
  {
    argv: ['audit'],
    note: 'what your agents did before they had any of this. The one you run yourself',
    home: true,
  },
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
  const home = join(real, 'home');

  try {
    for (const [name, contents] of Object.entries(fixture)) {
      const file = join(project, name);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, contents);
    }

    writeTranscripts(home);

    const cli = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
    const clean = (text: string) =>
      text
        .split(project)
        .join('~/code/my-app')
        .split(store)
        .join('~/.agent-reference')
        .split(home)
        .join('~');

    return commands.map((command) => {
      const { argv, note } = command;
      const printed = execFileSync(process.execPath, ['--experimental-strip-types', cli, ...argv], {
        cwd: project,
        encoding: 'utf8',
        env: {
          ...anonymous(),
          AGENT_REFERENCE_STORE_DIR: store,
          NO_COLOR: '1',
          // Only the command that reads a home directory gets one, and it gets
          // the invented one. USERPROFILE alongside HOME, since that is what
          // Node answers with on Windows and this runs there too.
          ...('home' in command && command.home ? { HOME: home, USERPROFILE: home } : {}),
        },
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

/**
 * The invented history, laid down oldest first. `audit` quotes the most recent
 * session that shows a finding, so the ones meant to be quoted are stamped
 * newest, in the order the report prints them.
 */
function writeTranscripts(home: string): void {
  const start = Date.UTC(2026, 0, 1) / 1000;

  for (const [directory, count] of Object.entries(QUIET)) {
    for (let index = 0; index < count; index += 1) {
      const file = join(home, directory, `session-${index}.jsonl`);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, call('Read', { file_path: '~/code/my-app/src/main.ts' }));
      utimesSync(file, start, start);
    }
  }

  let stamp = start + 3600;
  for (const entry of transcripts) {
    for (let copy = 0; copy < entry.copies; copy += 1) {
      const file = join(home, entry.directory, `${entry.name}-${copy}.jsonl`);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, entry.body);
      utimesSync(file, stamp, stamp);
      stamp += 60;
    }
  }
}
