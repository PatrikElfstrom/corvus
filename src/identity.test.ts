import assert from 'node:assert/strict';
import test from 'node:test';

import {
  commitMatchesIdentity,
  normalizeIdentityMatchers,
} from './identity.ts';

test('commitMatchesIdentity matches exact normalized name, email, or email local part', () => {
  const identityMatchers = normalizeIdentityMatchers([
    'Jane Doe',
    'jane@example.com',
    'jane',
  ]);

  assert.equal(
    commitMatchesIdentity('Jane Doe', 'jane@example.com', identityMatchers),
    true,
  );
  assert.equal(
    commitMatchesIdentity('JANE DOE', 'jane@example.com', identityMatchers),
    true,
  );
  assert.equal(
    commitMatchesIdentity('Alias', 'jane@example.com', identityMatchers),
    true,
  );
});

test('commitMatchesIdentity does not perform substring matching', () => {
  const identityMatchers = normalizeIdentityMatchers(['octo']);

  assert.equal(
    commitMatchesIdentity('octocat', 'octocat@example.com', identityMatchers),
    false,
  );
});
