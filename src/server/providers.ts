import {
  commitMatchesIdentity,
  normalizeIdentityMatchers,
} from './identity.ts';
import { logger } from './logger.ts';
import { loadProviderAdapter, type Provider } from './providers/config.ts';
import type { ProviderFetchOptions } from './providers/kernel/manifest-types.ts';
import type {
  NormalisedCommit,
  ProviderFailure,
  SyncFailureTargetType,
} from './providers/types.ts';

export type { NormalisedCommit, Provider, SyncFailureTargetType };

export interface SyncFetchFailure extends ProviderFailure {
  provider: Provider;
}

export interface FetchCommitsForProviderResult {
  repositoriesSynced: number;
  commits: Array<NormalisedCommit>;
  failures: Array<SyncFetchFailure>;
}

export interface FetchCommitsForProviderOptions {
  provider: Provider;
  fetchOptions: ProviderFetchOptions;
  since?: string;
}

function countUniqueStrings(values: Array<string>): number {
  const nonEmpty = values.map((value) => value.trim()).filter((value) => value);
  return new Set(nonEmpty).size;
}

interface NormalisedCommitEntry {
  commit: NormalisedCommit;
  repositoryFullName: string | null;
}

function getAdditionalMatchers(
  username: string,
  matchAuthor: Array<string>,
): Array<string> {
  const normalizedUsername = username.trim().toLowerCase();
  return matchAuthor.filter((matcher) => {
    return matcher.trim().toLowerCase() !== normalizedUsername;
  });
}

function filterCommitsByIdentity(
  entries: Array<NormalisedCommitEntry>,
  username: string,
  additionalMatchers: Array<string>,
): Array<NormalisedCommitEntry> {
  const identityMatchers = normalizeIdentityMatchers([
    username,
    ...additionalMatchers,
  ]);

  return entries.filter(({ commit }) =>
    commitMatchesIdentity(
      commit.author_name,
      commit.author_email,
      identityMatchers,
    ),
  );
}

/**
 * Fetch commits for a given provider integration and return them in a
 * normalised shape ready for persistence.
 */
export async function fetchCommitsForProvider(
  options: FetchCommitsForProviderOptions,
): Promise<FetchCommitsForProviderResult> {
  const { provider, fetchOptions, since } = options;
  const {
    username,
    token,
    match_author: matchAuthor = [],
    blacklist = [],
    url,
    path,
    depth,
  } = fetchOptions;
  const additionalMatchers = getAdditionalMatchers(username, matchAuthor);
  const adapter = await loadProviderAdapter(provider);
  const apiBaseUrl = adapter.resolveApiBaseUrl?.(url);

  logger.info(
    { provider, username, apiBaseUrl, path, depth },
    'Starting provider commit fetch',
  );

  const requestQueue = adapter.createRequestQueue(username, token ?? '');
  const rawFailures: Array<unknown> = [];
  const rawCommits = await adapter.fetchCommits({
    requestQueue,
    username,
    additionalMatchers,
    blacklist,
    since,
    apiBaseUrl,
    path,
    depth,
    onFailure: (failure) => {
      rawFailures.push(failure);
    },
  });

  const normalisedCommitEntries = rawCommits.map((commit) => ({
    commit: adapter.normaliseCommit(commit),
    repositoryFullName: adapter.extractRepositoryFullName(commit),
  }));
  const matchingCommitEntries = adapter.shouldFilterClientSide(
    additionalMatchers,
  )
    ? filterCommitsByIdentity(
        normalisedCommitEntries,
        username,
        additionalMatchers,
      )
    : normalisedCommitEntries;
  const matchingCommits = matchingCommitEntries.map(({ commit }) => commit);
  const failures = rawFailures.map((failure) => ({
    provider,
    ...adapter.normaliseFailure(failure),
  }));

  logger.info(
    { provider, totalCommits: matchingCommits.length },
    'Provider commit fetch complete',
  );

  return {
    repositoriesSynced: countUniqueStrings(
      matchingCommitEntries.map(
        (commitEntry) => commitEntry.repositoryFullName ?? '',
      ),
    ),
    commits: matchingCommits,
    failures,
  };
}
