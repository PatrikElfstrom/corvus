import assert from 'node:assert/strict';
import test from 'node:test';
import { bitbucketManifest } from './bitbucket/manifest.ts';
import { filepathManifest } from './file/manifest.ts';
import { forgejoManifest } from './forgejo/manifest.ts';
import { giteaManifest } from './gitea/manifest.ts';
import { githubManifest } from './github/manifest.ts';
import { gitlabManifest } from './gitlab/manifest.ts';

test('remote manifests validate baseline payloads and normalize author_include default', () => {
  for (const manifest of [
    githubManifest,
    gitlabManifest,
    bitbucketManifest,
    giteaManifest,
  ]) {
    const parsed = manifest.optionsSchema.safeParse({
      auth: {
        username: 'octocat',
        token: 'token',
      },
    });

    assert.equal(parsed.success, true);
    if (!parsed.success) {
      continue;
    }

    const normalized = manifest.normalizeIntegration({
      id: `${manifest.id}-main`,
      enabled: true,
      options: parsed.data,
    });

    assert.deepEqual(normalized.fetchOptions.match_author, ['octocat']);
    assert.equal(normalized.provider, manifest.id);
  }
});

test('forgejo manifest requires source.base_url', () => {
  const missingBaseUrl = forgejoManifest.optionsSchema.safeParse({
    auth: {
      username: 'forgejo-user',
      token: 'token',
    },
  });

  assert.equal(missingBaseUrl.success, false);

  const withBaseUrl = forgejoManifest.optionsSchema.safeParse({
    auth: {
      username: 'forgejo-user',
      token: 'token',
    },
    source: {
      base_url: 'https://forgejo.example.com',
    },
  });

  assert.equal(withBaseUrl.success, true);
});

test('manifests reject unknown option keys', () => {
  const remoteWithUnknownKey = githubManifest.optionsSchema.safeParse({
    auth: {
      username: 'octocat',
      token: 'token',
    },
    typo_field: true,
  });
  assert.equal(remoteWithUnknownKey.success, false);

  const filepathWithUnknownKey = filepathManifest.optionsSchema.safeParse({
    source: {
      path: '/tmp/repos',
    },
    filters: {
      author_include: ['user@example.com'],
    },
    typo_field: true,
  });
  assert.equal(filepathWithUnknownKey.success, false);
});

test('filepath manifest requires non-empty author_include and absolute path', () => {
  const missingAuthors = filepathManifest.optionsSchema.safeParse({
    source: {
      path: '/tmp/repos',
    },
    filters: {
      author_include: [],
    },
  });
  assert.equal(missingAuthors.success, false);

  const relativePath = filepathManifest.optionsSchema.safeParse({
    source: {
      path: './repos',
    },
    filters: {
      author_include: ['user@example.com'],
    },
  });
  assert.equal(relativePath.success, false);

  const valid = filepathManifest.optionsSchema.safeParse({
    source: {
      path: '/tmp/repos',
      depth: 0,
    },
    filters: {
      author_include: ['user@example.com'],
      repository_exclude: ['archive'],
    },
  });

  assert.equal(valid.success, true);
});
