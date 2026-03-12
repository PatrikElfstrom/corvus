import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveForgejoApiBaseUrl } from './client.ts';

test('resolveForgejoApiBaseUrl appends api prefix and strips trailing slash', () => {
  assert.equal(
    resolveForgejoApiBaseUrl('https://forgejo.example.com/'),
    'https://forgejo.example.com/api/v1',
  );
});

test('resolveForgejoApiBaseUrl keeps explicit api prefix', () => {
  assert.equal(
    resolveForgejoApiBaseUrl('https://forgejo.example.com/api/v1/'),
    'https://forgejo.example.com/api/v1',
  );
});

test('resolveForgejoApiBaseUrl requires an explicit url', () => {
  assert.throws(() => resolveForgejoApiBaseUrl(), {
    message: /forgejo url is required/i,
  });
});
