#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { parseArgv, type CliOptions } from './args.ts';
import {
  formatCloneResult,
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

async function main(argv: string[]): Promise<void> {
  const options = parseArgv(argv);
  // A human is watching only when stdout is a terminal. Piped output feeds an agent, which
  // passes a path straight to a file API, and `~` is not a path there.
  const humanOutput = Boolean(process.stdout.isTTY);
  const format = { tilde: humanOutput };

  switch (options.command) {
    case 'help':
      process.stdout.write(helpText());
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
      const report = await getStatusReport(projectPath, { references, sets: options.sets });
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
      const result = await cloneReferences(projectPath, { references, sets: options.sets });
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

function helpText(): string {
  return `agent-reference

Gives an agent readable upstream source on demand: dependencies at their exact
installed version, git repositories, and local files and folders, all by name. Nothing is
fetched until asked for.

Usage:
  agent-reference get <spec>... [--json]
  agent-reference versions <name> [--json]
  agent-reference status [reference...] [--set <name>] [--json]
  agent-reference clone  [reference...] [--set <name>] [--json]
  agent-reference init   [project] [--json]
  agent-reference validate
  agent-reference guide
  agent-reference schema
  agent-reference store [--prune] [--days <n>]

Commands:
  get       Materialize one reference and print its path. A spec is a configured
            reference name, a dependency name (version from the lockfile), a
            name@version, github:owner/repo, owner/repo, a git URL, or file:../repo.
            A package may carry an ecosystem prefix (npm:zod@3.22.0), in a spec
            here and as a key in the config alike; npm is the default and the
            only one resolved today. Works with no config and no project at all.
  versions  Report every version of a package this project installs, which
            workspace package installs it, and the lockfile the numbers came out
            of. Reads only; never fetches, and an unknown ecosystem or an absent
            package is an answer, not an error.
  status    Report every configured reference: scope, state, and absolute path.
            Declared-but-not-fetched is the normal state, not a problem.
  clone     Bulk prefetch every configured reference, for CI or a long flight.
  init      Survey this project and print a setup brief for the agent to carry
            out: install the skill, mine recent sessions for references worth
            declaring, write the config, and show the user the result. Reads and
            prints only; it never writes.
  validate  Check agent-reference.json and agent-reference.local.json; flags
            machine paths that do not belong in the committed file, and the
            local file being tracked by git. Exits non-zero, so CI can gate on
            it.
  guide     Print the full agent instructions for this version. The installed
            skill is a short stub that cannot go stale; everything about config
            shape and setup lives here, next to the code it describes.
  schema    Print the JSON Schema for agent-reference.json.
  store     Show what the store holds and how big it is. --prune deletes
            checkouts unused for --days (default 30) and any repository left
            with none; everything pruned is refetched on the next get.

Options:
  --set <name>    Select every reference in a set, by the set's name or an
                  unambiguous piece of its description. Repeatable.
  --json          Print machine-readable JSON.
  --prune         For store: delete stale checkouts.
  --days <n>      For store --prune: age threshold in days. Default 30.

References are declared in agent-reference.json (committed, shareable) and
agent-reference.local.json (gitignored, machine paths and private references).
Edit the JSON directly; run \`agent-reference validate\` after. The store lives
in ~/.agent-reference. Set AGENT_REFERENCE_STORE_DIR to move it.
`;
}

main(process.argv.slice(2)).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`agent-reference: ${message}\n`);
  process.exitCode = 1;
});
