export interface NormalisedCommit {
  sha: string;
  author_name: string;
  author_email: string;
  authored_at: string;
}

export type SyncFailureTargetType =
  | 'repository'
  | 'project'
  | 'workspace'
  | 'sync';

export interface ProviderFailure {
  targetType: SyncFailureTargetType;
  targetName: string;
  repositoryFullName: string | null;
  commitHash: string | null;
  statusCode: number | null;
  message: string;
}

export interface ProviderFetchContext<TFailure, TRequestQueue> {
  requestQueue: TRequestQueue;
  username: string;
  additionalMatchers: Array<string>;
  blacklist: Array<string>;
  since?: string;
  apiBaseUrl?: string;
  path?: string;
  depth?: number;
  onFailure(failure: TFailure): void;
}

export interface ProviderAdapter<TCommit, TFailure, TRequestQueue> {
  shouldFilterClientSide(additionalMatchers: Array<string>): boolean;
  createRequestQueue(username: string, token: string): TRequestQueue;
  resolveApiBaseUrl?(url?: string): string;
  fetchCommits(
    context: ProviderFetchContext<TFailure, TRequestQueue>,
  ): Promise<Array<TCommit>>;
  normaliseCommit(commit: TCommit): NormalisedCommit;
  extractRepositoryFullName(commit: TCommit): string | null;
  normaliseFailure(failure: TFailure): ProviderFailure;
}

export type AnyProviderAdapter = ProviderAdapter<unknown, unknown, unknown>;

export function defineProviderAdapter<TCommit, TFailure, TRequestQueue>(
  adapter: ProviderAdapter<TCommit, TFailure, TRequestQueue>,
): ProviderAdapter<TCommit, TFailure, TRequestQueue> {
  return adapter;
}

export function requireResolvedApiBaseUrl(
  apiBaseUrl: string | undefined,
  provider: string,
): string {
  if (apiBaseUrl) {
    return apiBaseUrl;
  }

  throw Error(`Resolved ${provider} API base URL is required.`);
}
