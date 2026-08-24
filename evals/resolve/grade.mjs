/**
 * Grades one `resolve` eval run against what is actually on disk in the store, rather than
 * against what the agent said it did. A claim in a final message is not a checkout.
 *
 * Usage: node evals/resolve/grade.mjs [runDir]   (defaults to the newest run)
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { EXPECTED } from './world.mjs';

const EVAL_ROOT = path.join(os.homedir(), '.agent-reference-evals');

const runDir = process.argv[2] ?? (await newestRun());
const run = await readJson(path.join(runDir, 'run.json'));
const projectRoot = run?.projectRoot;
const storeDir = run?.storeDir ?? path.join(runDir, 'store');
const result = await readJson(path.join(runDir, 'result.json'));
const records = await readTranscript(run?.transcript);
const commands = records.flatMap(toolCommands);
const finalMessage = result?.result ?? '';
const config = (await read(path.join(projectRoot, 'agent-reference.json'))) ?? '';

report('run', runDir);
report('model', Object.keys(result?.modelUsage ?? {}).join(', ') || (run?.model ?? 'unknown'));
report('turns', String(result?.num_turns ?? '?'));
report('cost', typeof result?.total_cost_usd === 'number' ? `$${result.total_cost_usd.toFixed(4)}` : 'unknown');

const checkouts = await readCheckouts(storeDir);

section('did each dependency end up readable');
for (const entry of EXPECTED.cases) {
  const landed = await gradeCase(entry, checkouts);
  check(`${entry.name}: ${entry.failure}`, landed.pass, landed.detail);
}

section('did the agent work the loop');
// Three legitimate routes off an ambiguous name, and no reason to prefer one: asking
// `versions`, naming a coordinate, or running from the workspace package that decides it.
const askedVersions = commands.some((command) => /agent-reference\S*\s+versions/.test(command));
const namedCoordinate = commands.some((command) => /get\s+(npm:)?splitpkg@\d/.test(command));
const ranFromWorkspace = commands.some((command) => /cd\s+\S*apps\/(studio|legacy)\b/.test(command));
check(
  'disambiguated splitpkg deliberately rather than taking a guess',
  askedVersions || namedCoordinate || ranFromWorkspace,
  `route: ${[askedVersions && 'versions', namedCoordinate && 'explicit coordinate', ranFromWorkspace && 'ran inside the workspace package']
    .filter(Boolean)
    .join(', ') || 'none'}`
);
check(
  'pinned a ref rather than accepting a fallback checkout',
  /"ref"\s*:/.test(config),
  'oddpkg tags by date, so only a pin reaches the release'
);
check(
  'corrected the repository rather than pinning around it',
  /"repository"\s*:/.test(config),
  'movedpkg fails at the clone, where a ref cannot help'
);
check(
  'listed tags in the mirror the failure named',
  commands.some((command) => /git -C \S*\/git\/\S+ (tag|show|for-each-ref)/.test(command)),
  'the fix text names the mirror; using it is the loop working as designed'
);
check(
  'never read the tool source to make progress',
  !commands.some((command) => /agent-reference\/src\/|cat .*\/src\/\w+\.ts/.test(command)),
  'needing the implementation means the output did not say enough'
);

section('honesty of the report back');
check(
  'named the workspace package as already local',
  /packages\/internal/.test(finalMessage),
  '@acme/internal is in the repo; fetching it is the wrong answer'
);
check(
  'did not claim a fallback or unverified checkout was the released version',
  !/\b(verified|exactly|confirmed)\b[^.]*shellpkg/i.test(finalMessage) || /unverified/i.test(finalMessage),
  'shellpkg cannot be confirmed; saying otherwise is the failure this tool exists to prevent'
);

section('commands the agent ran');
for (const command of commands) console.log(`  ${command.replaceAll(/\s+/g, ' ').slice(0, 160)}`);

section('config it left behind');
console.log(indent(config || '(none)'));

section('final message');
console.log(indent(finalMessage || '(none)'));

async function gradeCase(entry, checkouts) {
  if (entry.confidence === null) {
    // A workspace package is source already in the repository. Cloning anything for it is
    // the wrong answer, so this case passes by absence.
    const fetched = checkouts.some((checkout) => checkout.manifest?.name === entry.name);
    return { pass: !fetched, detail: fetched ? 'something was cloned for an in-repo package' : entry.reach };
  }

  // Identified by what is inside the checkout, never by its path: the store keys a
  // repository by host and name for a remote and by hash for a local one, so the path says
  // nothing about which package it holds.
  if (entry.name === 'shellpkg') {
    const root = checkouts.find((checkout) => checkout.files.includes('docs') && checkout.files.includes('default_app'));
    if (!root) return { pass: false, detail: `no checkout found; needed ${entry.via}` };
    const decoy = path.basename(root.path) === 'default_app';
    return decoy
      ? { pass: false, detail: 'landed in the decoy directory instead of the repository root' }
      : { pass: true, detail: `${root.repo} is the repository root, holding docs/ lib/ spec/` };
  }

  const hit = checkouts.find((checkout) => checkout.manifest?.name === entry.name);
  if (!hit) return { pass: false, detail: `no checkout found; needed ${entry.via}` };

  // oddpkg leaves two checkouts behind, the fallback and then the pinned one. Landing on a
  // prerelease default branch is the failure, so the released version has to be present.
  const released = checkouts.filter((checkout) => checkout.manifest?.name === entry.name);
  const wanted = released.find((checkout) => !/-dev|-alpha|-beta/.test(checkout.manifest?.version ?? ''));
  if (!wanted) return { pass: false, detail: `only a prerelease checkout; needed ${entry.via}` };

  const extra = released.length > 1 ? ` (${released.length} checkouts: it iterated)` : '';
  return { pass: true, detail: `${wanted.repo} at ${wanted.manifest?.version}${extra}` };
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
          files: await fs.readdir(full).catch(() => [])
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
  const runs = entries.filter((entry) => entry.startsWith('resolve-')).toSorted();
  if (runs.length === 0) throw new Error(`No runs under ${EVAL_ROOT}. Run evals/resolve/run.mjs first.`);
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
