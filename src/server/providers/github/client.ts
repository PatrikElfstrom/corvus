import type { FetchResponse } from 'ofetch';
import { createRateLimitedRequestQueue } from '../shared.ts';

export type GitHubRequestExecutor = (
  url: string,
) => Promise<FetchResponse<unknown>>;

export function createRequestQueue(token: string): GitHubRequestExecutor {
  return createRateLimitedRequestQueue({
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
    providerName: 'GitHub',
    isRateLimited: (response) =>
      response.status === 429 ||
      (response.status === 403 &&
        response.headers.get('x-ratelimit-remaining') === '0'),
  });
}
