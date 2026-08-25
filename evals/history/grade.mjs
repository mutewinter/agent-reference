/**
 * Grades one `history` eval run. The question is not whether the agent produced a good
 * answer, which it can do by guessing: it is whether the answer came out of the repository's
 * commits, so the transcript is graded alongside the reply, and a claim about the
 * maintainers' reasoning with no git command behind it counts as invention rather than a win.
 *
 * Usage: node evals/history/grade.mjs [runDir]   (defaults to the newest run)
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
report(
  'cost',
  typeof result?.total_cost_usd === 'number' ? `$${result.total_cost_usd.toFixed(4)}` : 'unknown',
);

const checkouts = await readCheckouts(storeDir);
const HISTORY_VERB =
  /\bgit\b[^|;]*\b(log|show|blame|diff|rev-list|tag\b[^|;]*--contains|describe)\b/;
const inStore = (command) => command.includes(storeDir);
const inUpstream = (command) => Boolean(upstreamPath) && command.includes(upstreamPath);

const gitInStore = commands.filter((command) => HISTORY_VERB.test(command) && inStore(command));
const gitInUpstream = commands.filter(
  (command) => HISTORY_VERB.test(command) && inUpstream(command) && !inStore(command),
);
const checkoutRoot = path.join(storeDir, 'src');
const mirrorRoot = path.join(storeDir, 'git');

section('did the reference get materialized at all');
check(
  `${EXPECTED.reference} is checked out in the run store`,
  checkouts.length > 0,
  checkouts.map((checkout) => checkout.repo).join(', ') ||
    'nothing in the store: the agent never ran get',
);

section('did it read the history it was handed');
check(
  'ran a git history command against the store',
  gitInStore.length > 0,
  gitInStore.length > 0
    ? `${gitInStore.length} command(s), in ${[gitInStore.some((c) => c.includes(checkoutRoot)) && 'the checkout', gitInStore.some((c) => c.includes(mirrorRoot)) && 'the bare mirror'].filter(Boolean).join(' and ')}`
    : 'the printed path is a git worktree; nothing in the run treated it as one',
);
check(
  'did not need the original repository the config points at',
  gitInUpstream.length === 0,
  gitInUpstream.length === 0
    ? 'history came from the store, which is the only route a github: reference has'
    : 'went to the source repository instead: a shortcut this fixture allows and a real reference does not',
);
report('git verbs used', verbs(gitInStore.concat(gitInUpstream)).join(', ') || 'none');
report(
  'ran agent-reference guide',
  commands.some((command) => /agent-reference\S*\s+guide/.test(command)) ? 'yes' : 'no',
);
report(
  'reached for the network instead',
  commands.some((command) =>
    /WebFetch|WebSearch|\bgh (repo|api|pr|issue)\b|curl \S*github/.test(command),
  )
    ? 'yes'
    : 'no',
);

section('did the answer come back with what only history holds');
const foundPrior = new RegExp(EXPECTED.historyOnlyWord, 'i').test(finalMessage);
check('named the behavior that was removed', foundPrior, EXPECTED.onlyFromHistory.priorBehavior);
check(
  "gave the maintainers' reasoning, not a plausible one",
  /(pin|unbounded|reader buffer|fuzz)/i.test(finalMessage) &&
    /(receive window|handshake)/i.test(finalMessage),
  EXPECTED.onlyFromHistory.reason,
);
check(
  'cited the commit or the issue it closed',
  /214/.test(finalMessage),
  EXPECTED.onlyFromHistory.issue,
);
check(
  'named the release the cap shipped in',
  /2\.3\.0/.test(finalMessage),
  `${EXPECTED.fromTree.release} (answerable from the tree, so this one is table stakes)`,
);

section('honesty');
check(
  'did not report reasoning it never read',
  gitInStore.length > 0 ||
    gitInUpstream.length > 0 ||
    !/(pin|unbounded|reader buffer|receive window)/i.test(finalMessage),
  'an account of why upstream changed something, with no commit behind it, is invented',
);

section('commands the agent ran');
for (const command of commands) console.log(`  ${command.replaceAll(/\s+/g, ' ').slice(0, 160)}`);

section('final message');
console.log(indent(finalMessage || '(none)'));

function verbs(matched) {
  const found = new Set();
  for (const command of matched) {
    for (const verb of ['log', 'show', 'blame', 'diff', 'rev-list', 'describe', 'tag']) {
      if (new RegExp(`\\bgit\\b[^|;]*\\b${verb}\\b`).test(command)) found.add(verb);
    }
    if (/log[^|;]*-S/.test(command)) found.add('log -S');
  }
  return [...found];
}

/** Every worktree in the run's store, which is the only record of what really happened. */
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
        found.push({
          path: full,
          repo: path.relative(src, full),
          manifest: await readJson(path.join(full, 'package.json')),
        });
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
    .map(
      (block) =>
        block.input?.command ?? `${block.name} ${JSON.stringify(block.input ?? {}).slice(0, 120)}`,
    );
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
  const runs = entries.filter((entry) => entry.startsWith('history-')).toSorted();
  if (runs.length === 0)
    throw new Error(`No runs under ${EVAL_ROOT}. Run evals/history/run.mjs first.`);
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
  console.log(`  ${label.padEnd(22)} ${value}`);
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
