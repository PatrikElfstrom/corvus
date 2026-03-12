import assert from 'node:assert/strict';
import test from 'node:test';

import { fetchAllBitbucketCommits, parseAuthorRaw } from './commits.ts';
import type {
  BitbucketCommit,
  BitbucketRepository,
  BitbucketWorkspaceAccess,
} from './types.ts';

function makeWorkspaceAccess(slug: string): BitbucketWorkspaceAccess {
  return {
    administrator: false,
    type: 'workspace_membership',
    workspace: {
      links: {
        avatar: { href: `https://bitbucket.org/${slug}/avatar.png` },
        self: { href: `https://bitbucket.org/${slug}` },
      },
      slug,
      type: 'workspace',
      uuid: `{${slug}}`,
    },
  };
}

function makeRepository(fullName: string): BitbucketRepository {
  const slug = fullName.split('/').at(-1) ?? fullName;
  return {
    uuid: `{${slug}}`,
    full_name: fullName,
    name: slug,
    slug,
    links: {
      html: { href: `https://bitbucket.org/${fullName}` },
      self: { href: `https://api.bitbucket.org/2.0/repositories/${fullName}` },
    },
  };
}

function makeCommit(
  hash: string,
  date = '2024-01-01T00:00:00Z',
): BitbucketCommit {
  return {
    hash,
    message: `Commit ${hash}`,
    date,
    author: { raw: 'octocat <octocat@example.com>' },
    links: {
      html: { href: `https://bitbucket.org/owner/repo/commits/${hash}` },
      self: { href: `https://api.bitbucket.org/2.0/commits/${hash}` },
    },
  };
}

test('fetchAllBitbucketCommits skips blacklisted repositories by partial name match', async () => {
  const calls: Array<string> = [];

  const requestQueue = (url: string): Promise<Response> => {
    calls.push(url);
    const parsed = new URL(url);

    if (parsed.pathname === '/2.0/user/workspaces') {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            pagelen: 100,
            values: [makeWorkspaceAccess('stenametall')],
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
      );
    }

    if (parsed.pathname === '/2.0/repositories/stenametall') {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            pagelen: 100,
            values: [
              makeRepository(
                'stenametall/application/stenarecyling/reappli/android',
              ),
              makeRepository('owner/repo-b'),
            ],
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
      );
    }

    if (parsed.pathname === '/2.0/repositories/owner/repo-b/commits') {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            pagelen: 100,
            values: [makeCommit('allowed-sha')],
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
      );
    }

    return Promise.reject(Error(`Unexpected URL: ${url}`));
  };

  const commits = await fetchAllBitbucketCommits(requestQueue, undefined, [
    'reappli/android',
  ]);

  assert.equal(commits.length, 1);
  assert.equal(commits[0]?.repository?.full_name, 'owner/repo-b');
  assert.equal(
    calls.some((url) =>
      url.includes(
        '/2.0/repositories/stenametall/application/stenarecyling/reappli/android/commits',
      ),
    ),
    false,
  );
});

test('fetchAllBitbucketCommits stops paging once commits are older than since', async () => {
  const calls: Array<string> = [];
  const since = '2024-01-15T00:00:00.000Z';

  const requestQueue = (url: string): Promise<Response> => {
    calls.push(url);
    const parsed = new URL(url);
    const page = parsed.searchParams.get('page');

    if (parsed.pathname === '/2.0/user/workspaces') {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            pagelen: 100,
            values: [makeWorkspaceAccess('owner')],
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
      );
    }

    if (parsed.pathname === '/2.0/repositories/owner') {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            pagelen: 100,
            values: [makeRepository('owner/repo-a')],
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
      );
    }

    if (parsed.pathname === '/2.0/repositories/owner/repo-a/commits') {
      if (page === '2') {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              pagelen: 100,
              values: [makeCommit('should-not-be-fetched')],
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            },
          ),
        );
      }

      return Promise.resolve(
        new Response(
          JSON.stringify({
            pagelen: 100,
            values: [
              makeCommit('newer-commit', '2024-01-20T00:00:00Z'),
              makeCommit('older-commit', '2024-01-10T00:00:00Z'),
            ],
            next: 'https://api.bitbucket.org/2.0/repositories/owner/repo-a/commits?page=2',
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
      );
    }

    return Promise.reject(Error(`Unexpected URL: ${url}`));
  };

  const commits = await fetchAllBitbucketCommits(
    requestQueue,
    undefined,
    [],
    since,
  );

  assert.equal(commits.length, 1);
  assert.equal(commits[0]?.hash, 'newer-commit');
  assert.equal(
    calls.some((url) =>
      url.includes('/2.0/repositories/owner/repo-a/commits?page=2'),
    ),
    false,
  );
});

test('fetchAllBitbucketCommits stops paging when a commit page only repeats known hashes', async () => {
  const calls: Array<string> = [];

  const requestQueue = (url: string): Promise<Response> => {
    calls.push(url);
    const parsed = new URL(url);
    const page = parsed.searchParams.get('page');

    if (parsed.pathname === '/2.0/user/workspaces') {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            pagelen: 100,
            values: [makeWorkspaceAccess('owner')],
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
      );
    }

    if (parsed.pathname === '/2.0/repositories/owner') {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            pagelen: 100,
            values: [makeRepository('owner/repo-a')],
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
      );
    }

    if (parsed.pathname === '/2.0/repositories/owner/repo-a/commits') {
      if (page === '2') {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              pagelen: 100,
              values: [makeCommit('same-hash')],
              next: 'https://api.bitbucket.org/2.0/repositories/owner/repo-a/commits?page=3',
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            },
          ),
        );
      }

      return Promise.resolve(
        new Response(
          JSON.stringify({
            pagelen: 100,
            values: [makeCommit('same-hash')],
            next: 'https://api.bitbucket.org/2.0/repositories/owner/repo-a/commits?page=2',
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
      );
    }

    return Promise.reject(Error(`Unexpected URL: ${url}`));
  };

  const commits = await fetchAllBitbucketCommits(requestQueue);

  assert.equal(commits.length, 1);
  assert.equal(commits[0]?.hash, 'same-hash');
  assert.equal(
    calls.some((url) =>
      url.includes('/2.0/repositories/owner/repo-a/commits?page=3'),
    ),
    false,
  );
});

test('parseAuthorRaw parses angle-bracket author format', () => {
  assert.deepEqual(parseAuthorRaw('Jane Doe <jane@example.com>'), {
    name: 'Jane Doe',
    email: 'jane@example.com',
  });
});
