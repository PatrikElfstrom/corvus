import assert from 'node:assert/strict';
import test from 'node:test';

import {
  fetchAllGiteaCommits,
  type GiteaRepositoryFailure,
} from './commits.ts';
import type { GiteaRepositoryCommitItem } from './types.ts';

function makeRepositoryCommit(sha: string): GiteaRepositoryCommitItem {
  return {
    sha,
    commit: {
      author: {
        name: 'Jane Doe',
        email: 'jane@example.com',
        date: '2024-01-01T00:00:00Z',
      },
      message: `Commit ${sha}`,
      url: `https://gitea.example.com/api/v1/repos/owner/repo/commits/${sha}`,
    },
    html_url: `https://gitea.example.com/owner/repo/commit/${sha}`,
  };
}

test('fetchAllGiteaCommits paginates repositories and commits', async () => {
  const calls: Array<string> = [];

  const requestQueue = (url: string): Promise<Response> => {
    calls.push(url);
    const parsed = new URL(url);
    const page = parsed.searchParams.get('page');

    if (parsed.pathname === '/api/v1/user/repos') {
      if (page === '1') {
        return Promise.resolve(
          new Response(
            JSON.stringify([
              { full_name: 'owner/repo-a' },
              { full_name: 'owner/repo-b' },
            ]),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            },
          ),
        );
      }

      return Promise.resolve(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    }

    if (parsed.pathname === '/api/v1/repos/owner/repo-a/commits') {
      assert.equal(parsed.searchParams.get('author'), 'octocat');

      if (page === '1') {
        return Promise.resolve(
          new Response(
            JSON.stringify([
              makeRepositoryCommit('a'),
              makeRepositoryCommit('b'),
            ]),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            },
          ),
        );
      }

      return Promise.resolve(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    }

    if (parsed.pathname === '/api/v1/repos/owner/repo-b/commits') {
      assert.equal(parsed.searchParams.get('author'), 'octocat');

      if (page === '1') {
        return Promise.resolve(
          new Response(JSON.stringify([makeRepositoryCommit('c')]), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        );
      }

      return Promise.resolve(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    }

    return Promise.reject(Error(`Unexpected URL: ${url}`));
  };

  const commits = await fetchAllGiteaCommits(
    requestQueue,
    'https://gitea.example.com/api/v1',
    'octocat',
  );

  assert.deepEqual(
    commits.map((commit) => commit.sha),
    ['a', 'b', 'c'],
  );
  assert.deepEqual(
    commits.map((commit) => commit.repository.full_name),
    ['owner/repo-a', 'owner/repo-a', 'owner/repo-b'],
  );
  assert.equal(
    calls.filter((url) => url.includes('/api/v1/user/repos')).length,
    2,
  );
});

test('fetchAllGiteaCommits skips blacklisted repositories by partial name match', async () => {
  const calls: Array<string> = [];

  const requestQueue = (url: string): Promise<Response> => {
    calls.push(url);
    const parsed = new URL(url);
    const page = parsed.searchParams.get('page');

    if (parsed.pathname === '/api/v1/user/repos') {
      if (page === '1') {
        return Promise.resolve(
          new Response(
            JSON.stringify([
              { full_name: 'stenametall/reappli-android' },
              { full_name: 'owner/repo-b' },
            ]),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            },
          ),
        );
      }

      return Promise.resolve(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    }

    if (parsed.pathname === '/api/v1/repos/owner/repo-b/commits') {
      return Promise.resolve(
        new Response(JSON.stringify([makeRepositoryCommit('allowed-sha')]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    }

    return Promise.reject(Error(`Unexpected URL: ${url}`));
  };

  const commits = await fetchAllGiteaCommits(
    requestQueue,
    'https://gitea.example.com/api/v1',
    'octocat',
    undefined,
    undefined,
    ['reappli-android'],
  );

  assert.deepEqual(
    commits.map((commit) => commit.repository.full_name),
    ['owner/repo-b'],
  );
  assert.equal(
    calls.some((url) =>
      url.includes('/api/v1/repos/stenametall/reappli-android/commits'),
    ),
    false,
  );
});

test('fetchAllGiteaCommits forwards since cursor to commit requests', async () => {
  const since = '2025-01-01T00:00:00.000Z';

  const requestQueue = (url: string): Promise<Response> => {
    const parsed = new URL(url);
    const page = parsed.searchParams.get('page');

    if (parsed.pathname === '/api/v1/user/repos') {
      if (page === '1') {
        return Promise.resolve(
          new Response(JSON.stringify([{ full_name: 'owner/repo-a' }]), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        );
      }

      return Promise.resolve(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    }

    if (parsed.pathname === '/api/v1/repos/owner/repo-a/commits') {
      assert.equal(parsed.searchParams.get('since'), since);

      if (page === '1') {
        return Promise.resolve(
          new Response(JSON.stringify([makeRepositoryCommit('a')]), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        );
      }

      return Promise.resolve(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    }

    return Promise.reject(Error(`Unexpected URL: ${url}`));
  };

  const commits = await fetchAllGiteaCommits(
    requestQueue,
    'https://gitea.example.com/api/v1',
    'octocat',
    undefined,
    undefined,
    [],
    since,
  );

  assert.deepEqual(
    commits.map((commit) => commit.sha),
    ['a'],
  );
});

test('fetchAllGiteaCommits can fetch all authors when author filters are empty', async () => {
  const requestQueue = (url: string): Promise<Response> => {
    const parsed = new URL(url);
    const page = Number(parsed.searchParams.get('page') ?? '1');

    if (parsed.pathname === '/api/v1/user/repos') {
      if (page === 1) {
        return Promise.resolve(
          new Response(JSON.stringify([{ full_name: 'owner/repo-a' }]), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        );
      }

      return Promise.resolve(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    }

    if (parsed.pathname === '/api/v1/repos/owner/repo-a/commits') {
      assert.equal(parsed.searchParams.get('author'), null);

      if (page === 1) {
        return Promise.resolve(
          new Response(
            JSON.stringify([
              makeRepositoryCommit('a'),
              makeRepositoryCommit('b'),
            ]),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            },
          ),
        );
      }

      return Promise.resolve(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    }

    return Promise.reject(Error(`Unexpected URL: ${url}`));
  };

  const commits = await fetchAllGiteaCommits(
    requestQueue,
    'https://gitea.example.com/api/v1',
    'octocat',
    [],
  );

  assert.deepEqual(
    commits.map((commit) => commit.sha),
    ['a', 'b'],
  );
});

test('fetchAllGiteaCommits skips repositories with failing commit endpoints', async () => {
  const failures: Array<GiteaRepositoryFailure> = [];

  const requestQueue = (url: string): Promise<Response> => {
    const parsed = new URL(url);
    const page = Number(parsed.searchParams.get('page') ?? '1');

    if (parsed.pathname === '/api/v1/user/repos') {
      if (page === 1) {
        return Promise.resolve(
          new Response(
            JSON.stringify([
              { full_name: 'owner/repo-a' },
              { full_name: 'owner/repo-b' },
            ]),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            },
          ),
        );
      }

      return Promise.resolve(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    }

    if (parsed.pathname === '/api/v1/repos/owner/repo-a/commits') {
      return Promise.resolve(
        new Response(JSON.stringify([makeRepositoryCommit('ok-1')]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    }

    if (parsed.pathname === '/api/v1/repos/owner/repo-b/commits') {
      return Promise.reject(
        Error('Gitea API error 404: {"message":"Missing"}'),
      );
    }

    return Promise.reject(Error(`Unexpected URL: ${url}`));
  };

  const commits = await fetchAllGiteaCommits(
    requestQueue,
    'https://gitea.example.com/api/v1',
    'octocat',
    undefined,
    (failure) => {
      failures.push(failure);
    },
  );

  assert.equal(commits.length, 1);
  assert.equal(commits[0]?.sha, 'ok-1');
  assert.equal(commits[0]?.repository.full_name, 'owner/repo-a');
  assert.deepEqual(failures, [
    {
      repositoryFullName: 'owner/repo-b',
      message: 'Missing',
      statusCode: 404,
      commitHash: null,
    },
  ]);
});
