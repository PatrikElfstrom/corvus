import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveGitLabApiBaseUrl } from './client.ts';

test('resolveGitLabApiBaseUrl appends api prefix and strips trailing slash', () => {
  assert.equal(
    resolveGitLabApiBaseUrl('https://gitlab.example.com/'),
    'https://gitlab.example.com/api/v4',
  );
});

test('resolveGitLabApiBaseUrl keeps explicit api prefix', () => {
  assert.equal(
    resolveGitLabApiBaseUrl('https://gitlab.example.com/api/v4/'),
    'https://gitlab.example.com/api/v4',
  );
});

test('resolveGitLabApiBaseUrl falls back to default gitlab.com url', () => {
  assert.equal(resolveGitLabApiBaseUrl(), 'https://gitlab.com/api/v4');
});
