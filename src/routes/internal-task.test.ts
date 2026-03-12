import assert from 'node:assert/strict';
import test from 'node:test';
import { createSyncTaskResponse } from './internal-task-sync-response.ts';

test('createSyncTaskResponse returns 202 for started sync triggers', () => {
  const response = createSyncTaskResponse(
    'sync:integrations',
    'Sync triggered.',
    {
      status: 'started',
      message: 'Sync triggered.',
    },
  );

  assert.equal(response.statusCode, 202);
  assert.deepEqual(response.body, {
    accepted: true,
    taskName: 'sync:integrations',
    message: 'Sync triggered.',
  });
});

test('createSyncTaskResponse returns 409 for busy sync triggers', () => {
  const response = createSyncTaskResponse(
    'sync:integrations',
    'Sync triggered.',
    {
      status: 'busy',
      message: 'Sync is currently active.',
    },
  );

  assert.equal(response.statusCode, 409);
  assert.deepEqual(response.body, {
    accepted: false,
    taskName: 'sync:integrations',
    message: 'Sync is currently active.',
  });
});
