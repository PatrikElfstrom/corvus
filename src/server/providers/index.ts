import { bitbucketManifest } from './bitbucket/manifest.ts';
import { filepathManifest } from './file/manifest.ts';
import { forgejoManifest } from './forgejo/manifest.ts';
import { giteaManifest } from './gitea/manifest.ts';
import { githubManifest } from './github/manifest.ts';
import { gitlabManifest } from './gitlab/manifest.ts';
import type {
  AnyProviderManifest,
  ProviderId,
  ResolvedIntegration,
} from './kernel/manifest-types.ts';
import { createProviderRegistry } from './kernel/registry.ts';
import type { AnyProviderAdapter } from './types.ts';

const manifests = [
  githubManifest,
  gitlabManifest,
  bitbucketManifest,
  giteaManifest,
  forgejoManifest,
  filepathManifest,
] satisfies Array<AnyProviderManifest>;

export const providerRegistry = createProviderRegistry(manifests);

export const PROVIDERS = [...providerRegistry.providerIds];

export type Provider = ProviderId;

export function hasProviderManifest(
  providerId: string,
): providerId is Provider {
  return providerRegistry.hasManifest(providerId);
}

export function getProviderManifest(providerId: Provider): AnyProviderManifest {
  return providerRegistry.getManifest(providerId);
}

export function getProviderManifestById(
  providerId: string,
): AnyProviderManifest | null {
  return providerRegistry.getManifestById(providerId);
}

export function loadProviderAdapter(
  provider: Provider,
): Promise<AnyProviderAdapter> {
  return providerRegistry.loadAdapter(provider);
}

export type { ResolvedIntegration };
