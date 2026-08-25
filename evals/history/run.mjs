/**
 * Asks whether an agent holding a materialized reference knows it can read that repository's
 * history, and reaches for it when the answer lives nowhere else.
 *
 * `get` hands back a git worktree, so `git log`, `show`, and `blame` all work at the printed
 * path with no further help from this tool. Whether an agent knows that is not something the
 * source can answer. The prompt names no mechanism: it asks for reasoning that the working
 * tree does not carry, and what the agent does next is the measurement.
 *
 * Nothing here touches the network. Upstream is a local git repository reached through a
 * relative `file:` spec, and the store lives inside the run.
 *
 * Usage: node evals/history/run.mjs [--model sonnet] [--prompt "..."]
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
 * One turn, naming no mechanism. "Their actual reasoning" is the whole ask: it is the one
 * thing the checkout cannot supply, and saying so is what a user reporting this bug would
 * say anyway. Mentioning git, history, or commits would test instruction-following instead.
 */
const DEFAULT_TURNS = [
  "Our collector speaks wire-format, and it has started rejecting our 200 KiB telemetry batches. wire-format is one of this project's references. Work out what wire-format used to do with payloads that big and why the maintainers stopped doing it, then tell me what that means for src/batch.js. I want their actual reasoning, not an inference from the current code.",
];
const TIMEOUT_MS = 15 * 60 * 1000;

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
  'CLAUDE_AGENT_SDK_VERSION',
];

const options = parseArgs(process.argv.slice(2));
const runDir = path.join(os.homedir(), '.agent-reference-evals', `history-${stamp()}`);

const { home, projectRoot, upstreamPath } = await buildWorld(runDir);

// The store lives inside the run, so a run never touches the operator's real checkouts.
const storeDir = path.join(runDir, 'store');
const configPath = path.join(projectRoot, 'agent-reference.json');
const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
await fs.writeFile(configPath, `${JSON.stringify({ ...config, cacheDir: storeDir }, null, 2)}\n`);

await execFileAsync('git', ['init', '-q', projectRoot]);
await execFileAsync('git', ['-C', projectRoot, 'add', '-A']);
await execFileAsync('git', [
  '-C',
  projectRoot,
  '-c',
  'user.email=eval@example.com',
  '-c',
  'user.name=Eval',
  'commit',
  '-qm',
  'gateway: initial',
]);

const binDir = await writeShims(runDir, home);
await snapshot(projectRoot, path.join(runDir, 'before'));

console.log(`world:    ${runDir}`);
console.log(`project:  ${projectRoot}`);
console.log(`upstream: ${upstreamPath}`);
console.log(`model:    ${options.model}\n`);

const started = Date.now();
const result = await runAgent({ binDir, projectRoot, ...options });
const elapsed = Math.round((Date.now() - started) / 1000);

await fs.writeFile(path.join(runDir, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
await snapshot(projectRoot, path.join(runDir, 'after'));

const transcript = result?.session_id
  ? path.join(
      os.homedir(),
      '.claude',
      'projects',
      projectRoot.replaceAll(/[^A-Za-z0-9]/g, '-'),
      `${result.session_id}.jsonl`,
    )
  : null;
await fs.writeFile(
  path.join(runDir, 'run.json'),
  `${JSON.stringify({ runDir, home, projectRoot, storeDir, upstreamPath, transcript, model: options.model, turns: options.turns }, null, 2)}\n`,
);

console.log(`\ndone in ${elapsed}s, ${result?.num_turns ?? '?'} turns`);
if (typeof result?.total_cost_usd === 'number')
  console.log(`cost: $${result.total_cost_usd.toFixed(4)}`);
console.log(`transcript: ${transcript ?? 'unknown'}`);
console.log(`\nonly history answers: ${Object.values(EXPECTED.onlyFromHistory).join('; ')}`);
console.log(`grade with: node evals/history/grade.mjs`);

async function runAgent({ binDir, projectRoot, model, turns }) {
  const env = { ...process.env, PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ''}` };
  for (const name of INHERITED_SESSION_VARS) delete env[name];

  let last = null;
  let resume = [];
  for (const [index, turn] of turns.entries()) {
    if (last?.session_id) resume = ['--resume', last.session_id];
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
    turn,
  ];

  return await new Promise((resolve, reject) => {
    const child = spawn('claude', args, {
      cwd: projectRoot,
      env,
      stdio: ['ignore', 'pipe', 'inherit'],
    });
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

async function writeShims(runDir, home) {
  const binDir = path.join(runDir, 'bin');
  await fs.mkdir(binDir, { recursive: true });

  await fs.writeFile(
    path.join(binDir, 'agent-reference'),
    `#!/bin/sh\nHOME=${JSON.stringify(home)} exec node ${JSON.stringify(path.join(repoRoot, 'dist', 'cli.js'))} "$@"\n`,
    { mode: 0o755 },
  );
  await fs.writeFile(
    path.join(binDir, 'npx'),
    [
      '#!/bin/sh',
      '# eval shim: resolve `npx <pkg>[@version] args...` to the command already on PATH',
      'while [ "$1" = "-y" ] || [ "$1" = "--yes" ]; do shift; done',
      'cmd=$(printf %s "$1" | sed "s/@[^@]*$//"); shift',
      'exec "$cmd" "$@"',
      '',
    ].join('\n'),
    { mode: 0o755 },
  );

  return binDir;
}

async function snapshot(projectRoot, destination) {
  await fs.rm(destination, { recursive: true, force: true });
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.cp(projectRoot, destination, {
    recursive: true,
    filter: (source) =>
      !source.includes(`${path.sep}.git${path.sep}`) && !source.endsWith(`${path.sep}.git`),
  });
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
  return new Date()
    .toISOString()
    .replaceAll(/[-:]/g, '')
    .replace(/\.\d+Z$/, '');
}
