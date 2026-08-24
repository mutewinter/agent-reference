/**
 * Points a real agent at the resolution loop and records what it did.
 *
 * The init eval asks whether a printed brief gets carried out. This one asks something
 * narrower and harder: when `get` cannot win on its own, is what it prints enough to iterate
 * on? Every dependency in the synthetic workspace fails differently, and the agent is given
 * no hint about any of them, so the only guidance it has is the tool's own output.
 *
 * Nothing here touches the network. Upstream is local git repositories and a stub registry on
 * loopback, wired in through the project's own `registry` config key.
 *
 * Usage: node evals/resolve/run.mjs [--model sonnet] [--prompt "..."]
 */
import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { buildWorld, EXPECTED, startRegistry } from './world.mjs';

const execFileAsync = promisify(execFile);
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

/**
 * One turn, and deliberately vague about the mechanism. Naming the failures, or the config
 * keys, would test whether the agent can follow instructions rather than whether the tool
 * gives any.
 */
const DEFAULT_TURNS = [
  'I want to be able to read the real upstream source of this project\'s dependencies. Use agent-reference to get every dependency in apps/studio checked out and readable, and tell me where each one landed. Some of them will not resolve on the first try; work through whatever it reports until each one is either correct or you can explain why it cannot be.'
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
  'CLAUDE_AGENT_SDK_VERSION'
];

const options = parseArgs(process.argv.slice(2));
const runDir = path.join(os.homedir(), '.agent-reference-evals', `resolve-${stamp()}`);

const { home, projectRoot, repos } = await buildWorld(runDir);
const registry = await startRegistry(repos);

// The store lives inside the run, so a run never touches the operator's real checkouts.
const storeDir = path.join(runDir, 'store');
await fs.writeFile(
  path.join(projectRoot, 'agent-reference.json'),
  `${JSON.stringify({ registry: registry.url, cacheDir: storeDir }, null, 2)}\n`
);

await execFileAsync('git', ['init', '-q', projectRoot]);
await execFileAsync('git', ['-C', projectRoot, 'add', '-A']);
await execFileAsync('git', ['-C', projectRoot, '-c', 'user.email=eval@example.com', '-c', 'user.name=Eval', 'commit', '-qm', 'studio: initial']);

const binDir = await writeShims(runDir, home);
await snapshot(projectRoot, path.join(runDir, 'before'));

console.log(`world:    ${runDir}`);
console.log(`project:  ${projectRoot}`);
console.log(`registry: ${registry.url}`);
console.log(`model:    ${options.model}\n`);

const started = Date.now();
let result;
try {
  result = await runAgent({ binDir, projectRoot, ...options });
} finally {
  registry.server.close();
}
const elapsed = Math.round((Date.now() - started) / 1000);

await fs.writeFile(path.join(runDir, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
await snapshot(projectRoot, path.join(runDir, 'after'));

const transcript = result?.session_id
  ? path.join(os.homedir(), '.claude', 'projects', projectRoot.replaceAll(/[^A-Za-z0-9]/g, '-'), `${result.session_id}.jsonl`)
  : null;
await fs.writeFile(
  path.join(runDir, 'run.json'),
  `${JSON.stringify({ runDir, home, projectRoot, storeDir, transcript, model: options.model, turns: options.turns }, null, 2)}\n`
);

console.log(`\ndone in ${elapsed}s, ${result?.num_turns ?? '?'} turns`);
if (typeof result?.total_cost_usd === 'number') console.log(`cost: $${result.total_cost_usd.toFixed(4)}`);
console.log(`transcript: ${transcript ?? 'unknown'}`);
console.log(`\ncases: ${EXPECTED.cases.map((entry) => entry.name).join(', ')}`);
console.log(`\nconfig it left behind:\n${await readIfPresent(projectRoot, 'agent-reference.json')}`);
console.log(`grade with: node evals/resolve/grade.mjs`);

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
  const args = [...resume, '--print', '--model', model, '--dangerously-skip-permissions', '--output-format', 'json', turn];

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

async function writeShims(runDir, home) {
  const binDir = path.join(runDir, 'bin');
  await fs.mkdir(binDir, { recursive: true });

  await fs.writeFile(
    path.join(binDir, 'agent-reference'),
    `#!/bin/sh\nHOME=${JSON.stringify(home)} exec node ${JSON.stringify(path.join(repoRoot, 'dist', 'cli.js'))} "$@"\n`,
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
  return new Date().toISOString().replaceAll(/[-:]/g, '').replace(/\.\d+Z$/, '');
}
