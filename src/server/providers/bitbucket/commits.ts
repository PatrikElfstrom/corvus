import { logger } from '../../logger.ts';
import { parseSyncFailureError } from '../../sync-failure.ts';
import {
  fetchJsonWithSchema,
  includesCaseInsensitiveMatcher,
  normalizeCaseInsensitiveMatchers,
  withRepositoryFullName,
} from '../shared.ts';
import type { BitbucketRequestExecutor } from './client.ts';
import { BITBUCKET_API_BASE } from './client.ts';
import type {
  BitbucketApiCommit,
  BitbucketCommit,
  BitbucketRepository,
  BitbucketWorkspaceAccess,
} from './types.ts';
import {
  bitbucketApiCommitSchema,
  bitbucketPaginatedResponseSchema,
  bitbucketRepositorySchema,
  bitbucketWorkspaceAccessSchema,
} from './types.ts';

const REPOS_PER_PAGE = 100;
const COMMITS_PER_PAGE = 100;
const bitbucketWorkspacePageSchema = bitbucketPaginatedResponseSchema(
  bitbucketWorkspaceAccessSchema,
);
const bitbucketRepositoryPageSchema = bitbucketPaginatedResponseSchema(
  bitbucketRepositorySchema,
);
const bitbucketCommitPageSchema = bitbucketPaginatedResponseSchema(
  bitbucketApiCommitSchema,
);
type BitbucketWorkspacePage = {
  next?: string;
  values: Array<BitbucketWorkspaceAccess>;
};
type BitbucketRepositoryPage = {
  next?: string;
  values: Array<BitbucketRepository>;
};
type BitbucketCommitPage = {
  next?: string;
  values: Array<BitbucketApiCommit>;
};

export interface BitbucketRepositoryFailure {
  target: string;
  message: string;
  statusCode: number | null;
  commitHash: string | null;
}

function parseSinceTimestamp(since?: string): number | null {
  if (!since) {
    return null;
  }

  const timestamp = Date.parse(since);
  return Number.isFinite(timestamp) ? timestamp : null;
}

/**
 * Parse the author name and email from a Bitbucket raw author string.
 * Format is typically "Display Name <email@example.com>".
 */
export function parseAuthorRaw(raw: string): {
  name: string;
  email: string;
} {
  const match = raw.match(/^(.+?)\s*<(.+?)>$/);
  if (match) {
    return { name: match[1].trim(), email: match[2].trim() };
  }
  return { name: raw.trim(), email: '' };
}

/**
 * Step 1 – List all workspaces accessible to the authenticated user.
 * https://api.bitbucket.org/2.0/user/workspaces
 */
async function fetchUserWorkspaces(
  requestQueue: BitbucketRequestExecutor,
): Promise<Array<string>> {
  const slugs: Array<string> = [];
  let url: string | undefined =
    `${BITBUCKET_API_BASE}/user/workspaces?pagelen=${REPOS_PER_PAGE}`;

  while (url) {
    logger.info({ url }, 'Fetching Bitbucket workspaces page');
    const data: BitbucketWorkspacePage = await fetchJsonWithSchema(
      requestQueue,
      url,
      bitbucketWorkspacePageSchema,
    );

    for (const entry of data.values) {
      slugs.push(entry.workspace.slug);
    }

    url = data.next;
  }

  logger.info({ count: slugs.length }, 'Fetched all Bitbucket workspaces');
  return slugs;
}

/**
 * Step 2 – List all repositories in a single workspace.
 * https://api.bitbucket.org/2.0/repositories/{workspace}
 */
async function fetchWorkspaceRepositories(
  requestQueue: BitbucketRequestExecutor,
  workspace: string,
): Promise<Array<BitbucketRepository>> {
  const repos: Array<BitbucketRepository> = [];
  let url: string | undefined =
    `${BITBUCKET_API_BASE}/repositories/${encodeURIComponent(workspace)}?pagelen=${REPOS_PER_PAGE}`;

  while (url) {
    logger.info({ url }, 'Fetching Bitbucket repositories page');
    const data: BitbucketRepositoryPage = await fetchJsonWithSchema(
      requestQueue,
      url,
      bitbucketRepositoryPageSchema,
    );

    repos.push(...data.values);
    url = data.next;
  }

  logger.info(
    { workspace, count: repos.length },
    'Fetched repositories for workspace',
  );
  return repos;
}

/**
 * Step 3 – Fetch commits for a single repository, filtered by email.
 * https://api.bitbucket.org/2.0/repositories/{workspace}/{repo_slug}/commits
 */

async function fetchRepoCommits(
  requestQueue: BitbucketRequestExecutor,
  repoFullName: string,
  since?: string,
): Promise<Array<BitbucketCommit>> {
  const commits: Array<BitbucketCommit> = [];
  const seenCommitHashes = new Set<string>();
  const sinceTimestamp = parseSinceTimestamp(since);
  let url: string | undefined =
    `${BITBUCKET_API_BASE}/repositories/${repoFullName}/commits?pagelen=${COMMITS_PER_PAGE}`;

  while (url) {
    const data: BitbucketCommitPage = await fetchJsonWithSchema(
      requestQueue,
      url,
      bitbucketCommitPageSchema,
    );

    let reachedSinceBoundary = false;
    let uniqueCommitsOnPage = 0;
    for (const commit of data.values) {
      if (seenCommitHashes.has(commit.hash)) {
        continue;
      }

      seenCommitHashes.add(commit.hash);
      uniqueCommitsOnPage++;

      if (sinceTimestamp != null) {
        const commitTimestamp = Date.parse(commit.date);
        if (
          Number.isFinite(commitTimestamp) &&
          commitTimestamp <= sinceTimestamp
        ) {
          reachedSinceBoundary = true;
          break;
        }
      }

      commits.push(withRepositoryFullName(commit, repoFullName));
    }

    if (data.values.length === 0 || reachedSinceBoundary) {
      break;
    }

    if (uniqueCommitsOnPage === 0) {
      logger.warn(
        { repository: repoFullName, url },
        'Bitbucket commits page repeated with no new commit hashes; stopping pagination',
      );
      break;
    }

    url = data.next;
  }

  return commits;
}

export async function fetchAllBitbucketCommits(
  requestQueue: BitbucketRequestExecutor,
  onRepositoryFailure?: (failure: BitbucketRepositoryFailure) => void,
  blacklistedRepositoryMatchers: Array<string> = [],
  since?: string,
): Promise<Array<BitbucketCommit>> {
  const normalizedBlacklistMatchers = normalizeCaseInsensitiveMatchers(
    blacklistedRepositoryMatchers,
  );

  // Step 1: list all workspaces
  let workspaces: Array<string>;
  try {
    workspaces = await fetchUserWorkspaces(requestQueue);
  } catch (error) {
    const parsedError = parseSyncFailureError(error);
    logger.error(
      { err: error },
      'Failed to fetch Bitbucket workspaces; skipping commit sync',
    );
    onRepositoryFailure?.({
      target: 'workspaces',
      message: parsedError.message,
      statusCode: parsedError.statusCode,
      commitHash: parsedError.commitHash,
    });
    return [];
  }
  const allCommits: Array<BitbucketCommit> = [];

  for (const workspace of workspaces) {
    // Step 2: list repos in this workspace
    let repos: Array<BitbucketRepository>;
    try {
      repos = await fetchWorkspaceRepositories(requestQueue, workspace);
    } catch (error) {
      const parsedError = parseSyncFailureError(error);
      logger.warn(
        { workspace, err: error },
        'Failed to fetch Bitbucket repositories for workspace; skipping workspace',
      );
      onRepositoryFailure?.({
        target: `workspace:${workspace}`,
        message: parsedError.message,
        statusCode: parsedError.statusCode,
        commitHash: parsedError.commitHash,
      });
      continue;
    }

    for (const repo of repos) {
      if (
        includesCaseInsensitiveMatcher(
          repo.full_name,
          normalizedBlacklistMatchers,
        )
      ) {
        logger.info(
          { repo: repo.full_name },
          'Skipping blacklisted Bitbucket repository',
        );
        continue;
      }

      logger.info(
        { repo: repo.full_name, accumulatedCount: allCommits.length },
        'Fetching Bitbucket commits for repo',
      );

      // Step 3: list commits for this repo
      let repoCommits: Array<BitbucketCommit>;
      try {
        repoCommits = await fetchRepoCommits(
          requestQueue,
          repo.full_name,
          since,
        );
      } catch (error) {
        const parsedError = parseSyncFailureError(error);
        logger.warn(
          { repo: repo.full_name, err: error },
          'Failed to fetch Bitbucket commits for repo; skipping repository',
        );
        onRepositoryFailure?.({
          target: repo.full_name,
          message: parsedError.message,
          statusCode: parsedError.statusCode,
          commitHash: parsedError.commitHash,
        });
        continue;
      }

      allCommits.push(...repoCommits);
    }
  }

  logger.info(
    { totalCommits: allCommits.length },
    'Fetched all Bitbucket commits',
  );
  return allCommits;
}
