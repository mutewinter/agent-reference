/**
 * Grades one `init` eval run by reading the agent's transcript and the project it left
 * behind. Reports what the brief asked for against what actually happened, and prints the
 * commands the agent ran, which is where the mining step either works or does not.
 *
 * Usage: node evals/init/grade.mjs [runDir]   (defaults to the newest run)
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { EXPECTED } from './world.mjs';

const EVAL_ROOT = path.join(os.homedir(), '.agent-reference-evals');

const runDir = process.argv[2] ?? (await newestRun());
const run = await readJson(path.join(runDir, 'run.json'));
const home = run?.home ?? path.join(runDir, 'home');
const projectRoot = run?.projectRoot ?? path.join(home, 'code', 'acme', 'storefront');
const result = await readJson(path.join(runDir, 'result.json'));
const records = await readTranscript(run?.transcript);

const shared = await read(path.join(projectRoot, 'agent-reference.json'));
const local = await read(path.join(projectRoot, 'agent-reference.local.json'));
const configText = `${shared ?? ''}\n${local ?? ''}`;
const commands = records.flatMap(toolCommands);
const transcriptGrep = commands.filter((command) => /\.claude\/projects|\.jsonl/.test(command));

report('run', runDir);
report('model', Object.keys(result?.modelUsage ?? {}).join(', ') || (run?.model ?? 'unknown'));
report('turns', String(result?.num_turns ?? '?'));
report('cost', typeof result?.total_cost_usd === 'number' ? `$${result.total_cost_usd.toFixed(4)}` : 'unknown');

section('did the brief get carried out');
check('wrote agent-reference.local.json', local !== null);
check('left agent-reference.json alone', shared === null, 'anything shared should have been asked about first');
check('added the gitignore line', ((await read(path.join(projectRoot, '.gitignore'))) ?? '').includes('agent-reference.local.json'));
check('ran validate', commands.some((command) => /agent-reference\S*\s+validate/.test(command)));
check('ran status', commands.some((command) => /agent-reference\S*\s+status/.test(command)));
check(
  'quoted status output in the reply',
  /agent-reference\.local\.json \(this machine\)|nothing fetched until needed/.test(result?.result ?? ''),
  'a tool result is not something the user sees'
);
// Either location satisfies the brief; which one is the user's answer, not a grade.
const skillPaths = [
  path.join(home, '.claude', 'skills', 'agent-reference'),
  path.join(projectRoot, '.agents', 'skills', 'agent-reference')
];
const skillAt = [];
for (const candidate of skillPaths) if (await exists(candidate)) skillAt.push(candidate);
check(`installed the skill${skillAt.length > 0 ? ` (${skillAt.join(', ')})` : ''}`, skillAt.length > 0);
check(
  'added one sentence to AGENTS.md',
  ((await read(path.join(projectRoot, 'AGENTS.md'))) ?? '').includes('agent-reference')
);

section('ranking: expected to surface');
for (const entry of EXPECTED.strong) {
  check(`${entry.name} (${entry.sessions} sessions, ${entry.kind})`, configText.includes(entry.name));
}

section('ranking: expected to skip');
for (const entry of EXPECTED.noise) {
  check(`${entry.name} absent`, !configText.includes(entry.name), entry.why);
}

section('mining method');
report('total tool calls', String(commands.length));
report('transcript commands', String(transcriptGrep.length));
report('chars pulled from tools', String(toolResultChars(records)));
check('mined the transcript store at all', transcriptGrep.length > 0);
// Ranking in a shell or an inline script both count: what matters is that the counting
// happened outside the context window, not which tool did it.
check(
  'counted outside the context window',
  transcriptGrep.some((command) => /rg |grep |sort |uniq |awk |jq |python3|node /.test(command)),
  'no command that could rank without reading the sessions in'
);
check('kept tool output under 100k chars', toolResultChars(records) < 100_000);

section('commands the agent ran');
for (const command of commands) console.log(`  ${command.replace(/\s+/g, ' ').slice(0, 160)}`);

section('config it wrote');
console.log(local ?? '  (none)');

section('final message');
console.log(indent(result?.result ?? '(none)'));

function toolResultChars(records) {
  return records
    .flatMap((record) => (Array.isArray(record?.message?.content) ? record.message.content : []))
    .filter((block) => block.type === 'tool_result')
    .reduce((total, block) => total + (typeof block.content === 'string' ? block.content : JSON.stringify(block.content ?? '')).length, 0);
}

function toolCommands(record) {
  const content = record?.message?.content;
  if (!Array.isArray(content)) return [];
  return content
    .filter((block) => block.type === 'tool_use')
    .map((block) => block.input?.command ?? `${block.name} ${JSON.stringify(block.input ?? {}).slice(0, 120)}`);
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
  const runs = entries.filter((entry) => entry.startsWith('init-')).sort();
  if (runs.length === 0) throw new Error(`No runs under ${EVAL_ROOT}. Run evals/init/run.mjs first.`);
  return path.join(EVAL_ROOT, runs.at(-1));
}

async function read(file) {
  return await fs.readFile(file, 'utf8').catch(() => null);
}

async function readJson(file) {
  const contents = await read(file);
  return contents ? JSON.parse(contents) : null;
}

async function exists(target) {
  return await fs
    .stat(target)
    .then(() => true)
    .catch(() => false);
}

function section(title) {
  console.log(`\n${title}`);
}

function report(label, value) {
  console.log(`  ${label.padEnd(22)} ${value}`);
}

function check(label, passed, note) {
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${label}${passed || !note ? '' : `  (${note})`}`);
}

function indent(text) {
  return text
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n');
}
