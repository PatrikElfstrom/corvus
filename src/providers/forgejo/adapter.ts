import { createGiteaCompatibleProviderAdapter } from '../gitea/adapter.ts';
import {
  createForgejoRequestQueue,
  resolveForgejoApiBaseUrl,
} from './client.ts';

export const providerAdapter = createGiteaCompatibleProviderAdapter({
  provider: 'forgejo',
  providerName: 'Forgejo',
  createRequestQueue: createForgejoRequestQueue,
  resolveApiBaseUrl: resolveForgejoApiBaseUrl,
});
