import type { FetchResponse } from 'ofetch';
import { createRateLimitedRequestQueue, resolveApiBaseUrl } from '../shared.ts';

const DEFAULT_GITLAB_URL = 'https://gitlab.com';
const GITLAB_API_PATH = '/api/v4';
const GITLAB_API_BASE = `${DEFAULT_GITLAB_URL}${GITLAB_API_PATH}`;

export type GitLabRequestExecutor = (
  url: string,
) => Promise<FetchResponse<unknown>>;

export function createGitLabRequestQueue(token: string): GitLabRequestExecutor {
  return createRateLimitedRequestQueue({
    headers: {
      Accept: 'application/json',
      'PRIVATE-TOKEN': token,
    },
    providerName: 'GitLab',
    isRateLimited: (response) => response.status === 429,
  });
}

export function resolveGitLabApiBaseUrl(url?: string): string {
  return resolveApiBaseUrl({
    url,
    providerName: 'GitLab',
    defaultUrl: DEFAULT_GITLAB_URL,
    apiPath: GITLAB_API_PATH,
    exampleUrl: 'https://gitlab.example.com',
  });
}

export { GITLAB_API_BASE };
