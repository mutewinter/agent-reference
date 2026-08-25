/**
 * Asks whether an agent asked to build with a library goes and reads that library, or writes
 * what it remembers.
 *
 * This is the ordinary case, not archaeology: a dependency is already installed, the task is
 * to use one of its components, and every route is open. Memory has an answer. `node_modules`
 * has a minified bundle whose export list agrees with memory. The repository has the docs,
 * and only the repository knows that the export memory reaches for is a compatibility shim.
 * The prompt names no mechanism: not agent-reference, not docs, not versions.
 *
 * Nothing here touches the network. Upstream is a local git repository, the registry is a stub
 * on loopback, and the store lives inside the run.
 *
 * Usage: node evals/adopt/run.mjs [--model sonnet] [--prompt "..."]
 */
import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { buildWorld, startRegistry, EXPECTED } from './world.mjs';

const execFileAsync = promisify(execFile);
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

/**
 * One turn, in the words of someone who wants a field fixed. Naming the docs, the version, or
 * the tool would test instruction-following; the last clause is the only opening for what the
 * repository knows and the bundle does not, and a user asking it is not unusual.
 */
const DEFAULT_TURNS = [
  "The country field in src/ShippingForm.tsx is a plain select and there are far too many countries to scroll through. Swap it for acme-ui's searchable combobox, matching the way the rest of the form is built. Tell me what you changed, and anything I should know about the API you used.",
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
const runDir = path.join(os.homedir(), '.agent-reference-evals', `adopt-${stamp()}`);

const { home, projectRoot, upstreamPath } = await buildWorld(runDir);
const registry = await startRegistry(upstreamPath);

// Registry and store are machine-specific, so they live in the gitignored file, which leaves
// nothing committed in this project naming acme-ui as something to go read.
const storeDir = path.join(runDir, 'store');
await fs.writeFile(
  path.join(projectRoot, 'agent-reference.local.json'),
  `${JSON.stringify({ registry: registry.url, cacheDir: storeDir }, null, 2)}\n`,
);

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
  'checkout: initial',
]);

const binDir = await writeShims(runDir, home);
await snapshot(projectRoot, path.join(runDir, 'before'));

console.log(`world:    ${runDir}`);
console.log(`project:  ${projectRoot}`);
console.log(`upstream: ${upstreamPath}`);
console.log(`registry: ${registry.url}`);
console.log(`model:    ${options.model}\n`);

const started = Date.now();
let result = null;
try {
  result = await runAgent({ binDir, projectRoot, ...options });
} finally {
  await registry.close();
}
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
console.log(
  `\nonly the repository answers: ${Object.values(EXPECTED.onlyFromRepository).join('; ')}`,
);
console.log(`grade with: node evals/adopt/grade.mjs`);

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
      resolve(parseResult(output, code));
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
      !source.includes(`${path.sep}.git${path.sep}`) &&
      !source.endsWith(`${path.sep}.git`) &&
      !source.includes(`${path.sep}node_modules`),
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

/**
 * `claude --print --output-format json` writes one JSON object, but anything else on the
 * operator's machine that logs to stdout lands ahead of it. One MCP server's warning line
 * was enough to throw `JSON.parse`, and the catch that replaced it stored the raw text: no
 * error, no warning, `session_id` undefined, `transcript: null`, and every transcript-derived
 * check failing for free. That scores a good run badly and reads as a regression in the tool,
 * so the parse starts at the first brace and walks forward until one object parses.
 */
function parseResult(output, code) {
  for (let at = output.indexOf('{'); at !== -1; at = output.indexOf('{', at + 1)) {
    try {
      return JSON.parse(output.slice(at));
    } catch {
      // Not the start of the object; the next brace might be.
    }
  }
  return { raw: output, exitCode: code };
}
