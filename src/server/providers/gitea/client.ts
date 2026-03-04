import type { FetchResponse } from 'ofetch';
import { createRateLimitedRequestQueue, resolveApiBaseUrl } from '../shared.ts';

const DEFAULT_GITEA_URL = 'https://gitea.com';
const GITEA_API_PATH = '/api/v1';

export type GiteaRequestExecutor = (
  url: string,
) => Promise<FetchResponse<unknown>>;

interface ResolveGiteaCompatibleApiBaseUrlOptions {
  url?: string;
  providerName: string;
  exampleUrl: string;
  defaultUrl?: string;
}

export function createGiteaCompatibleRequestQueue(
  token: string,
  providerName: string,
): GiteaRequestExecutor {
  return createRateLimitedRequestQueue({
    headers: {
      Accept: 'application/json',
      Authorization: `token ${token}`,
    },
    providerName,
    isRateLimited: (response) => response.status === 429,
  });
}

export function resolveGiteaCompatibleApiBaseUrl(
  options: ResolveGiteaCompatibleApiBaseUrlOptions,
): string {
  const { defaultUrl, exampleUrl, providerName, url } = options;
  if (url == null && defaultUrl == null) {
    throw Error(`${providerName} url is required.`);
  }

  return resolveApiBaseUrl({
    url,
    providerName,
    defaultUrl: defaultUrl ?? '',
    apiPath: GITEA_API_PATH,
    exampleUrl,
  });
}

export function createGiteaRequestQueue(token: string): GiteaRequestExecutor {
  return createGiteaCompatibleRequestQueue(token, 'Gitea');
}

export function resolveGiteaApiBaseUrl(url?: string): string {
  return resolveGiteaCompatibleApiBaseUrl({
    url,
    providerName: 'Gitea',
    defaultUrl: DEFAULT_GITEA_URL,
    exampleUrl: 'https://gitea.example.com',
  });
}
