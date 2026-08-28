import { displayPath } from './fs-utils.ts';
import { dependencyKey, formatCoordinate } from './package-utils.ts';
import { KEEP_REFERENCE_NOTE } from './problems.ts';
import { formatProblem } from './status-format.ts';
import { formatBytes, type StoreReport } from './store.ts';
import { sanitizeRelayedLine } from './text-utils.ts';
import type { ValidationReport } from './validate.ts';
import type { CloneReferencesResult, GetReferenceResult } from './types.ts';

/**
 * The human formatters for the commands whose report has no module of its own. They live
 * beside the other formatters rather than in `cli.ts`, which runs the CLI on import and so
 * cannot be read from a test.
 */
export interface CliFormatOptions {
  /** Shorten home paths to `~/...`. Only for humans; piped output keeps literal paths. */
  tilde: boolean;
}

export function formatGetResults(results: GetReferenceResult[], options: CliFormatOptions): string {
  const show = (value: string | null): string => displayPath(value, options);
  const lines: string[] = [];

  for (const result of results) {
    if (result.kind === 'package') {
      lines.push(
        `${formatCoordinate(result.name, result.version)} -> ${show(result.path)} (${result.confidence}, ${result.refSource} ${sanitizeRelayedLine(result.checkoutRef ?? '')})`,
      );
    } else if (result.kind === 'git') {
      // The name, not the spec that was configured for it. A name is the whole
      // interface now, and asking for a set by name has to say which member each
      // path is; echoing `github:owner/repo` back answers a question nobody
      // asked. The spec is still in `--json`, and `status` prints it too.
      lines.push(
        `${result.name} -> ${show(result.path)} (${sanitizeRelayedLine(result.checkoutRef ?? '')} @ ${result.checkoutSha?.slice(0, 12)})`,
      );
    } else {
      lines.push(`${result.name} -> ${show(result.path)}`);
    }

    // The fix travels with the result that needs it, rather than waiting for `status`.
    if (result.problem) lines.push(formatProblem(result.problem));
  }

  return `${lines.join('\n')}\n`;
}

/**
 * The paths alone, one per line, and never shortened to `~`: this output exists to be held
 * in a shell variable and handed to a file API, which does not expand it.
 *
 * The human line puts a coordinate before the path and a confidence after it, so a caller
 * that wants only the middle has to cut the line up, and every cut invented for it so far
 * has been wrong: `tail -1` takes the problem line whenever there is one, and dropping
 * everything through `-> ` keeps the trailing parenthetical inside the path.
 */
export function formatGetPaths(results: GetReferenceResult[]): string {
  if (results.length === 0) return '';
  return `${results.map((result) => result.path).join('\n')}\n`;
}

/**
 * The problems from a `--path` run, for stderr. A result can succeed and still not be what
 * was asked for, and under `--path` the line that would have said so is the path itself, so
 * the warning goes to the stream the caller is not capturing.
 */
export function formatGetProblems(results: GetReferenceResult[]): string {
  const problems = results.flatMap((result) => (result.problem ? [result.problem] : []));
  if (problems.length === 0) return '';
  return `${problems.map(formatProblem).join('\n')}\n`;
}

export function formatCloneResult(
  result: CloneReferencesResult,
  options: CliFormatOptions,
): string {
  const show = (value: string | null): string => displayPath(value, options);
  const lines = [
    ...result.cloned.map(
      (clone) =>
        // A ref is a tag out of a third-party repository or a gitHead out of registry
        // metadata, so it is relayed text here exactly as it is under `get`.
        `${dependencyKey(clone.dependency.name, clone.dependency.version)} -> ${show(clone.packagePath)} (${clone.confidence}, ${clone.refSource} ${sanitizeRelayedLine(clone.checkoutRef)})`,
    ),
    ...result.skipped.map(
      (skip) =>
        `${skip.version ? dependencyKey(skip.name, skip.version) : skip.name} skipped: ${skip.reason}`,
    ),
    ...result.clonedGit.map((clone) => `git:${clone.name} -> ${show(clone.referencePath)}`),
    ...result.paths.map((name) => `path:${name} is already local, nothing to clone`),
    `state -> ${show(result.manifestPath)}`,
    ...(result.problems.length > 0
      ? [
          '',
          `problems:\n${result.problems.map(formatProblem).join('\n')}`,
          `  ${KEEP_REFERENCE_NOTE}`,
        ]
      : []),
  ];
  return `${lines.join('\n')}\n`;
}

export function formatStoreReport(report: StoreReport, options: CliFormatOptions): string {
  const lines = [displayPath(report.storeDir, options), ''];

  if (report.repositories.length === 0) {
    lines.push('empty. agent-reference clone fills it.');
    return `${lines.join('\n')}\n`;
  }

  const rows = report.repositories.map((repository) => [
    repository.name,
    formatBytes(repository.totalBytes),
    `${repository.checkouts.length} checkout${repository.checkouts.length === 1 ? '' : 's'}`,
  ]);
  const width = Math.max(...rows.map((row) => row[0]?.length ?? 0));
  const size = Math.max(...rows.map((row) => row[1]?.length ?? 0));
  for (const [name, bytes, checkouts] of rows) {
    lines.push(`  ${(name ?? '').padEnd(width)}  ${(bytes ?? '').padStart(size)}  ${checkouts}`);
  }

  lines.push('', `total ${formatBytes(report.totalBytes)}`);
  if (report.removed.length > 0) {
    lines.push(
      `removed ${report.removed.length}, reclaiming ${formatBytes(report.reclaimedBytes)}`,
    );
  } else {
    lines.push(
      'Everything here is a cache: agent-reference store --prune trims it, and clone rebuilds.',
    );
  }

  return `${lines.join('\n')}\n`;
}

export function formatValidationReport(
  report: ValidationReport,
  options: CliFormatOptions,
): string {
  const lines = [
    ...report.errors.map((error) => `error: ${error}`),
    ...report.warnings.map((warning) => `warning: ${warning}`),
  ];

  if (report.valid) {
    const references =
      report.references.length === 1 ? '1 reference' : `${report.references.length} references`;
    const sets = report.sets.length === 1 ? '1 set' : `${report.sets.length} sets`;
    // Both files, when both exist. The count has always been of the two together, and
    // naming only the first made the line say that agent-reference.json defines references
    // that are in the local file. `init` tells the agent to quote this to the user.
    const files = [report.configPath, report.localConfigPath]
      .filter((file): file is string => file !== null)
      .map((file) => displayPath(file, options));
    lines.push(
      `ok: ${files.join(' and ')} define${files.length === 1 ? 's' : ''} ${references} in ${sets}.`,
    );
  }

  return `${lines.join('\n')}\n`;
}
