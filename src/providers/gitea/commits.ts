import { logger } from '../../logger.ts';
import { parseSyncFailureError } from '../../sync-failure.ts';
import {
  encodePathSegments,
  fetchCommitsForAuthorFilters,
  fetchDeduplicatedSequentialPages,
  fetchJsonWithSchema,
  fetchSequentialPagesUntilEmpty,
  includesCaseInsensitiveMatcher,
  normalizeAuthorFilters,
  normalizeCaseInsensitiveMatchers,
  withRepositoryFullName,
} from '../shared.ts';
import type { GiteaRequestExecutor } from './client.ts';
import type { GiteaCommitItem } from './types.ts';
import {
  giteaRepositoryCommitListSchema,
  giteaRepositoryListSchema,
} from './types.ts';

const REPOS_PER_PAGE = 50;
const COMMITS_PER_PAGE = 50;
const DEFAULT_PROVIDER_NAME = 'Gitea';

export interface GiteaRepositoryFailure {
  repositoryFullName: string;
  message: string;
  statusCode: number | null;
  commitHash: string | null;
}

async function fetchUserRepositories(
  requestQueue: GiteaRequestExecutor,
  apiBaseUrl: string,
  providerName: string,
): Promise<Array<{ full_name: string }>> {
  const repositories = await fetchSequentialPagesUntilEmpty({
    fetchPage: async (page) => {
      const url = new URL(`${apiBaseUrl}/user/repos`);
      url.searchParams.set('limit', String(REPOS_PER_PAGE));
      url.searchParams.set('page', String(page));

      logger.info({ page }, `Fetching ${providerName} repositories page`);
      return fetchJsonWithSchema(
        requestQueue,
        url.toString(),
        giteaRepositoryListSchema,
      );
    },
  });

  logger.info(
    { count: repositories.length },
    `Fetched all ${providerName} repositories`,
  );
  return repositories;
}

async function fetchRepositoryCommits(
  requestQueue: GiteaRequestExecutor,
  apiBaseUrl: string,
  repositoryFullName: string,
  providerName: string,
  authorFilter?: string,
  since?: string,
): Promise<Array<GiteaCommitItem>> {
  const encodedRepository = encodePathSegments(repositoryFullName);

  return fetchDeduplicatedSequentialPages({
    fetchPage: async (page) => {
      const url = new URL(`${apiBaseUrl}/repos/${encodedRepository}/commits`);
      if (authorFilter) {
        url.searchParams.set('author', authorFilter);
      }
      if (since) {
        url.searchParams.set('since', since);
      }
      url.searchParams.set('limit', String(COMMITS_PER_PAGE));
      url.searchParams.set('page', String(page));

      const data = await fetchJsonWithSchema(
        requestQueue,
        url.toString(),
        giteaRepositoryCommitListSchema,
      );
      return data.map((commit) =>
        withRepositoryFullName(commit, repositoryFullName),
      );
    },
    getItemKey: (commit) => commit.sha,
    onEmptyUniquePage: (page) => {
      logger.warn(
        { repository: repositoryFullName, page },
        `${providerName} commits page repeated with no new commit SHAs; stopping pagination`,
      );
    },
  });
}

export async function fetchAllGiteaCommits(
  requestQueue: GiteaRequestExecutor,
  apiBaseUrl: string,
  username: string,
  authorFilters?: Array<string>,
  onRepositoryFailure?: (failure: GiteaRepositoryFailure) => void,
  blacklistedRepositoryMatchers: Array<string> = [],
  since?: string,
  providerName = DEFAULT_PROVIDER_NAME,
): Promise<Array<GiteaCommitItem>> {
  const effectiveAuthorFilters = normalizeAuthorFilters(
    username,
    authorFilters,
  );
  const normalizedBlacklistMatchers = normalizeCaseInsensitiveMatchers(
    blacklistedRepositoryMatchers,
  );
  const repositories = await fetchUserRepositories(
    requestQueue,
    apiBaseUrl,
    providerName,
  );
  const allCommits: Array<GiteaCommitItem> = [];

  for (const repository of repositories) {
    const repositoryFullName = repository.full_name;

    if (
      includesCaseInsensitiveMatcher(
        repositoryFullName,
        normalizedBlacklistMatchers,
      )
    ) {
      logger.info(
        { repository: repositoryFullName },
        `Skipping blacklisted ${providerName} repository`,
      );
      continue;
    }

    logger.info(
      {
        repository: repositoryFullName,
        accumulatedCount: allCommits.length,
      },
      `Fetching ${providerName} commits for repository`,
    );

    try {
      const repositoryCommits = await fetchCommitsForAuthorFilters({
        authorFilters: effectiveAuthorFilters,
        fetchCommits: (authorFilter) =>
          fetchRepositoryCommits(
            requestQueue,
            apiBaseUrl,
            repositoryFullName,
            providerName,
            authorFilter,
            since,
          ),
        getCommitKey: (commit) => commit.sha,
      });
      allCommits.push(...repositoryCommits);
    } catch (error) {
      const parsedError = parseSyncFailureError(error);
      logger.warn(
        { repository: repositoryFullName, err: error },
        `Failed to fetch ${providerName} commits for repository; skipping repository`,
      );
      onRepositoryFailure?.({
        repositoryFullName,
        message: parsedError.message,
        statusCode: parsedError.statusCode,
        commitHash: parsedError.commitHash,
      });
    }
  }

  return allCommits;
}
