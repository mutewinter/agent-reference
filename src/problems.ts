import { bareRepositoryPathFor } from './git.ts';
import type { AgentReferenceProblem, UnresolvedManifestReference } from './types.ts';

export const CLONE_COMMAND: string = 'agent-reference clone --non-interactive';

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
  configFile: string
): AgentReferenceProblem {
  return {
    reference: `package:${failure.name}`,
    severity: 'error',
    summary: `${failure.name}@${failure.version} could not be materialized. ${failure.detail}`.trim(),
    fix: unresolvedFix(failure, storeDir, configFile),
    configPatch: unresolvedPatch(failure)
  };
}

export function pinFix(
  name: string,
  version: string | null,
  repositoryUrl: string | null,
  storeDir: string,
  configFile: string
): string {
  const search = repositoryUrl
    ? `List the candidate tags with: git -C ${bareRepositoryPathFor(storeDir, repositoryUrl)} tag --list '*${version ?? ''}*'. Inspect a candidate with: git -C ${bareRepositoryPathFor(storeDir, repositoryUrl)} show <tag>:package.json.`
    : 'Inspect the source repository to find the release commit.';

  return `${search} Pick the commit or tag that really is ${name}@${version ?? ''}, set packages.${name}.ref to it in ${configFile}, then run ${CLONE_COMMAND}. A pinned ref always wins over automatic resolution.`;
}

function unresolvedFix(failure: UnresolvedManifestReference, storeDir: string, configFile: string): string {
  if (failure.reason === 'no-repository') {
    return `The registry has no repository for this package. Find its source repository, then set packages.${failure.name}.repository in ${configFile} (github:owner/repo or a git URL). Add "ref" too if the tags are unusual. Then run ${CLONE_COMMAND}.`;
  }
  if (failure.reason === 'unresolved-ref') {
    return `The pinned packages.${failure.name}.ref does not exist in the repository. ${pinFix(failure.name, failure.version, failure.repositoryUrl, storeDir, configFile)}`;
  }
  if (failure.reason === 'registry-error') {
    return `The registry lookup failed. If this package is private or unpublished, set both packages.${failure.name}.repository and packages.${failure.name}.ref in ${configFile} to skip the registry entirely. Otherwise check network access and run ${CLONE_COMMAND}.`;
  }
  return pinFix(failure.name, failure.version, failure.repositoryUrl, storeDir, configFile);
}

function unresolvedPatch(failure: UnresolvedManifestReference): Record<string, unknown> {
  const pinned: Record<string, unknown> = { version: failure.version };
  if (failure.reason === 'no-repository' || failure.reason === 'registry-error') {
    pinned.repository = '<github:owner/repo>';
  }
  pinned.ref = '<commit-or-tag>';

  return { packages: { [failure.name]: pinned } };
}
