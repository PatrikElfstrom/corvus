import {
  createGiteaCompatibleRequestQueue,
  resolveGiteaCompatibleApiBaseUrl,
} from '../gitea/client.ts';

export function createForgejoRequestQueue(token: string) {
  return createGiteaCompatibleRequestQueue(token, 'Forgejo');
}

export function resolveForgejoApiBaseUrl(url?: string): string {
  return resolveGiteaCompatibleApiBaseUrl({
    url,
    providerName: 'Forgejo',
    exampleUrl: 'https://forgejo.example.com',
  });
}
