#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import {
  activityProject,
  getActivityReport,
  recordActivity,
  recordingDisabled,
  type ActivityReference,
} from './activity.ts';
import { formatActivityLog, formatActivityReport } from './activity-format.ts';
import { getAuditReport } from './audit.ts';
import { auditProgress, formatAuditReport } from './audit-format.ts';
import { parseArgv, type CliOptions } from './args.ts';
import {
  formatCloneResult,
  formatGetPaths,
  formatGetProblems,
  formatGetResults,
  formatStoreReport,
  formatValidationReport,
} from './cli-format.ts';
import { cloneReferences } from './core.ts';
import { getReferences } from './get.ts';
import { briefSteps, formatInitBrief } from './init-format.ts';
import { surveyProject } from './init.ts';
import {
  parsePackageCoordinate,
  SUPPORTED_ECOSYSTEM,
  unsupportedEcosystemMessage,
} from './package-utils.ts';
import { resolveProjectStoreDir } from './reference-context.ts';
import { formatStatusReport } from './status-format.ts';
import { getStatusReport } from './status.ts';
import { formatVersionsReport, getVersionsReport } from './versions.ts';
import { inspectStore } from './store.ts';
import { validateConfig } from './validate.ts';

/**
 * What a run did, collected as it does it. The commands that materialize something fill it
 * in, so the log says what a run was for rather than only that it happened, and so a run
 * that answered while warning about the answer is not recorded as a clean one.
 */
interface RunRecord {
  references: ActivityReference[];
  warnings: string[];
}

async function main(argv: string[]): Promise<void> {
  const started = Date.now();
  const performed: RunRecord = { references: [], warnings: [] };
  let options: CliOptions | null = null;

  try {
    options = parseArgv(argv);
    await run(options, performed);
    await record(argv, options, performed, started);
  } catch (error) {
    // A run that failed is the one worth having a record of, so it is recorded before the
    // failure is printed and rethrown.
    await record(argv, options, performed, started, error);
    throw error;
  }
}

/**
 * One line per run in the local log, whatever the run did. It is written after the command
 * has printed its answer, never sent anywhere, and never allowed to fail a command:
 * `agent-reference activity` reads it back, and nothing else reads it at all.
 */
async function record(
  argv: string[],
  options: CliOptions | null,
  performed: RunRecord,
  started: number,
  error?: unknown,
): Promise<void> {
  // Asked before the project is resolved, so opting out costs nothing rather than costing
  // the directory walk that names the project.
  if (recordingDisabled()) return;
  // Reading the log is not a use of the tool. A viewer that appends to what it shows counts
  // every look as activity, and the numbers stop being about what the source was fetched for.
  if (options?.command === 'activity') return;

  await recordActivity({
    // An argv that never parsed has no command, and what was typed is the whole evidence.
    command: options?.command ?? 'unknown',
    project: await activityProject(),
    // `get --help` is a question about get, and the topic is the only part of it that says
    // so: by the time it is parsed the command is `help` and the word is gone from the rest.
    args: options?.helpTopic ? [options.helpTopic] : (options?.positionals ?? argv),
    // Read back off argv rather than off the parsed options, so a flag this build does not
    // have is recorded as typed instead of vanishing with the parse that refused it.
    flags: argv.filter((arg) => arg.startsWith('-')).map((arg) => arg.split('=')[0] ?? arg),
    references: performed.references,
    warnings: performed.warnings,
    tty: Boolean(process.stdout.isTTY),
    cli: await cliVersion(),
    ms: Date.now() - started,
    error,
    exitCode: process.exitCode === undefined ? 0 : Number(process.exitCode),
  });
}

/** The build writing the line, read from the manifest beside it. */
async function cliVersion(): Promise<string> {
  return await fs
    .readFile(new URL('../package.json', import.meta.url), 'utf8')
    .then((contents) => (JSON.parse(contents) as { version: string }).version)
    .catch(() => 'unknown');
}

async function run(options: CliOptions, performed: RunRecord): Promise<void> {
  // A human is watching only when stdout is a terminal. Piped output feeds an agent, which
  // passes a path straight to a file API, and `~` is not a path there.
  const humanOutput = Boolean(process.stdout.isTTY);
  const format = { tilde: humanOutput };

  switch (options.command) {
    case 'help':
      process.stdout.write(helpText(options.helpTopic));
      return;
    case 'version': {
      const packageJson = JSON.parse(
        await fs.readFile(new URL('../package.json', import.meta.url), 'utf8'),
      ) as {
        version: string;
      };
      process.stdout.write(`${packageJson.version}\n`);
      return;
    }
    case 'schema':
      process.stdout.write(
        await fs.readFile(
          new URL('../schema/agent-reference.schema.json', import.meta.url),
          'utf8',
        ),
      );
      return;
    // Served rather than installed: the skill file an agent finds on disk was copied into
    // the project once, and nothing updates it. This is the same instructions, read out of
    // the CLI the agent is about to run, so they cannot describe a different version.
    case 'guide':
      process.stdout.write(
        await fs.readFile(new URL('../guide/agent-reference.md', import.meta.url), 'utf8'),
      );
      return;
    case 'status': {
      const { projectPath, references } = await splitPositionals(options);
      const report = await getStatusReport(projectPath, { references });
      write(options, report, (result) =>
        formatStatusReport(result, {
          color: humanOutput && !process.env.NO_COLOR,
          tilde: humanOutput,
        }),
      );
      return;
    }
    case 'get': {
      // Every positional is a spec: get runs against the current directory's project, and
      // specs like github:owner/repo would be misread as paths by splitPositionals.
      const results = await getReferences(null, options.positionals);
      performed.references.push(
        ...results.map((result) => ({
          kind: result.kind,
          name: result.name,
          version: result.version,
          confidence: result.confidence,
        })),
      );
      performed.warnings.push(
        ...results.flatMap((result) => (result.problem ? [result.problem.summary] : [])),
      );
      if (options.path) {
        process.stdout.write(formatGetPaths(results));
        process.stderr.write(formatGetProblems(results));
        return;
      }
      write(options, results, (result) => formatGetResults(result, format));
      return;
    }
    case 'versions': {
      const [spec] = options.positionals;
      if (!spec)
        throw new Error('versions needs a package name, for example agent-reference versions zod.');
      const { ecosystem, name } = parsePackageCoordinate(spec);
      if (ecosystem !== SUPPORTED_ECOSYSTEM)
        throw new Error(unsupportedEcosystemMessage(ecosystem, name));
      const report = await getVersionsReport(null, name);
      write(options, report, formatVersionsReport);
      return;
    }
    case 'clone': {
      const { projectPath, references } = await splitPositionals(options);
      const result = await cloneReferences(projectPath, { references });
      performed.references.push(
        ...result.cloned.map((clone) => ({
          kind: 'package' as const,
          name: clone.dependency.name,
          version: clone.dependency.version,
          confidence: clone.confidence,
        })),
        ...result.clonedGit.map((clone) => ({
          kind: 'git' as const,
          name: clone.name,
          version: null,
          confidence: null,
        })),
        ...result.paths.map((name) => ({
          kind: 'path' as const,
          name,
          version: null,
          confidence: null,
        })),
      );
      performed.warnings.push(...result.problems.map((problem) => problem.summary));
      write(options, result, (value) => formatCloneResult(value, format));
      return;
    }
    case 'init': {
      const { projectPath } = await splitPositionals(options);
      const survey = await surveyProject(projectPath);
      write(options, { ...survey, brief: briefSteps(survey) }, () =>
        formatInitBrief(survey, {
          color: humanOutput && !process.env.NO_COLOR,
          tilde: humanOutput,
        }),
      );
      return;
    }
    case 'validate': {
      const { projectPath } = await splitPositionals(options);
      const report = await validateConfig(projectPath);
      performed.warnings.push(...report.errors);
      write(options, report, (result) => formatValidationReport(result, format));
      if (!report.valid) process.exitCode = 1;
      return;
    }
    case 'store': {
      const { projectPath } = await splitPositionals(options);
      const storeDir = await resolveProjectStoreDir(projectPath);
      const report = await inspectStore({
        storeDir,
        prune: options.prune,
        days: options.days ?? undefined,
      });
      write(options, report, (result) => formatStoreReport(result, format));
      return;
    }
    case 'audit': {
      // Several gigabytes of history take several seconds, and only a terminal
      // has anywhere to say so: a progress line written into a pipe is garbage
      // in whatever the pipe was for.
      const drawing = humanOutput && process.stdout.isTTY;
      const progress = drawing ? auditProgress((text) => process.stdout.write(text)) : undefined;
      const report = await getAuditReport({ days: options.days, progress: progress?.update });
      progress?.clear();
      write(options, report, (result) =>
        formatAuditReport(result, {
          color: humanOutput && !process.env.NO_COLOR,
          tilde: humanOutput,
        }),
      );
      return;
    }
    case 'activity': {
      const report = await getActivityReport({ days: options.days });
      const activityFormat = {
        color: humanOutput && !process.env.NO_COLOR,
        tilde: humanOutput,
      };
      write(options, report, (result) =>
        options.log
          ? formatActivityLog(result, activityFormat)
          : formatActivityReport(result, activityFormat),
      );
      return;
    }
  }
}

/**
 * `agent-reference clone zod` is what an agent writes first, so a bare name that is not a
 * path on disk is a reference selector rather than a project path.
 */
async function splitPositionals(
  options: CliOptions,
): Promise<{ projectPath: string | null; references: string[] }> {
  let projectPath: string | null = null;
  const references: string[] = [];

  for (const value of options.positionals) {
    if (projectPath === null && (await looksLikePath(value))) {
      projectPath = value;
    } else {
      references.push(value);
    }
  }

  return { projectPath, references };
}

async function looksLikePath(value: string): Promise<boolean> {
  if (value.startsWith('.') || value.startsWith('~') || path.isAbsolute(value)) return true;
  // A scoped package name contains a slash, so only check the filesystem for the rest.
  if (value.includes('/') && !value.startsWith('@')) return true;
  return Boolean(await fs.stat(value).catch(() => null));
}

function write<T>(options: CliOptions, result: T, format: (result: T) => string): void {
  process.stdout.write(options.json ? `${JSON.stringify(result, null, 2)}\n` : format(result));
}

/** Per-command help, so `get --help` answers about get rather than printing the whole page. */
const COMMAND_HELP: Record<string, string> = {
  get: `agent-reference get <spec>... [--json | --path]

Materialize each spec and print its path. A spec is a configured name, which may
be a set and then stands for every reference in it, or any source written the way
the config writes one:

  brief                a configured reference or set
  zod                  a dependency, at the version this project installs
  npm:zod@3.22.0       a package at an exact version
  github:openai/codex  a repository, at its default branch
  openai/codex#v0.2.0  the same, at a tag or commit
  ./docs/decisions     a path, read where it lives

Works with no config and no project at all.

--path prints the paths alone, one per line, for a caller holding one in a shell
variable: PI=$(agent-reference get pi --path). The default line names the spec
before the path and the confidence after it, so cutting a path out of it with
tail or sed takes the wrong text. Problems still print, on stderr.`,
  versions: `agent-reference versions <name> [--json]

Report every version of a package this project installs, which workspace package
installs it, and the lockfile the numbers came out of. Reads only and never
fetches; an unknown ecosystem or an absent package is reported as a normal result.`,
  status: `agent-reference status [name...] [--json]

Report every configured reference: where it comes from, its state, and its
absolute path. Naming a set reports that set. Declared but not fetched is the
normal state.`,
  clone: `agent-reference clone [name...] [--json]

Bulk prefetch, for CI or a long flight. With no names it takes everything; with a
set's name it takes that set. Same work as get, reported as a batch.`,
  init: `agent-reference init [project] [--json]

Survey this project and print a setup brief for the agent to carry out: install
the skill, mine recent sessions for references worth declaring, write the config,
and show the user the result. Reads and prints only; it never writes.`,
  validate: `agent-reference validate

Check agent-reference.json and agent-reference.local.json; flags machine paths
that do not belong in the committed file, and the local file being tracked by
git. Exits non-zero, so CI can gate on it.`,
  guide: `agent-reference guide

Print the full agent instructions for this version. The installed skill is a
short stub that cannot go stale; everything about config shape and setup lives
here, next to the code it describes.`,
  schema: `agent-reference schema

Print the JSON Schema for agent-reference.json.`,
  store: `agent-reference store [--prune] [--days <n>]

Show what the store holds and how big it is. --prune deletes checkouts unused for
--days (default 30) and any repository left with none; everything pruned is
refetched on the next get.`,
  audit: `agent-reference audit [--days <n>] [--json]

Count what the agents on this machine did when they had no source to read,
out of the transcripts they already wrote: an API guessed and rejected, a docs
site fetched, a published build opened under node_modules, a repository cloned
into a temp directory. Reads Claude Code, Codex and opencode histories.

Nothing is written and nothing leaves the machine. Files are read, counted and
dropped, and what comes back is four numbers per store. --days limits the window
to sessions touched in that many days; the default is everything on disk.`,
  activity: `agent-reference activity [--log] [--days <n>] [--json]

How much this machine uses agent-reference, what it reaches for, and when it last
did. Every run appends one line to <store>/log/usage.jsonl naming the command,
the project, and what it materialized. That file stays on this machine, nothing
is sent anywhere, and AGENT_REFERENCE_NO_LOG=1 stops the recording.

--log prints the runs themselves, oldest first, instead of the summary over them.
--days narrows either one to a window.`,
};

function helpText(topic: string | null = null): string {
  const focused = topic ? COMMAND_HELP[topic] : null;
  if (focused) return `${focused}\n`;

  return `agent-reference

Gives an agent readable upstream source on demand: dependencies at their exact
installed version, git repositories, and local files and folders, all by name.
Nothing is fetched until asked for.

Usage:
  agent-reference get <spec>... [--json | --path]
  agent-reference versions <name> [--json]
  agent-reference status [name...] [--json]
  agent-reference clone  [name...] [--json]
  agent-reference init   [project] [--json]
  agent-reference validate
  agent-reference guide
  agent-reference schema
  agent-reference store [--prune] [--days <n>]
  agent-reference activity [--log] [--days <n>] [--json]
  agent-reference audit [--days <n>] [--json]

Commands:
  get       Materialize one reference and print its path. A spec is a configured
            name, a dependency name (version from the lockfile), a name@version,
            github:owner/repo, owner/repo, a git URL, or a path. A package may
            carry an ecosystem prefix (npm:zod@3.22.0); npm is the default and
            the only one resolved today. Works with no config at all.
  versions  Report every version of a package this project installs, which
            workspace package installs it, and the lockfile the numbers came out
            of. Reads only; never fetches.
  status    Report every configured reference: source, state, and absolute path.
            Declared but not fetched is the normal state.
  clone     Bulk prefetch every configured reference, for CI or a long flight.
  init      Survey this project and print a setup brief for the agent to carry
            out. Reads and prints only; it never writes.
  validate  Check agent-reference.json and agent-reference.local.json; flags
            machine paths that do not belong in the committed file, and the
            local file being tracked by git. Exits non-zero, so CI can gate on
            it.
  guide     Print the full agent instructions for this version, including the
            config format, which this help leaves out.
  schema    Print the JSON Schema for agent-reference.json.
  store     Show what the store holds and how big it is. --prune deletes
            checkouts unused for --days (default 30).
  activity  How often this machine runs agent-reference and what it reaches for,
            counted from a log the runs themselves write. Local: nothing is sent
            anywhere, and AGENT_REFERENCE_NO_LOG=1 stops the recording.
  audit     How often the agents on this machine worked without source, counted
            off their own transcripts: an API guessed and rejected, the web
            asked for docs, a published build opened, a repository cloned to
            /tmp. Reads only, and nothing leaves the machine.

  <command> --help explains one command on its own.

Options:
  --json          Print machine-readable JSON.
  --path          For get: the resolved paths alone, one per line, for a shell
                  variable. Problems still print, on stderr.
  --log           For activity: the runs themselves, not the summary.
  --prune         For store: delete stale checkouts.
  --days <n>      For store --prune: age threshold in days. Default 30. For
                  activity and audit: the window to count, in days. Default
                  all of it.

References are declared in agent-reference.json (committed, shareable) and
agent-reference.local.json (gitignored, machine paths and private references),
as one "references" map from a name to a source. Every value is an object
holding either "source" or "references"; the second is a set: a name that
stands for several, and that get and status take like any other name. Edit the
JSON directly; run \`agent-reference validate\` after. The store lives in
~/.agent-reference. Set AGENT_REFERENCE_STORE_DIR to move it.
`;
}

main(process.argv.slice(2)).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`agent-reference: ${message}\n`);
  process.exitCode = 1;
});
