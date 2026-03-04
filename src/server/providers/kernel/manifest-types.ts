import type { ZodType } from 'zod';
import type { AnyProviderAdapter } from '../types.ts';

export const PROVIDER_IDS = [
  'github',
  'bitbucket',
  'gitlab',
  'gitea',
  'forgejo',
  'filepath',
] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];

export interface ProviderFetchOptions {
  username: string;
  token?: string;
  match_author: Array<string>;
  blacklist: Array<string>;
  url?: string;
  path?: string;
  depth?: number;
}

export interface ResolvedIntegration {
  id: string;
  provider: ProviderId;
  enabled: boolean;
  fetchOptions: ProviderFetchOptions;
}

export interface ProviderManifest<TProviderId extends ProviderId, TOptions> {
  id: TProviderId;
  displayName: string;
  optionsSchema: ZodType<TOptions>;
  createAdapter(): Promise<AnyProviderAdapter>;
  normalizeIntegration(raw: {
    id: string;
    enabled: boolean;
    options: TOptions;
  }): ResolvedIntegration;
}

export type AnyProviderManifest = ProviderManifest<ProviderId, unknown>;
