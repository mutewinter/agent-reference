import crypto from 'node:crypto';
import path from 'node:path';

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

export function repositoryDirectoryFromManifestRepository(repository: ManifestRepository): string | null {
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
 * Resolves a repository written in a config file, where `file:` paths are relative to the
 * project and `github:owner/repo` shorthand is expected to work.
 */
export function normalizeConfiguredRepository(rawUrl: string, projectRoot: string): string | null {
  if (rawUrl.startsWith('file:')) {
    return path.resolve(projectRoot, rawUrl.slice('file:'.length));
  }
  if (rawUrl.startsWith('github:')) {
    return `https://github.com/${rawUrl.slice('github:'.length).replace(/\.git$/, '')}.git`;
  }
  return rawUrl || null;
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

function stripHash(url: string): string {
  const hashIndex = url.indexOf('#');
  return hashIndex === -1 ? url : url.slice(0, hashIndex);
}

function ensureGitSuffix(value: string): string {
  return value.endsWith('.git') ? value : `${value}.git`;
}

function safePathPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_');
}
