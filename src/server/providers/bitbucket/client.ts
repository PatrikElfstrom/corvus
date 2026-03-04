import type { FetchResponse } from 'ofetch';
import { createRateLimitedRequestQueue } from '../shared.ts';

const BITBUCKET_API_BASE = 'https://api.bitbucket.org/2.0';

export type BitbucketRequestExecutor = (
  url: string,
) => Promise<FetchResponse<unknown>>;

export function createBitbucketRequestQueue(
  username: string,
  appPassword: string,
): BitbucketRequestExecutor {
  const credentials = btoa(`${username}:${appPassword}`);

  return createRateLimitedRequestQueue({
    headers: {
      Accept: 'application/json',
      Authorization: `Basic ${credentials}`,
    },
    providerName: 'Bitbucket',
    isRateLimited: (response) => response.status === 429,
  });
}

export { BITBUCKET_API_BASE };
