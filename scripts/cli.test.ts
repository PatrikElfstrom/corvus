import assert from 'node:assert/strict';
import test from 'node:test';

import { parseCliArgs, runSync } from './cli.ts';

test('parseCliArgs accepts sync with multiple integration ids', () => {
  assert.deepEqual(parseCliArgs(['sync', 'github-main', 'gitlab-main']), {
    command: 'sync',
    integrationIds: ['github-main', 'gitlab-main'],
    ignoreDateScope: true,
  });
  assert.equal(parseCliArgs(['status']), null);
});

test('parseCliArgs accepts the partial flag anywhere in the sync command', () => {
  assert.deepEqual(parseCliArgs(['sync', '--partial', 'github-main']), {
    command: 'sync',
    integrationIds: ['github-main'],
    ignoreDateScope: false,
  });
  assert.equal(parseCliArgs(['sync', '--unknown-option']), null);
  assert.equal(parseCliArgs(['sync', '--all-commits']), null);
});

test('runSync posts requested integration ids as a full-history sync by default', async () => {
  let requestUrl = '';
  let requestInit: RequestInit | undefined;

  const exitCode = await runSync(
    ['github-main', 'gitlab-main'],
    {},
    async (input, init) => {
      requestUrl = String(input);
      requestInit = init;

      return new Response(
        JSON.stringify({
          message:
            'Sync triggered for 2 integrations: github-main, gitlab-main. Check server logs for progress and result.',
        }),
        {
          status: 202,
          headers: {
            'content-type': 'application/json',
          },
        },
      );
    },
  );

  assert.equal(exitCode, 0);
  assert.match(requestUrl, /\/_internal\/tasks\/sync:integrations$/);
  assert.equal(requestInit?.method, 'POST');
  assert.equal(
    requestInit?.body,
    JSON.stringify({
      integrationIds: ['github-main', 'gitlab-main'],
      ignoreDateScope: true,
    }),
  );
});

test('runSync posts ignoreDateScope false for partial syncs', async () => {
  let requestInit: RequestInit | undefined;

  const exitCode = await runSync(
    ['github-main'],
    {
      ignoreDateScope: false,
    },
    async (_input, init) => {
      requestInit = init;

      return new Response(null, {
        status: 202,
      });
    },
  );

  assert.equal(exitCode, 0);
  assert.equal(
    requestInit?.body,
    JSON.stringify({
      integrationIds: ['github-main'],
      ignoreDateScope: false,
    }),
  );
});

test('runSync exits with an error when sync is already active', async () => {
  const originalConsoleError = console.error;
  const capturedErrors: Array<string> = [];
  console.error = (...args: Array<unknown>) => {
    capturedErrors.push(args.map((value) => String(value)).join(' '));
  };

  try {
    const exitCode = await runSync([], {}, async () => {
      return new Response(
        JSON.stringify({
          message: 'Sync is currently active.',
        }),
        {
          status: 409,
          statusText: 'Conflict',
          headers: {
            'content-type': 'application/json',
          },
        },
      );
    });

    assert.equal(exitCode, 1);
    assert.ok(
      capturedErrors.some((line) => line.includes('Sync is currently active.')),
    );
  } finally {
    console.error = originalConsoleError;
  }
});
