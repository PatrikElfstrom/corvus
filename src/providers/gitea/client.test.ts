import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveGiteaApiBaseUrl } from './client.ts';

test('resolveGiteaApiBaseUrl appends api prefix and strips trailing slash', () => {
  assert.equal(
    resolveGiteaApiBaseUrl('https://gitea.example.com/'),
    'https://gitea.example.com/api/v1',
  );
});

test('resolveGiteaApiBaseUrl keeps explicit api prefix', () => {
  assert.equal(
    resolveGiteaApiBaseUrl('https://gitea.example.com/api/v1/'),
    'https://gitea.example.com/api/v1',
  );
});

test('resolveGiteaApiBaseUrl falls back to default gitea.com url', () => {
  assert.equal(resolveGiteaApiBaseUrl(), 'https://gitea.com/api/v1');
});
