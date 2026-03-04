import { logger } from '../../logger.ts';
import { parseSyncFailureError } from '../../sync-failure.ts';
import {
  fetchCommitsForAuthorFilters,
  fetchDeduplicatedSequentialPages,
  fetchJsonWithSchema,
  fetchSequentialPagesUntilEmpty,
  includesCaseInsensitiveMatcher,
  normalizeAuthorFilters,
  normalizeCaseInsensitiveMatchers,
  withRepositoryFullName,
} from '../shared.ts';
import type { GitHubRequestExecutor } from './client.ts';
import type { GitHubCommitItem, GitHubRepository } from './types.ts';
import {
  gitHubRepositoryCommitListSchema,
  gitHubRepositoryListSchema,
} from './types.ts';

const GITHUB_USER_REPOS_URL = 'https://api.github.com/user/repos';
const GITHUB_REPOS_URL = 'https://api.github.com/repos';
const REPOS_PER_PAGE = 100;
const COMMITS_PER_PAGE = 100;

export interface GitHubRepositoryFailure {
  repositoryFullName: string;
  message: string;
  statusCode: number | null;
  commitHash: string | null;
}

async function fetchUserRepositories(
  requestQueue: GitHubRequestExecutor,
): Promise<Array<GitHubRepository>> {
  const repositories = await fetchSequentialPagesUntilEmpty({
    fetchPage: async (page) => {
      const url = new URL(GITHUB_USER_REPOS_URL);
      url.searchParams.set('per_page', String(REPOS_PER_PAGE));
      url.searchParams.set('page', String(page));

      logger.info({ page }, 'Fetching GitHub repositories page');
      return fetchJsonWithSchema(
        requestQueue,
        url.toString(),
        gitHubRepositoryListSchema,
      );
    },
  });

  logger.info(
    { count: repositories.length },
    'Fetched all GitHub repositories',
  );
  return repositories;
}

async function fetchRepositoryCommits(
  requestQueue: GitHubRequestExecutor,
  repositoryFullName: string,
  authorFilter?: string,
  since?: string,
): Promise<Array<GitHubCommitItem>> {
  return fetchDeduplicatedSequentialPages({
    fetchPage: async (page) => {
      const url = new URL(`${GITHUB_REPOS_URL}/${repositoryFullName}/commits`);
      if (authorFilter) {
        url.searchParams.set('author', authorFilter);
      }
      if (since) {
        url.searchParams.set('since', since);
      }
      url.searchParams.set('per_page', String(COMMITS_PER_PAGE));
      url.searchParams.set('page', String(page));

      const data = await fetchJsonWithSchema(
        requestQueue,
        url.toString(),
        gitHubRepositoryCommitListSchema,
      );
      return data.map((commit) =>
        withRepositoryFullName(commit, repositoryFullName),
      );
    },
    getItemKey: (commit) => commit.sha,
    onEmptyUniquePage: (page) => {
      logger.warn(
        { repository: repositoryFullName, page },
        'GitHub commits page repeated with no new commit SHAs; stopping pagination',
      );
    },
  });
}

export async function fetchAllCommits(
  requestQueue: GitHubRequestExecutor,
  username: string,
  authorFilters?: Array<string>,
  onRepositoryFailure?: (failure: GitHubRepositoryFailure) => void,
  blacklistedRepositoryMatchers: Array<string> = [],
  since?: string,
): Promise<Array<GitHubCommitItem>> {
  const effectiveAuthorFilters = normalizeAuthorFilters(
    username,
    authorFilters,
  );
  const normalizedBlacklistMatchers = normalizeCaseInsensitiveMatchers(
    blacklistedRepositoryMatchers,
  );
  const repositories = await fetchUserRepositories(requestQueue);
  const allCommits: Array<GitHubCommitItem> = [];

  for (const repository of repositories) {
    if (
      includesCaseInsensitiveMatcher(
        repository.full_name,
        normalizedBlacklistMatchers,
      )
    ) {
      logger.info(
        { repository: repository.full_name },
        'Skipping blacklisted GitHub repository',
      );
      continue;
    }

    logger.info(
      {
        repository: repository.full_name,
        accumulatedCount: allCommits.length,
      },
      'Fetching GitHub commits for repository',
    );

    try {
      const repositoryCommits = await fetchCommitsForAuthorFilters({
        authorFilters: effectiveAuthorFilters,
        fetchCommits: (authorFilter) =>
          fetchRepositoryCommits(
            requestQueue,
            repository.full_name,
            authorFilter,
            since,
          ),
        getCommitKey: (commit) => commit.sha,
      });
      allCommits.push(...repositoryCommits);
    } catch (error) {
      const parsedError = parseSyncFailureError(error);
      logger.warn(
        { repository: repository.full_name, err: error },
        'Failed to fetch GitHub commits for repository; skipping repository',
      );
      onRepositoryFailure?.({
        repositoryFullName: repository.full_name,
        message: parsedError.message,
        statusCode: parsedError.statusCode,
        commitHash: parsedError.commitHash,
      });
    }
  }

  return allCommits;
}
