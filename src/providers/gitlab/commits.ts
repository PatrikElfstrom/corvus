import type { ZodType } from 'zod';
import {
  commitMatchesIdentity,
  normalizeIdentityMatchers,
} from '../../identity.ts';
import { logger } from '../../logger.ts';
import { parseSyncFailureError } from '../../sync-failure.ts';
import {
  includesCaseInsensitiveMatcher,
  normalizeCaseInsensitiveMatchers,
} from '../shared.ts';
import type { GitLabRequestExecutor } from './client.ts';
import { GITLAB_API_BASE } from './client.ts';
import type {
  GitLabCommit,
  GitLabCommitWithRepository,
  GitLabProject,
} from './types.ts';
import { gitLabCommitListSchema, gitLabProjectListSchema } from './types.ts';

const PROJECTS_PER_PAGE = 100;
const COMMITS_PER_PAGE = 100;

export interface GitLabProjectFailure {
  projectPath: string;
  message: string;
  statusCode: number | null;
  commitHash: string | null;
}

function commitMatchesUser(
  commit: GitLabCommit,
  identityMatchers: Array<string>,
): boolean {
  return commitMatchesIdentity(
    commit.author_name,
    commit.author_email,
    identityMatchers,
  );
}

function createUntilCursorFromOldestCommit(
  commits: Array<GitLabCommit>,
): string | null {
  let oldestTimestamp = Number.POSITIVE_INFINITY;

  for (const commit of commits) {
    const timestamp = Date.parse(commit.authored_date);
    if (!Number.isFinite(timestamp)) continue;
    if (timestamp < oldestTimestamp) {
      oldestTimestamp = timestamp;
    }
  }

  if (!Number.isFinite(oldestTimestamp)) {
    return null;
  }

  return new Date(oldestTimestamp - 1).toISOString();
}

async function fetchGitLabPage<T>(
  requestQueue: GitLabRequestExecutor,
  url: URL,
  schema: ZodType<T>,
): Promise<{ data: T; nextPage: number | null }> {
  const response = await requestQueue(url.toString());
  const payload =
    response._data === undefined ? await response.json() : response._data;
  const data = schema.parse(payload);
  const nextPageRaw = response.headers.get('x-next-page');
  const nextPage = Number(nextPageRaw);

  return {
    data,
    nextPage: Number.isFinite(nextPage) && nextPage > 0 ? nextPage : null,
  };
}

async function fetchAccessibleProjects(
  requestQueue: GitLabRequestExecutor,
  apiBaseUrl: string,
  onProjectFailure?: (failure: GitLabProjectFailure) => void,
): Promise<Array<GitLabProject>> {
  const projects: Array<GitLabProject> = [];
  let page = 1;

  for (;;) {
    const url = new URL(`${apiBaseUrl}/projects`);
    url.searchParams.set('membership', 'true');
    url.searchParams.set('simple', 'true');
    url.searchParams.set('per_page', String(PROJECTS_PER_PAGE));
    url.searchParams.set('page', String(page));

    logger.info({ page }, 'Fetching GitLab projects page');

    let data: Array<GitLabProject>;
    let nextPage: number | null;
    try {
      const response = await fetchGitLabPage(
        requestQueue,
        url,
        gitLabProjectListSchema,
      );
      data = response.data;
      nextPage = response.nextPage;
    } catch (error) {
      const parsedError = parseSyncFailureError(error);
      logger.error(
        { page, err: error },
        'Failed to fetch GitLab projects page; skipping remaining project pages',
      );
      onProjectFailure?.({
        projectPath: `projects page ${page}`,
        message: parsedError.message,
        statusCode: parsedError.statusCode,
        commitHash: parsedError.commitHash,
      });
      break;
    }

    projects.push(...data);

    if (data.length === 0 || nextPage == null) {
      break;
    }

    page = nextPage;
  }

  logger.info({ count: projects.length }, 'Fetched all GitLab projects');
  return projects;
}

async function fetchProjectCommits(
  requestQueue: GitLabRequestExecutor,
  apiBaseUrl: string,
  project: GitLabProject,
  identityMatchers: Array<string>,
  onProjectFailure?: (failure: GitLabProjectFailure) => void,
  since?: string,
): Promise<Array<GitLabCommitWithRepository>> {
  const commits: Array<GitLabCommitWithRepository> = [];
  const seenCommitIds = new Set<string>();
  let page = 1;
  let untilCursor: string | null = null;

  for (;;) {
    const url = new URL(
      `${apiBaseUrl}/projects/${project.id}/repository/commits`,
    );
    url.searchParams.set('per_page', String(COMMITS_PER_PAGE));
    url.searchParams.set('page', String(page));
    if (since) {
      url.searchParams.set('since', since);
    }
    if (untilCursor) {
      url.searchParams.set('until', untilCursor);
    }

    let data: Array<GitLabCommit>;
    let nextPage: number | null;
    try {
      const response = await fetchGitLabPage(
        requestQueue,
        url,
        gitLabCommitListSchema,
      );
      data = response.data;
      nextPage = response.nextPage;
    } catch (error) {
      const parsedError = parseSyncFailureError(error);
      logger.error(
        {
          project: project.path_with_namespace,
          projectId: project.id,
          page,
          err: error,
        },
        'Failed to fetch GitLab commits page; skipping this project',
      );
      onProjectFailure?.({
        projectPath: project.path_with_namespace,
        message: parsedError.message,
        statusCode: parsedError.statusCode,
        commitHash: parsedError.commitHash,
      });
      break;
    }

    if (data.length === 0) {
      break;
    }

    let uniqueCommitsOnPage = 0;
    for (const commit of data) {
      if (seenCommitIds.has(commit.id)) {
        continue;
      }

      seenCommitIds.add(commit.id);
      uniqueCommitsOnPage++;

      if (!commitMatchesUser(commit, identityMatchers)) {
        continue;
      }

      commits.push({
        ...commit,
        repository: {
          id: project.id,
          full_name: project.path_with_namespace,
          web_url: project.web_url,
        },
      });
    }

    if (uniqueCommitsOnPage === 0) {
      const nextUntilCursor = createUntilCursorFromOldestCommit(data);
      if (nextUntilCursor && nextUntilCursor !== untilCursor) {
        untilCursor = nextUntilCursor;
        page = 1;
        continue;
      }

      logger.warn(
        {
          project: project.path_with_namespace,
          projectId: project.id,
          page,
        },
        'GitLab commits page repeated with no new commit ids; stopping pagination',
      );
      break;
    }

    if (nextPage == null) {
      break;
    }

    page = nextPage;
  }

  return commits;
}

export async function fetchAllGitLabCommits(
  requestQueue: GitLabRequestExecutor,
  username: string,
  additionalIdentityMatchers: Array<string> = [],
  onProjectFailure?: (failure: GitLabProjectFailure) => void,
  blacklistedProjectMatchers: Array<string> = [],
  since?: string,
  apiBaseUrl = GITLAB_API_BASE,
): Promise<Array<GitLabCommitWithRepository>> {
  const identityMatchers = normalizeIdentityMatchers([
    username,
    ...additionalIdentityMatchers,
  ]);
  const normalizedBlacklistMatchers = normalizeCaseInsensitiveMatchers(
    blacklistedProjectMatchers,
  );
  const projects = await fetchAccessibleProjects(
    requestQueue,
    apiBaseUrl,
    onProjectFailure,
  );

  const allCommits: Array<GitLabCommitWithRepository> = [];

  for (const project of projects) {
    if (
      includesCaseInsensitiveMatcher(
        project.path_with_namespace,
        normalizedBlacklistMatchers,
      )
    ) {
      logger.info(
        { project: project.path_with_namespace },
        'Skipping blacklisted GitLab project',
      );
      continue;
    }

    logger.info(
      {
        project: project.path_with_namespace,
        accumulatedCount: allCommits.length,
      },
      'Fetching GitLab commits for project',
    );

    let projectCommits: Array<GitLabCommitWithRepository> = [];
    try {
      projectCommits = await fetchProjectCommits(
        requestQueue,
        apiBaseUrl,
        project,
        identityMatchers,
        onProjectFailure,
        since,
      );
    } catch (error) {
      const parsedError = parseSyncFailureError(error);
      logger.error(
        {
          project: project.path_with_namespace,
          projectId: project.id,
          err: error,
        },
        'Failed to fetch GitLab commits for project; skipping project',
      );
      onProjectFailure?.({
        projectPath: project.path_with_namespace,
        message: parsedError.message,
        statusCode: parsedError.statusCode,
        commitHash: parsedError.commitHash,
      });
      continue;
    }

    allCommits.push(...projectCommits);
  }

  logger.info(
    { totalCommits: allCommits.length },
    'Fetched all GitLab commits',
  );
  return allCommits;
}
