/**
 * Runs the `init` brief against a real agent in the synthetic world.
 *
 * The agent keeps the operator's real HOME, because Claude Code authenticates from it. The
 * fake home is scoped to the `agent-reference` shim instead, so `init` surveys the synthetic
 * world and names its transcript store, its checkouts, and its skill directory by absolute
 * path. Everything the agent is pointed at therefore resolves without a HOME of its own, and
 * the operator's own session history is never what the brief hands it.
 *
 * Usage: node evals/init/run.mjs [--model sonnet] [--prompt "..."]
 */
import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { buildWorld, EXPECTED } from './world.mjs';

const execFileAsync = promisify(execFile);
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

/**
 * The brief stops at two gates that are the user's call, so a single-shot run can only ever
 * reach them and stall. These are the turns a user actually takes: the setup line, then the
 * answers. Anything past turn one resumes the same session.
 */
const DEFAULT_TURNS = [
  'Set this project up for agent-reference: run `npx agent-reference@latest init` and follow the brief it prints.',
  'Machine-wide for the skill, and yes, go ahead and mine my sessions. Carry on through the rest of the brief.'
];
const TIMEOUT_MS = 15 * 60 * 1000;

/** Session variables that would otherwise tie the child to the session that launched it. */
const INHERITED_SESSION_VARS = [
  'CLAUDECODE',
  'CLAUDE_CODE_ENTRYPOINT',
  'CLAUDE_CODE_SESSION_ID',
  'CLAUDE_CODE_HOST_SESSION_ID',
  'CLAUDE_CODE_CHILD_SESSION',
  'CLAUDE_CODE_MESSAGING_SOCKET',
  'CLAUDE_CODE_MESSAGING_TOKEN',
  'CLAUDE_CODE_EXECPATH',
  'CLAUDE_PID',
  'CLAUDE_EFFORT',
  'CLAUDE_AGENT_SDK_VERSION'
];

const options = parseArgs(process.argv.slice(2));
// Runs live outside the checkout: the fake home has to carry the operator's Claude account
// record for the agent to authenticate, and that never belongs in the repository tree.
const runDir = path.join(os.homedir(), '.agent-reference-evals', `init-${stamp()}`);

const { home, projectRoot } = await buildWorld(runDir);
await execFileAsync('git', ['init', '-q', projectRoot]);
await execFileAsync('git', ['-C', projectRoot, 'add', '-A']);
await execFileAsync('git', ['-C', projectRoot, '-c', 'user.email=eval@example.com', '-c', 'user.name=Eval', 'commit', '-qm', 'storefront: initial']);

const binDir = await writeShims(runDir, home);
await snapshot(projectRoot, path.join(runDir, 'before'));

console.log(`world:   ${runDir}`);
console.log(`project: ${projectRoot}`);
for (const [index, turn] of options.turns.entries()) console.log(`turn ${index + 1}:  ${turn}`);
console.log(`model:   ${options.model}\n`);

const started = Date.now();
const result = await runAgent({ binDir, projectRoot, ...options });
const elapsed = Math.round((Date.now() - started) / 1000);

await fs.writeFile(path.join(runDir, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
await snapshot(projectRoot, path.join(runDir, 'after'));

// The agent ran under the operator's HOME, so its own transcript landed there.
const transcript = result.session_id
  ? path.join(os.homedir(), '.claude', 'projects', projectRoot.replaceAll(/[^A-Za-z0-9]/g, '-'), `${result.session_id}.jsonl`)
  : null;
await fs.writeFile(
  path.join(runDir, 'run.json'),
  `${JSON.stringify({ runDir, home, projectRoot, transcript, model: options.model, turns: options.turns }, null, 2)}\n`
);

console.log(`\ndone in ${elapsed}s, ${result.num_turns ?? '?'} turns`);
if (typeof result.total_cost_usd === 'number') console.log(`cost: $${result.total_cost_usd.toFixed(4)}`);
console.log(`transcript: ${transcript ?? 'unknown'}`);
console.log(`\nexpected to surface: ${EXPECTED.strong.map((entry) => entry.name).join(', ')}`);
console.log(`expected to skip:    ${EXPECTED.noise.map((entry) => entry.name).join(', ')}`);
console.log(`\nconfig written:\n${await readIfPresent(projectRoot, 'agent-reference.local.json')}`);
console.log(`shared config:\n${await readIfPresent(projectRoot, 'agent-reference.json')}`);

async function runAgent({ binDir, projectRoot, model, turns }) {
  const env = { ...process.env, PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ''}` };
  for (const name of INHERITED_SESSION_VARS) delete env[name];

  let last = null;
  for (const [index, turn] of turns.entries()) {
    const resume = index > 0 && last?.session_id ? ['--resume', last.session_id] : [];
    process.stdout.write(`\n--- turn ${index + 1} ---\n`);
    last = await oneTurn({ env, projectRoot, model, turn, resume });
    if (last?.is_error) break;
  }

  return last;
}

async function oneTurn({ env, projectRoot, model, turn, resume }) {
  const args = [
    ...resume,
    '--print',
    '--model',
    model,
    '--dangerously-skip-permissions',
    '--output-format',
    'json',
    turn
  ];

  return await new Promise((resolve, reject) => {
    const child = spawn('claude', args, { cwd: projectRoot, env, stdio: ['ignore', 'pipe', 'inherit'] });
    const chunks = [];
    const timer = setTimeout(() => child.kill('SIGKILL'), TIMEOUT_MS);

    child.stdout.on('data', (chunk) => chunks.push(chunk));
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      const output = Buffer.concat(chunks).toString('utf8');
      if (code !== 0 && !output.trim()) {
        reject(new Error(`claude exited ${code} with no output`));
        return;
      }
      try {
        resolve(JSON.parse(output));
      } catch {
        resolve({ raw: output, exitCode: code });
      }
    });
  });
}

/**
 * `agent-reference` runs this checkout's build against the synthetic home, and `npx` is
 * reduced to "drop the flags and the version suffix, then run it", so the documented
 * one-liner works offline.
 */
async function writeShims(runDir, home) {
  const binDir = path.join(runDir, 'bin');
  await fs.mkdir(binDir, { recursive: true });

  await fs.writeFile(
    path.join(binDir, 'agent-reference'),
    `#!/bin/sh\nHOME=${JSON.stringify(home)} exec node ${JSON.stringify(path.join(repoRoot, 'dist', 'cli.js'))} "$@"\n`,
    { mode: 0o755 }
  );
  // The brief now leads with the skills installer, which is not on this machine and would
  // reach the network if it were. This lands the checkout's skill where the real installer
  // would put it, inside the synthetic home, so step one stays offline and testable.
  await fs.writeFile(
    path.join(binDir, 'skills'),
    [
      '#!/bin/sh',
      'if [ "$1" != "add" ]; then',
      '  echo "eval skills shim: only \'add\' is supported" >&2',
      '  exit 1',
      'fi',
      `dest=${JSON.stringify(path.join(home, '.claude', 'skills', 'agent-reference'))}`,
      'mkdir -p "$dest"',
      `cp -R ${JSON.stringify(path.join(repoRoot, 'skills', 'agent-reference') + '/.')} "$dest/"`,
      'echo "added agent-reference to $dest"',
      ''
    ].join('\n'),
    { mode: 0o755 }
  );

  await fs.writeFile(
    path.join(binDir, 'npx'),
    [
      '#!/bin/sh',
      '# eval shim: resolve `npx <pkg>[@version] args...` to the command already on PATH',
      'while [ "$1" = "-y" ] || [ "$1" = "--yes" ]; do shift; done',
      'cmd=$(printf %s "$1" | sed "s/@[^@]*$//"); shift',
      'exec "$cmd" "$@"',
      ''
    ].join('\n'),
    { mode: 0o755 }
  );

  return binDir;
}

/** A copy of the project before and after, so the diff of the run is inspectable later. */
async function snapshot(projectRoot, destination) {
  await fs.rm(destination, { recursive: true, force: true });
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.cp(projectRoot, destination, {
    recursive: true,
    filter: (source) => !source.includes(`${path.sep}.git${path.sep}`) && !source.endsWith(`${path.sep}.git`)
  });
}

async function readIfPresent(projectRoot, file) {
  return await fs.readFile(path.join(projectRoot, file), 'utf8').catch(() => '  (absent)');
}

function parseArgs(argv) {
  const options = { model: 'sonnet', turns: [] };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--model') options.model = argv[(index += 1)];
    else if (argv[index] === '--prompt') options.turns.push(argv[(index += 1)]);
  }
  if (options.turns.length === 0) options.turns = DEFAULT_TURNS;
  return options;
}

function stamp() {
  return new Date().toISOString().replaceAll(/[-:]/g, '').replace(/\..*/, '');
}
