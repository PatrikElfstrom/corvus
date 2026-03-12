import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import type { AnyProviderManifest } from './manifest-types.ts';
import { createProviderRegistry } from './registry.ts';

function createManifest(
  id: AnyProviderManifest['id'],
  createAdapter: () => Promise<unknown>,
): AnyProviderManifest {
  return {
    id,
    displayName: id,
    optionsSchema: z.object({}).strict(),
    createAdapter: async () => createAdapter(),
    normalizeIntegration: ({ id: integrationId, enabled }) => ({
      id: integrationId,
      provider: id,
      enabled,
      fetchOptions: {
        username: 'user',
        match_author: ['user'],
        blacklist: [],
      },
    }),
  };
}

test('createProviderRegistry rejects duplicate provider manifest ids', () => {
  assert.throws(
    () =>
      createProviderRegistry([
        createManifest('github', async () => ({})),
        createManifest('github', async () => ({})),
      ]),
    {
      message: /duplicate provider manifest id/i,
    },
  );
});

test('createProviderRegistry resolves manifests by id', () => {
  const registry = createProviderRegistry([
    createManifest('github', async () => ({})),
    createManifest('filepath', async () => ({})),
  ]);

  assert.equal(registry.hasManifest('github'), true);
  assert.equal(registry.hasManifest('unknown'), false);
  assert.equal(registry.getManifest('github').id, 'github');
  assert.equal(registry.getManifestById('filepath')?.id, 'filepath');
  assert.equal(registry.getManifestById('unknown'), null);
});

test('loadAdapter caches adapters per provider id', async () => {
  let githubLoadCount = 0;
  let filepathLoadCount = 0;

  const registry = createProviderRegistry([
    createManifest('github', async () => {
      githubLoadCount += 1;
      return { id: 'github-adapter' };
    }),
    createManifest('filepath', async () => {
      filepathLoadCount += 1;
      return { id: 'filepath-adapter' };
    }),
  ]);

  const [githubFirst, githubSecond, filepathFirst, filepathSecond] =
    await Promise.all([
      registry.loadAdapter('github'),
      registry.loadAdapter('github'),
      registry.loadAdapter('filepath'),
      registry.loadAdapter('filepath'),
    ]);

  assert.equal(githubLoadCount, 1);
  assert.equal(filepathLoadCount, 1);
  assert.equal(githubFirst, githubSecond);
  assert.equal(filepathFirst, filepathSecond);
});
