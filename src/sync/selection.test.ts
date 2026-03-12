import assert from 'node:assert/strict';
import test from 'node:test';
import type { ResolvedIntegration } from '../providers/index.ts';
import { resolveRequestedIntegrations } from './selection.ts';

function makeIntegration(id: string, enabled: boolean): ResolvedIntegration {
  return {
    id,
    provider: 'github',
    enabled,
    fetchOptions: {
      username: `${id}-user`,
      token: `${id}-token`,
      match_author: [`${id}-user`],
      blacklist: [],
    },
  };
}

test('resolveRequestedIntegrations returns requested enabled integrations in request order', () => {
  const configuredIntegrations = [
    makeIntegration('github-main', true),
    makeIntegration('gitlab-main', true),
    makeIntegration('other', true),
  ];

  const selectedIntegrations = resolveRequestedIntegrations(
    configuredIntegrations,
    ['gitlab-main', 'github-main', 'gitlab-main'],
  );

  assert.deepEqual(
    selectedIntegrations.map((integration) => integration.id),
    ['gitlab-main', 'github-main'],
  );
});

test('resolveRequestedIntegrations rejects unknown and disabled integrations', () => {
  const configuredIntegrations = [
    makeIntegration('github-main', true),
    makeIntegration('gitlab-main', false),
  ];

  assert.throws(
    () =>
      resolveRequestedIntegrations(configuredIntegrations, [
        'github-main',
        'gitlab-main',
        'missing',
      ]),
    {
      message:
        /Cannot sync requested integrations; unknown integration ids: missing; disabled integration ids: gitlab-main/i,
    },
  );
});

test('resolveRequestedIntegrations rejects duplicate configured ids for requested integrations', () => {
  const configuredIntegrations = [
    makeIntegration('github-main', true),
    makeIntegration('github-main', true),
  ];

  assert.throws(() =>
    resolveRequestedIntegrations(configuredIntegrations, ['github-main']),
  );
});
