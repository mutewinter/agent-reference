import path from 'node:path';

import {
  KNOWN_ECOSYSTEMS,
  parsePackageKey,
  SUPPORTED_ECOSYSTEM,
  unknownEcosystemMessage,
  unsupportedEcosystemMessage,
} from './package-utils.ts';

/**
 * The one grammar. `get <spec>` and a `references` value are the same string in the same
 * shapes, classified here and nowhere else, so the config can never accept a spelling the
 * CLI rejects or resolve one differently.
 */
export type ClassifiedSource =
  | { kind: 'path'; path: string }
  | { kind: 'git'; repository: string; ref: string | null }
  | { kind: 'package'; ecosystem: string; name: string; version: string | null };

/**
 * A path source has to be rooted. `docs/decisions` is a valid `owner/repo` shorthand and a
 * plausible folder, and nothing in the string says which was meant; requiring the prefix
 * makes the answer local to the value rather than dependent on what happens to be on disk.
 */
const ROOTED_PATH = /^(\.\.?([/\\]|$)|~([/\\]|$)|[/\\])/;
/** `C:\...` and `\\server\share`, absolute on Windows and read on every other platform. */
const WINDOWS_ABSOLUTE = /^(?:[A-Za-z]:[\\/]|\\\\)/;
const GIT_URL = /^(github:|git@|ssh:|git\+|https?:\/\/|file:\/\/)/;
/** Only scoped npm names contain a slash, so this cannot collide with a package name. */
const OWNER_REPO = /^[\w.-]+\/[\w.-]+(#[\w./-]+)?$/;

export class UnknownSourceError extends Error {}

export function classifySource(spec: string): ClassifiedSource {
  const value = spec.trim();
  if (!value) throw new UnknownSourceError('a source may not be empty.');

  if (ROOTED_PATH.test(value) || WINDOWS_ABSOLUTE.test(value) || path.isAbsolute(value)) {
    return { kind: 'path', path: value };
  }

  // `file:../repo` reads as a path and resolves as a clone, which is the one ambiguity a
  // single map cannot carry. A local checkout is read live; a `file://` URL is a git URL
  // like any other and still clones.
  if (value.startsWith('file:') && !value.startsWith('file://')) {
    throw new UnknownSourceError(
      `"${value}" is not a source. Write "${value.slice('file:'.length)}" to read that checkout where it lives, which keeps its history and its uncommitted work with it. That is not the same thing: a file:// URL with an absolute path clones it into the store at one commit instead, which is a snapshot and goes stale.`,
    );
  }

  if (GIT_URL.test(value) || stripRef(value).endsWith('.git')) return gitSource(value);
  if (!value.startsWith('@') && OWNER_REPO.test(value)) return gitSource(`github:${value}`);

  // Only a scoped name carries a slash, so anything else holding one is neither a package
  // nor a shape this recognizes. Left to fall through it reached the registry as a package
  // name and came back a 404, which blames npm for a host written without its scheme.
  const bare = withoutEcosystem(value);
  if (bare.includes('/') && !bare.startsWith('@')) {
    throw new UnknownSourceError(
      `"${value}" is not a source. For a repository, give it a scheme: https://${value}, git@host:path, or github:owner/repo. For a path here, root it: ./${value}.`,
    );
  }

  return packageSource(value);
}

function gitSource(value: string): ClassifiedSource {
  const hash = value.lastIndexOf('#');
  const repository = hash === -1 ? value : value.slice(0, hash);
  const ref = hash === -1 ? null : value.slice(hash + 1) || null;
  if (!repository) {
    throw new UnknownSourceError(`"${value}" needs a repository before the "#" ref.`);
  }
  return { kind: 'git', repository, ref };
}

function packageSource(value: string): ClassifiedSource {
  const { ecosystem, name, version } = parsePackageKey(value);
  if (!KNOWN_ECOSYSTEMS.includes(ecosystem)) {
    throw new UnknownSourceError(unknownEcosystemMessage(ecosystem));
  }
  if (ecosystem !== SUPPORTED_ECOSYSTEM) {
    throw new UnknownSourceError(unsupportedEcosystemMessage(ecosystem, name));
  }
  if (!name) throw new UnknownSourceError(`"${value}" names no package.`);
  return { kind: 'package', ecosystem, name, version };
}

/** The coordinate with any ecosystem prefix taken off, so `npm:@scope/x` reads as `@scope/x`. */
function withoutEcosystem(value: string): string {
  const colon = value.indexOf(':');
  if (colon <= 0) return value;
  return KNOWN_ECOSYSTEMS.includes(value.slice(0, colon)) ? value.slice(colon + 1) : value;
}

export function stripRef(value: string): string {
  const hash = value.lastIndexOf('#');
  return hash === -1 ? value : value.slice(0, hash);
}

/** The name a set member takes when it does not declare one. */
export function derivedName(source: ClassifiedSource): string {
  if (source.kind === 'package') return source.name;
  if (source.kind === 'git') return repositoryBasename(source.repository);
  return pathBasename(source.path);
}

function repositoryBasename(repository: string): string {
  const base = path.posix.basename(repository.replaceAll('\\', '/').replace(/\/+$/, ''));
  return base.replace(/\.git$/, '') || repository;
}

function pathBasename(declaredPath: string): string {
  const normalized = declaredPath.replaceAll('\\', '/').replace(/\/+$/, '');
  const base = path.posix.basename(normalized);
  return base && base !== '.' && base !== '~' ? base : normalized;
}
