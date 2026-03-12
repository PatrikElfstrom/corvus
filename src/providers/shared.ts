import { type FetchResponse, ofetch } from 'ofetch';
import type { ZodType } from 'zod';
import { logger } from '../logger.ts';

const DEFAULT_REQUEST_WINDOW_MS = 500;

export type RequestExecutor = (url: string) => Promise<FetchResponse<unknown>>;

interface RateLimitedRequestQueueOptions {
  headers: Record<string, string>;
  providerName: string;
  isRateLimited(response: Response): boolean;
  requestWindowMs?: number;
}

interface ResolveApiBaseUrlOptions {
  url?: string;
  defaultUrl: string;
  apiPath: string;
  providerName: string;
  exampleUrl: string;
}

interface FetchCommitsForAuthorFiltersOptions<TCommit> {
  authorFilters: Array<string>;
  fetchCommits(authorFilter?: string): Promise<Array<TCommit>>;
  getCommitKey(commit: TCommit): string;
}

interface FetchSequentialPagesUntilEmptyOptions<TItem> {
  fetchPage(page: number): Promise<Array<TItem>>;
  startPage?: number;
}

interface FetchDeduplicatedSequentialPagesOptions<TItem> {
  fetchPage(page: number): Promise<Array<TItem>>;
  getItemKey(item: TItem): string;
  onEmptyUniquePage?(page: number): void;
  startPage?: number;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function serializeErrorBody(data: unknown): string {
  if (typeof data === 'string') {
    return data;
  }

  if (data == null) {
    return '';
  }

  if (typeof data === 'object') {
    try {
      return JSON.stringify(data);
    } catch {
      return String(data);
    }
  }

  return String(data);
}

export function createRateLimitedRequestQueue(
  options: RateLimitedRequestQueueOptions,
): RequestExecutor {
  const { headers, providerName, isRateLimited } = options;
  const requestWindowMs = options.requestWindowMs ?? DEFAULT_REQUEST_WINDOW_MS;
  const http = ofetch.create({
    headers,
    retry: false,
    ignoreResponseError: true,
  });
  let lastRequestTime = 0;

  return async (url: string): Promise<FetchResponse<unknown>> => {
    const now = Date.now();
    const elapsed = now - lastRequestTime;

    if (elapsed < requestWindowMs) {
      await delay(requestWindowMs - elapsed);
    }

    lastRequestTime = Date.now();

    let response: FetchResponse<unknown>;
    try {
      response = await http.raw(url);
    } catch (error) {
      logger.error(
        { url, err: error },
        `${providerName} API request failed before receiving a response.`,
      );
      throw error;
    }

    if (isRateLimited(response)) {
      logger.warn({ url }, `${providerName} API rate limited request.`);
      throw Error(`${providerName} API rate limited request.`);
    }

    if (!response.ok) {
      const body = serializeErrorBody(response._data);
      logger.error(
        {
          url,
          status: response.status,
          statusText: response.statusText,
          body,
        },
        `${providerName} API request failed.`,
      );
      throw Error(`${providerName} API error ${response.status}: ${body}`);
    }

    return response;
  };
}

export async function fetchJsonWithSchema<T>(
  requestQueue: RequestExecutor,
  url: string,
  schema: ZodType<T>,
): Promise<T> {
  const response = await requestQueue(url);
  const payload =
    response._data === undefined ? await response.json() : response._data;
  return schema.parse(payload);
}

export async function fetchSequentialPagesUntilEmpty<TItem>(
  options: FetchSequentialPagesUntilEmptyOptions<TItem>,
): Promise<Array<TItem>> {
  const { fetchPage } = options;
  const items: Array<TItem> = [];
  let page = options.startPage ?? 1;

  for (;;) {
    const pageItems = await fetchPage(page);
    if (pageItems.length === 0) {
      break;
    }

    items.push(...pageItems);
    page++;
  }

  return items;
}

export async function fetchDeduplicatedSequentialPages<TItem>(
  options: FetchDeduplicatedSequentialPagesOptions<TItem>,
): Promise<Array<TItem>> {
  const { fetchPage, getItemKey, onEmptyUniquePage } = options;
  const items: Array<TItem> = [];
  const seenKeys = new Set<string>();
  let page = options.startPage ?? 1;

  for (;;) {
    const pageItems = await fetchPage(page);
    if (pageItems.length === 0) {
      break;
    }

    let uniqueItemsOnPage = 0;
    for (const item of pageItems) {
      const key = getItemKey(item);
      if (seenKeys.has(key)) {
        continue;
      }

      seenKeys.add(key);
      uniqueItemsOnPage++;
      items.push(item);
    }

    if (uniqueItemsOnPage === 0) {
      onEmptyUniquePage?.(page);
      break;
    }

    page++;
  }

  return items;
}

export function normalizeNonEmptyUniqueStrings(
  values: Array<string>,
): Array<string> {
  return Array.from(
    new Set(
      values.map((value) => value.trim()).filter((value) => value.length > 0),
    ),
  );
}

export function normalizeAuthorFilters(
  username: string,
  authorFilters?: Array<string>,
): Array<string> {
  return authorFilters === undefined
    ? [username]
    : normalizeNonEmptyUniqueStrings(authorFilters);
}

export function normalizeCaseInsensitiveMatchers(
  matchers: Array<string>,
): Array<string> {
  return normalizeNonEmptyUniqueStrings(
    matchers.map((value) => value.toLowerCase()),
  );
}

export function includesCaseInsensitiveMatcher(
  target: string,
  normalizedMatchers: Array<string>,
): boolean {
  if (normalizedMatchers.length === 0) {
    return false;
  }

  const normalizedTarget = target.toLowerCase();
  return normalizedMatchers.some((matcher) =>
    normalizedTarget.includes(matcher),
  );
}

export async function fetchCommitsForAuthorFilters<TCommit>(
  options: FetchCommitsForAuthorFiltersOptions<TCommit>,
): Promise<Array<TCommit>> {
  const { authorFilters, fetchCommits, getCommitKey } = options;
  const targetAuthorFilters =
    authorFilters.length > 0 ? authorFilters : [undefined];
  const commits: Array<TCommit> = [];
  const seenKeys = new Set<string>();

  for (const authorFilter of targetAuthorFilters) {
    const authorCommits = await fetchCommits(authorFilter);

    for (const commit of authorCommits) {
      const key = getCommitKey(commit);
      if (seenKeys.has(key)) {
        continue;
      }

      seenKeys.add(key);
      commits.push(commit);
    }
  }

  return commits;
}

export function withRepositoryFullName<TCommit extends object>(
  commit: TCommit,
  repositoryFullName: string,
): TCommit & { repository: { full_name: string } } {
  return {
    ...commit,
    repository: { full_name: repositoryFullName },
  };
}

export function encodePathSegments(path: string): string {
  return path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

export function resolveApiBaseUrl(options: ResolveApiBaseUrlOptions): string {
  const { defaultUrl, apiPath, exampleUrl, providerName, url } = options;
  const candidate = (url ?? defaultUrl).trim();

  if (!candidate) {
    throw Error(`${providerName} url is required.`);
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw Error(
      `Invalid ${providerName} url "${candidate}". Expected an absolute URL such as ${exampleUrl}.`,
    );
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw Error(
      `Invalid ${providerName} url "${candidate}". Expected an http:// or https:// URL.`,
    );
  }

  parsed.hash = '';
  parsed.search = '';

  const normalizedPath = parsed.pathname.replace(/\/+$/, '');
  const normalizedApiPath = apiPath.replace(/\/+$/, '').toLowerCase();
  if (normalizedPath.toLowerCase().endsWith(normalizedApiPath)) {
    parsed.pathname = normalizedPath;
  } else {
    parsed.pathname = `${normalizedPath}${apiPath}`;
  }

  return parsed.toString().replace(/\/$/, '');
}
