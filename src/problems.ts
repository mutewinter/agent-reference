import { bareRepositoryPathFor } from './git.ts';
import { SUPPORTED_ECOSYSTEM } from './package-utils.ts';
import type {
  AgentReferenceProblem,
  PackageReference,
  UnresolvedManifestReference,
} from './types.ts';

export function getCommand(name: string): string {
  return `agent-reference get ${name}`;
}

/**
 * Names every version and where it is installed, so the next command is a copy of a line
 * that is already on screen. Guessing here would be silent and wrong half the time.
 */
export function ambiguousInstalledMessage(name: string, candidates: PackageReference[]): string {
  const width = Math.max(...candidates.map((entry) => entry.version.length));
  const rows = candidates.map(
    (entry) => `  ${entry.version.padEnd(width)}  ${entry.importers.join(', ')}`,
  );

  return (
    `${name} is installed at ${candidates.length} versions in this project:\n${rows.join('\n')}\n` +
    `Ask for the one you want, for example ${getCommand(`${name}@${candidates[0]?.version ?? ''}`)}. ` +
    `Running from inside one of those workspace packages picks its version automatically.`
  );
}

/**
 * Whoever reports a failure has to report its fix too. An agent acts on the output of the
 * command it just ran, so this is shared by `clone` and `status` rather than leaving one
 * of them telling the caller to go run the other.
 */
export const KEEP_REFERENCE_NOTE: string =
  'Fix the reference. Do not delete it from agent-reference.json to clear this;\n' +
  '  it was declared on purpose and removing it drops that source for everyone.';

export function unresolvedProblem(
  failure: UnresolvedManifestReference,
  storeDir: string,
  configFile: string,
): AgentReferenceProblem {
  return {
    reference: `package:${failure.name}`,
    severity: 'error',
    summary:
      `${failure.name}@${failure.version} could not be materialized. ${failure.detail}`.trim(),
    fix: unresolvedFix(failure, storeDir, configFile),
    configPatch: unresolvedPatch(failure),
    configFile,
  };
}

/**
 * A git reference that could not be checked out. Recorded as a problem rather than thrown,
 * so one unreachable remote leaves the references that did work materialized and recorded.
 */
export function gitUnresolvedProblem(
  name: string,
  spec: string,
  detail: string,
  configFile: string,
): AgentReferenceProblem {
  return {
    reference: `git:${name}`,
    severity: 'error',
    summary: `references.${name} (${spec}) could not be materialized. ${detail}`.trim(),
    fix: `Check that git can read ${spec} directly; agent-reference clones with your own credentials. If the repository moved or the ref was renamed, correct references.${name}.source in ${configFile}, then run ${getCommand(name)}.`,
    configPatch: null,
    configFile,
  };
}

/**
 * Option A of the three: the checkout root is still handed back, because it is on disk and
 * readable, but never silently. An agent that asked for a subtree and got a whole monorepo
 * has to be told, or it reads the wrong scope believing it read the right one.
 */
export function missingDirectoryProblem(
  name: string,
  directory: string,
  ref: string | null,
  repositoryPath: string,
  configFile: string,
): AgentReferenceProblem {
  // `HEAD` names no particular commit to the reader, so it reads better left off.
  const at = ref && ref !== 'HEAD' ? ` at ${ref}` : '';
  return {
    reference: `git:${name}`,
    severity: 'error',
    summary: `references.${name} asks for ${directory}, which is not in this checkout${at}. The path is the repository root, so it is the whole repository rather than that subtree.`,
    fix: `List what is actually there with: ls ${repositoryPath}. Set references.${name}.directory in ${configFile} to the current path, or remove it to read from the root on purpose. Upstream moving a directory is the usual cause.`,
    configPatch: { references: { [name]: { directory: '<path-in-repository>' } } },
    configFile,
  };
}

export function pinFix(
  name: string,
  version: string | null,
  repositoryUrl: string | null,
  storeDir: string,
  configFile: string,
): string {
  const search = repositoryUrl
    ? `List the candidate tags with: git -C ${bareRepositoryPathFor(storeDir, repositoryUrl)} tag --list '*${version ?? ''}*'. Inspect a candidate with: git -C ${bareRepositoryPathFor(storeDir, repositoryUrl)} show <tag>:package.json.`
    : 'Inspect the source repository to find the release commit.';

  return `${search} Pick the commit or tag that really is ${name}@${version ?? ''}, set references.${name}.ref to it in ${configFile}, then run ${getCommand(name)}. A pinned ref always wins over automatic resolution.`;
}

function unresolvedFix(
  failure: UnresolvedManifestReference,
  storeDir: string,
  configFile: string,
): string {
  if (failure.reason === 'no-repository') {
    return `The registry has no repository for this package. Find its source repository, then set references.${failure.name}.repository in ${configFile} (github:owner/repo or a git URL). Add "ref" too if the tags are unusual. Then run ${getCommand(failure.name)}.`;
  }
  if (failure.reason === 'unresolved-ref') {
    return `The pinned references.${failure.name}.ref does not exist in the repository. ${pinFix(failure.name, failure.version, failure.repositoryUrl, storeDir, configFile)}`;
  }
  if (failure.reason === 'registry-error') {
    return `The registry lookup failed. If this package is private or unpublished, set both references.${failure.name}.repository and references.${failure.name}.ref in ${configFile} to skip the registry entirely. Otherwise check network access and run ${getCommand(failure.name)}.`;
  }
  if (failure.reason === 'rejected') {
    return `agent-reference refused this value rather than passing it to git. Correct references.${failure.name} in ${configFile}: a ref, a commit, or a repository may not begin with "-", and a repository has to use https, ssh, git, or a local path. If this config came from somewhere else, treat the value as hostile rather than fixing it in place.`;
  }
  if (failure.reason === 'clone-failed') {
    // The repository was never read, so there is no mirror to search and nothing to pin a
    // ref against: pointing at the tag workflow here sends an agent to a path that does not
    // exist. The wrong value is the repository, so that is the only key worth naming.
    const source = failure.repository
      ? `references.${failure.name}.repository in ${configFile}`
      : `the npm registry metadata for ${failure.name}@${failure.version}`;
    return `The repository could not be read, so nothing was cloned and no ref was tried. It came from ${source}. If the project moved or was renamed, set references.${failure.name}.repository in ${configFile} to the current location (github:owner/repo or a git URL). If it is private, agent-reference clones with your own git credentials, so check that git can read it directly. Then run ${getCommand(failure.name)}.`;
  }
  return pinFix(failure.name, failure.version, failure.repositoryUrl, storeDir, configFile);
}

function unresolvedPatch(failure: UnresolvedManifestReference): Record<string, unknown> {
  const pinned: Record<string, unknown> = {
    source: `${SUPPORTED_ECOSYSTEM}:${failure.name}@${failure.version}`,
  };
  if (
    failure.reason === 'no-repository' ||
    failure.reason === 'registry-error' ||
    failure.reason === 'clone-failed'
  ) {
    pinned.repository = '<github:owner/repo>';
  }
  // A ref cannot be chosen against a repository that was never read, and a rejected value
  // needs correcting rather than a suggested shape to copy.
  if (failure.reason !== 'clone-failed' && failure.reason !== 'rejected') {
    pinned.ref = '<commit-or-tag>';
  }

  return { references: { [failure.name]: pinned } };
}
