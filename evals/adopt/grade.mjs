/**
 * Grades one `adopt` eval run. The question is not whether the agent produced working-looking
 * code, which it can do by remembering the 3.x API: it is whether the code matches the version
 * this project installs, and whether it got there by reading the repository. So the files the
 * agent left behind are graded alongside the transcript, and correct code with no checkout
 * behind it is recorded as a guess that landed rather than a win.
 *
 * Usage: node evals/adopt/grade.mjs [runDir]   (defaults to the newest run)
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { EXPECTED } from './world.mjs';

const EVAL_ROOT = path.join(os.homedir(), '.agent-reference-evals');

const runDir = process.argv[2] ?? (await newestRun());
const run = await readJson(path.join(runDir, 'run.json'));
const storeDir = run?.storeDir ?? path.join(runDir, 'store');
const upstreamPath = run?.upstreamPath ?? '';
const result = await readJson(path.join(runDir, 'result.json'));
const records = await readTranscript(run?.transcript);
const commands = records.flatMap(toolCommands);
const finalMessage = result?.result ?? '';

report('run', runDir);
report('model', Object.keys(result?.modelUsage ?? {}).join(', ') || (run?.model ?? 'unknown'));
report('turns', String(result?.num_turns ?? '?'));
report('cost', typeof result?.total_cost_usd === 'number' ? `$${result.total_cost_usd.toFixed(4)}` : 'unknown');

const checkouts = await readCheckouts(storeDir);
const touched = await changedSources(runDir);
const written = touched.map((file) => file.after).join('\n\n');

const inStore = (command) => command.includes(storeDir);
const readStore = commands.filter(inStore);
const readDocs = readStore.filter((command) => /docs|README|CHANGELOG|examples|migrat/i.test(command));
const readNodeModules = commands.filter((command) => /node_modules[/\\]acme-ui/.test(command));
const wentToNetwork = commands.filter((command) => /WebFetch|WebSearch|\bcurl\b|\bgh (repo|api)\b/.test(command));
const wentUpstream = commands.filter((command) => Boolean(upstreamPath) && command.includes(upstreamPath) && !inStore(command));

section('did it go to the source at all');
check(
  `${EXPECTED.package} is checked out in the run store`,
  checkouts.length > 0,
  checkouts.length > 0
    ? checkouts.map((checkout) => `${checkout.manifest?.name ?? checkout.repo}@${checkout.manifest?.version ?? '?'}`).join(', ')
    : 'nothing in the store: the agent never ran get, so the task was answered from memory or from the bundle'
);
check(
  'checked out the version this project installs',
  checkouts.some((checkout) => checkout.manifest?.version === EXPECTED.version),
  `${EXPECTED.package}@${EXPECTED.version}, from the lockfile`
);

section('did it read the repository rather than the bundle');
check(
  'read the checkout',
  readStore.length > 0,
  readStore.length > 0 ? `${readStore.length} tool call(s) against the store` : 'the path was printed and never opened'
);
check(
  'read the prose, not just the source',
  readDocs.length > 0,
  readDocs.length > 0
    ? `${readDocs.length} call(s) touching docs, README, examples or the changelog`
    : `${Object.values(EXPECTED.onlyFromRepository).length} facts this task needs live in docs/ and nowhere else`
);
report('read node_modules/acme-ui', readNodeModules.length > 0 ? `yes, ${readNodeModules.length} call(s)` : 'no');
report('reached for the network', wentToNetwork.length > 0 ? `yes, ${wentToNetwork.length} call(s)` : 'no');
report('ran agent-reference guide', commands.some((command) => /agent-reference\S*\s+guide/.test(command)) ? 'yes' : 'no');
report(
  'went to the upstream repository directly',
  wentUpstream.length > 0 ? 'yes: a shortcut this fixture allows and a real reference does not' : 'no'
);

section('is the code the version this project installs');
report('files changed', touched.map((file) => file.relative).join(', ') || 'none');
check(
  'used the 4.x primitives',
  /ComboboxRoot/.test(written) && /ComboboxInput/.test(written) && /ComboboxList/.test(written) && /ComboboxOption/.test(written),
  EXPECTED.onlyFromRepository.primitives
);
check('wrapped it in a UIProvider', /UIProvider/.test(written), EXPECTED.onlyFromRepository.provider);
check('passed the required filter', /filter\s*=\s*\{/.test(written), EXPECTED.onlyFromRepository.filter);
check(
  'did not reach for the compatibility export',
  !/<Combobox[\s/>]/.test(written),
  `${EXPECTED.wrongFromMemory} is what memory says, and the bundle's export list agrees with it`
);

section('did the answer carry what only the repository holds');
check(
  'said the flat Combobox is a 3.x compatibility export',
  /combobox/i.test(finalMessage) && /(compat|shim|legacy|deprecat|3\.x|v3)/i.test(finalMessage),
  EXPECTED.onlyFromRepository.shim
);
check(
  'said filter has no default',
  /filter/i.test(finalMessage) && /(required|no default|must)/i.test(finalMessage),
  'a root without filter renders every option no matter what is typed'
);

section('honesty');
check(
  'did not describe an API it never read',
  checkouts.length > 0 || !/ComboboxRoot/.test(finalMessage),
  'the 4.x shape stated with no checkout behind it is a guess that happened to land, not a win'
);

section('commands the agent ran');
for (const command of commands) console.log(`  ${command.replaceAll(/\s+/g, ' ').slice(0, 160)}`);

section('final message');
console.log(indent(finalMessage || '(none)'));

/** Every source file whose contents the run changed, which is the record of what was built. */
async function changedSources(runDir) {
  const before = path.join(runDir, 'before');
  const after = path.join(runDir, 'after');
  const files = await walkSources(after);
  const changed = [];

  for (const file of files) {
    const relative = path.relative(after, file);
    const now = await read(file);
    const then = await read(path.join(before, relative));
    if (now !== null && now !== then) changed.push({ relative, after: now });
  }

  return changed;
}

async function walkSources(root) {
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  const found = [];
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      found.push(...(await walkSources(full)));
    } else if (/\.(tsx?|jsx?)$/.test(entry.name)) {
      found.push(full);
    }
  }
  return found;
}

/** Every worktree in the run's store, which is the only record of what was really fetched. */
async function readCheckouts(storeDir) {
  const src = path.join(storeDir, 'src');
  const found = [];
  await walk(src, 0);
  return found;

  async function walk(dir, depth) {
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const full = path.join(dir, entry.name);
      if (await exists(path.join(full, '.git'))) {
        found.push({ path: full, repo: path.relative(src, full), manifest: await readJson(path.join(full, 'package.json')) });
        continue;
      }
      if (depth < 6) await walk(full, depth + 1);
    }
  }
}

function toolCommands(record) {
  const content = record?.message?.content;
  if (!Array.isArray(content)) return [];
  return content
    .filter((block) => block.type === 'tool_use')
    .map((block) => block.input?.command ?? `${block.name} ${JSON.stringify(block.input ?? {}).slice(0, 200)}`);
}

async function readTranscript(file) {
  if (!file) return [];
  const contents = await read(file);
  if (!contents) return [];
  return contents
    .split('\n')
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
}

async function newestRun() {
  const entries = await fs.readdir(EVAL_ROOT).catch(() => []);
  const runs = entries.filter((entry) => entry.startsWith('adopt-')).toSorted();
  if (runs.length === 0) throw new Error(`No runs under ${EVAL_ROOT}. Run evals/adopt/run.mjs first.`);
  return path.join(EVAL_ROOT, runs.at(-1));
}

async function read(file) {
  return await fs.readFile(file, 'utf8').catch(() => null);
}

async function readJson(file) {
  const contents = await read(file);
  try {
    return contents ? JSON.parse(contents) : null;
  } catch {
    return null;
  }
}

async function exists(target) {
  return await fs
    .stat(target)
    .then(() => true)
    .catch(() => false);
}

function report(label, value) {
  console.log(`  ${label.padEnd(30)} ${value}`);
}

function section(title) {
  console.log(`\n${title}`);
}

function check(label, passed, detail) {
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${label}${detail ? `\n          ${detail}` : ''}`);
}

function indent(value) {
  return value
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n');
}
