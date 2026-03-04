import assert from 'node:assert/strict';
import test from 'node:test';
import type { TaskContext } from 'nitro/types';

import { parseSyncIntegrationsTaskPayload } from './sync-integrations-payload.ts';
import {
  resolveSyncTriggerSource,
  runSyncIntegrationsTask,
} from './sync-integrations-runner.ts';

test('parseSyncIntegrationsTaskPayload accepts integration ids and ignoreDateScope', () => {
  assert.deepEqual(
    parseSyncIntegrationsTaskPayload({
      integrationIds: ['github-main', 'gitlab-main'],
      ignoreDateScope: true,
    }),
    {
      integrationIds: ['github-main', 'gitlab-main'],
      ignoreDateScope: true,
    },
  );
});

test('parseSyncIntegrationsTaskPayload preserves false ignoreDateScope values', () => {
  assert.deepEqual(
    parseSyncIntegrationsTaskPayload({
      integrationIds: ['github-main'],
      ignoreDateScope: false,
    }),
    {
      integrationIds: ['github-main'],
      ignoreDateScope: false,
    },
  );
});

test('parseSyncIntegrationsTaskPayload rejects non-boolean ignoreDateScope values', () => {
  assert.throws(
    () =>
      parseSyncIntegrationsTaskPayload({
        ignoreDateScope: 'true',
      }),
    {
      message: /ignoreDateScope/i,
    },
  );
});

test('parseSyncIntegrationsTaskPayload ignores unrelated payload keys', () => {
  assert.deepEqual(
    parseSyncIntegrationsTaskPayload({
      scheduledTime: Date.now(),
    }),
    {},
  );
});

test('parseSyncIntegrationsTaskPayload accepts null payload by returning defaults', () => {
  assert.deepEqual(parseSyncIntegrationsTaskPayload(null), {});
});

test('resolveSyncTriggerSource maps corvus-cli to manual and defaults to scheduled', () => {
  assert.equal(
    resolveSyncTriggerSource({ trigger: 'corvus-cli' } as TaskContext),
    'manual',
  );
  assert.equal(resolveSyncTriggerSource({} as TaskContext), 'scheduled');
});

test('runSyncIntegrationsTask forwards parsed payload and resolved source', async () => {
  const received: Array<{
    source: string;
    integrationIds?: Array<string>;
    ignoreDateScope?: boolean;
  }> = [];

  const result = await runSyncIntegrationsTask(
    {
      integrationIds: ['github-main'],
      ignoreDateScope: false,
    },
    { trigger: 'corvus-cli' } as TaskContext,
    {
      triggerSync: async (options) => {
        received.push(options);
        return {
          status: 'started',
          message: 'Sync triggered.',
        };
      },
    },
  );

  assert.deepEqual(received, [
    {
      source: 'manual',
      integrationIds: ['github-main'],
      ignoreDateScope: false,
    },
  ]);
  assert.deepEqual(result, {
    status: 'started',
    message: 'Sync triggered.',
  });
});
