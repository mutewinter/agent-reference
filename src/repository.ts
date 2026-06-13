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
    if (parsed.protocol === 'git:') parsed.protocol = 'https:';
    if (parsed.protocol === 'ssh:' && parsed.username === 'git') {
      parsed.protocol = 'https:';
      parsed.username = '';
    }
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      parsed.pathname = `/${ensureGitSuffix(parsed.pathname.replace(/^\/+/, ''))}`;
      parsed.search = '';
      parsed.hash = '';
      return parsed.toString();
    }
  } catch {
    return null;
  }

  return null;
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
