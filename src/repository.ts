import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ManifestRepository } from './types.ts';

export function repositoryUrlFromManifestRepository(repository: ManifestRepository): string | null {
  if (!repository) return null;

  if (typeof repository === 'string') {
    return normalizeGitRepositoryUrl(repository);
  }

  if (typeof repository === 'object' && typeof repository.url === 'string') {
    return normalizeGitRepositoryUrl(repository.url);
  }

  return null;
}

export function repositoryDirectoryFromManifestRepository(
  repository: ManifestRepository,
): string | null {
  if (repository && typeof repository === 'object' && typeof repository.directory === 'string') {
    return repository.directory;
  }
  return null;
}

export function normalizeGitRepositoryUrl(value: string | null | undefined): string | null {
  if (!value || typeof value !== 'string') return null;

  let url = value.trim();
  if (!url) return null;

  if (path.isAbsolute(url) || url.startsWith('file://')) {
    return stripHash(url);
  }

  url = stripHash(url.replace(/^git\+/, ''));

  const githubShortcut = url.match(/^github:([^/\s]+)\/([^/\s#]+)$/i);
  if (githubShortcut) {
    return `https://github.com/${githubShortcut[1]}/${ensureGitSuffix(githubShortcut[2] ?? '')}`;
  }

  const ownerRepoShortcut = url.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  if (ownerRepoShortcut) {
    return `https://github.com/${ownerRepoShortcut[1]}/${ensureGitSuffix(ownerRepoShortcut[2] ?? '')}`;
  }

  const scpLike = url.match(/^git@([^:]+):(.+)$/);
  if (scpLike) {
    return `https://${scpLike[1]}/${ensureGitSuffix((scpLike[2] ?? '').replace(/^\/+/, ''))}`;
  }

  try {
    const parsed = new URL(url);
    const repoPath = ensureGitSuffix(parsed.pathname.replace(/^\/+/, ''));

    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return `${parsed.protocol}//${parsed.host}/${repoPath}`;
    }
    // Assigning `protocol` cannot convert these to https: the URL spec ignores a change
    // between a non-special scheme and a special one, so rebuild the URL by hand. The SSH
    // port, if any, is dropped because it does not carry over to https.
    if (parsed.protocol === 'ssh:' || parsed.protocol === 'git:') {
      return `https://${parsed.hostname}/${repoPath}`;
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * `git@host:path`, the spelling `git remote -v` prints and the one a user pastes out of it.
 * git reads it as SSH; `new URL` cannot, because `git@host` is not a legal scheme, so it
 * reached the transport check as an unparseable URL and came back reported as malformed.
 *
 * Rewritten to the `ssh://` form git treats as the same remote, which keeps the SSH
 * transport and with it the credentials that are the whole reason for writing a remote this
 * way. `normalizeGitRepositoryUrl` sends the same shape to https instead, and should: that
 * one reads registry metadata for public packages, where https needs no credentials at all.
 *
 * Narrow on purpose, because widening it hands git a transport the safety check would
 * otherwise have refused. What each part is holding off:
 *
 *   `(?![:/\\])`   `ext::sh -c whoami`, git's remote-helper form. Rewritten as a host it
 *                  becomes a valid `ssh://` URL and sails past `assertSafeRepositoryUrl`,
 *                  which exists to refuse exactly that. Also keeps out `https://x`, where
 *                  the colon belongs to a scheme rather than to a host.
 *   `[A-Za-z0-9.-]+`  a hostname, and two characters at least, or `C:\src\repo` and
 *                  `C:repo` read as the host `C`.
 *   `\S+`          a path, not a command line. A repository path has no spaces in it.
 */
const SCP_LIKE = /^(?:([^@\s/\\]+)@)?([A-Za-z0-9][A-Za-z0-9.-]+):(?![:/\\])(\S+)$/;

function scpLikeToSsh(value: string): string | null {
  const match = SCP_LIKE.exec(value);
  if (!match) return null;

  const [, user, host, repoPath] = match;
  return `ssh://${user ? `${user}@` : ''}${host}/${(repoPath ?? '').replace(/^\/+/, '')}`;
}

/**
 * Resolves a repository written in a config file, where `file:` paths are relative to the
 * project and `github:owner/repo` shorthand is expected to work.
 */
export function normalizeConfiguredRepository(rawUrl: string, projectRoot: string): string | null {
  if (rawUrl.startsWith('file:')) {
    // A `file://` URL carries its path percent-encoded and, on Windows, behind a leading
    // slash: `file:///C:/src` sliced down to `///C:/src` resolves against the current drive
    // and comes back `C:\C:\src`. POSIX collapses those slashes and hides it. Only
    // `fileURLToPath` reads the URL as a URL. A malformed one falls through to the path
    // resolution below, where `validate` still reports it for what it is.
    if (rawUrl.startsWith('file://')) {
      try {
        return fileURLToPath(rawUrl);
      } catch {}
    }
    return path.resolve(projectRoot, rawUrl.slice('file:'.length));
  }
  if (rawUrl.startsWith('github:')) {
    return `https://github.com/${rawUrl.slice('github:'.length).replace(/\.git$/, '')}.git`;
  }
  return scpLikeToSsh(rawUrl) ?? (rawUrl || null);
}

export function repositoryCacheParts(repoUrl: string): string[] {
  if (path.isAbsolute(repoUrl) || repoUrl.startsWith('file://')) {
    const hash = crypto.createHash('sha256').update(repoUrl).digest('hex').slice(0, 16);
    return ['local', `${hash}.git`];
  }

  const parsed = new URL(repoUrl);
  const parts = parsed.pathname
    .replace(/^\/+/, '')
    .replace(/\.git$/i, '')
    .split('/')
    .map(safePathPart);

  const repo = parts.pop();
  if (!repo) {
    const hash = crypto.createHash('sha256').update(repoUrl).digest('hex').slice(0, 16);
    return [safePathPart(parsed.hostname), `${hash}.git`];
  }
  return [safePathPart(parsed.hostname), ...parts, `${repo}.git`];
}

/** Short display name for a repository spec: the basename, minus any #ref and .git. */
export function repositoryNameFromSpec(spec: string): string {
  const withoutRef = stripHash(spec).replaceAll('\\', '/').replace(/\/+$/, '');
  const base = withoutRef.slice(withoutRef.lastIndexOf('/') + 1);
  return base.replace(/\.git$/, '') || withoutRef;
}

function stripHash(url: string): string {
  const hashIndex = url.indexOf('#');
  return hashIndex === -1 ? url : url.slice(0, hashIndex);
}

function ensureGitSuffix(value: string): string {
  return value.endsWith('.git') ? value : `${value}.git`;
}

function safePathPart(value: string): string {
  return value.replaceAll(/[^a-zA-Z0-9._-]/g, '_');
}
