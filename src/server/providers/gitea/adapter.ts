import { defineProviderAdapter, requireResolvedApiBaseUrl } from '../types.ts';
import type { GiteaRequestExecutor } from './client.ts';
import type { GiteaRepositoryFailure } from './commits.ts';
import {
  createGiteaRequestQueue,
  fetchAllGiteaCommits,
  resolveGiteaApiBaseUrl,
} from './index.ts';
import type { GiteaCommitItem } from './types.ts';

interface GiteaCompatibleProviderAdapterOptions {
  provider: string;
  providerName: string;
  createRequestQueue(token: string): GiteaRequestExecutor;
  resolveApiBaseUrl(url?: string): string;
}

export function createGiteaCompatibleProviderAdapter(
  options: GiteaCompatibleProviderAdapterOptions,
) {
  const { createRequestQueue, provider, providerName, resolveApiBaseUrl } =
    options;

  return defineProviderAdapter<
    GiteaCommitItem,
    GiteaRepositoryFailure,
    GiteaRequestExecutor
  >({
    shouldFilterClientSide: (additionalMatchers) =>
      additionalMatchers.length > 0,
    resolveApiBaseUrl,
    createRequestQueue: (_username, token) => createRequestQueue(token),
    fetchCommits: ({
      additionalMatchers,
      apiBaseUrl,
      blacklist,
      onFailure,
      requestQueue,
      since,
      username,
    }) => {
      const shouldFetchAllAuthors = additionalMatchers.length > 0;
      return fetchAllGiteaCommits(
        requestQueue,
        requireResolvedApiBaseUrl(apiBaseUrl, provider),
        username,
        shouldFetchAllAuthors ? [] : undefined,
        onFailure,
        blacklist,
        since,
        providerName,
      );
    },
    normaliseCommit: (commit) => ({
      sha: commit.sha,
      author_name: commit.commit.author?.name ?? '',
      author_email: commit.commit.author?.email ?? '',
      authored_at: commit.commit.author?.date ?? '',
    }),
    extractRepositoryFullName: (commit) => commit.repository.full_name,
    normaliseFailure: (failure) => ({
      targetType: 'repository',
      targetName: failure.repositoryFullName,
      repositoryFullName: failure.repositoryFullName,
      commitHash: failure.commitHash,
      statusCode: failure.statusCode,
      message: failure.message,
    }),
  });
}

export const providerAdapter = createGiteaCompatibleProviderAdapter({
  provider: 'gitea',
  providerName: 'Gitea',
  createRequestQueue: createGiteaRequestQueue,
  resolveApiBaseUrl: resolveGiteaApiBaseUrl,
});
