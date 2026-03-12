import assert from 'node:assert/strict';
import test from 'node:test';

import { fetchAllCommits } from './commits.ts';
import type { GitHubRepositoryCommitItem } from './types.ts';

function makeRepositoryCommit(sha: string): GitHubRepositoryCommitItem {
  return {
    sha,
    commit: {
      author: {
        name: 'Jane Doe',
        email: 'jane@example.com',
        date: '2024-01-01T00:00:00Z',
      },
      message: `Commit ${sha}`,
      url: `https://api.github.com/repos/owner/repo/commits/${sha}`,
    },
    html_url: `https://github.com/owner/repo/commit/${sha}`,
  };
}

test('fetchAllCommits paginates repositories and commits', async () => {
  const calls: Array<string> = [];

  const requestQueue = (url: string): Promise<Response> => {
    calls.push(url);
    const parsed = new URL(url);
    const page = parsed.searchParams.get('page');

    if (parsed.pathname === '/user/repos') {
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

    if (parsed.pathname === '/repos/owner/repo-a/commits') {
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

    if (parsed.pathname === '/repos/owner/repo-b/commits') {
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

  const commits = await fetchAllCommits(requestQueue, 'octocat');

  assert.deepEqual(
    commits.map((commit) => commit.sha),
    ['a', 'b', 'c'],
  );
  assert.deepEqual(
    commits.map((commit) => commit.repository.full_name),
    ['owner/repo-a', 'owner/repo-a', 'owner/repo-b'],
  );
  assert.equal(calls.filter((url) => url.includes('/user/repos')).length, 2);
});

test('fetchAllCommits skips blacklisted repositories by partial name match', async () => {
  const calls: Array<string> = [];

  const requestQueue = (url: string): Promise<Response> => {
    calls.push(url);
    const parsed = new URL(url);
    const page = parsed.searchParams.get('page');

    if (parsed.pathname === '/user/repos') {
      if (page === '1') {
        return Promise.resolve(
          new Response(
            JSON.stringify([
              {
                full_name:
                  'stenametall/application/stenarecyling/reappli/android',
              },
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

    if (parsed.pathname === '/repos/owner/repo-b/commits') {
      return Promise.resolve(
        new Response(JSON.stringify([makeRepositoryCommit('allowed-sha')]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    }

    return Promise.reject(Error(`Unexpected URL: ${url}`));
  };

  const commits = await fetchAllCommits(
    requestQueue,
    'octocat',
    undefined,
    undefined,
    ['reappli/android'],
  );

  assert.deepEqual(
    commits.map((commit) => commit.repository.full_name),
    ['owner/repo-b'],
  );
  assert.equal(
    calls.some((url) =>
      url.includes(
        '/repos/stenametall/application/stenarecyling/reappli/android/commits',
      ),
    ),
    false,
  );
});

test('fetchAllCommits forwards since cursor to repository commit requests', async () => {
  const since = '2025-01-01T00:00:00.000Z';

  const requestQueue = (url: string): Promise<Response> => {
    const parsed = new URL(url);
    const page = parsed.searchParams.get('page');

    if (parsed.pathname === '/user/repos') {
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

    if (parsed.pathname === '/repos/owner/repo-a/commits') {
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

  const commits = await fetchAllCommits(
    requestQueue,
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

test('fetchAllCommits continues through all commit pages without search cap', async () => {
  let commitPageCalls = 0;

  const requestQueue = (url: string): Promise<Response> => {
    const parsed = new URL(url);
    const page = Number(parsed.searchParams.get('page') ?? '1');

    if (parsed.pathname === '/user/repos') {
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

    if (parsed.pathname === '/repos/owner/repo-a/commits') {
      commitPageCalls = Math.max(commitPageCalls, page);

      if (page <= 50) {
        const items = Array.from({ length: 100 }, (_, index) =>
          makeRepositoryCommit(`sha-${(page - 1) * 100 + index}`),
        );
        return Promise.resolve(
          new Response(JSON.stringify(items), {
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

  const commits = await fetchAllCommits(requestQueue, 'octocat');

  assert.equal(commits.length, 5000);
  assert.equal(commitPageCalls, 51);
});

test('fetchAllCommits can fetch all authors when author filters are empty', async () => {
  const requestQueue = (url: string): Promise<Response> => {
    const parsed = new URL(url);
    const page = Number(parsed.searchParams.get('page') ?? '1');

    if (parsed.pathname === '/user/repos') {
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

    if (parsed.pathname === '/repos/owner/repo-a/commits') {
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

  const commits = await fetchAllCommits(requestQueue, 'octocat', []);

  assert.deepEqual(
    commits.map((commit) => commit.sha),
    ['a', 'b'],
  );
});

test('fetchAllCommits skips repositories with failing commit endpoints', async () => {
  const requestQueue = (url: string): Promise<Response> => {
    const parsed = new URL(url);
    const page = Number(parsed.searchParams.get('page') ?? '1');

    if (parsed.pathname === '/user/repos') {
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

    if (parsed.pathname === '/repos/owner/repo-a/commits') {
      return Promise.resolve(
        new Response(JSON.stringify([makeRepositoryCommit('ok-1')]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    }

    if (parsed.pathname === '/repos/owner/repo-b/commits') {
      return Promise.reject(
        Error(
          'GitHub API error 403: {"message":"Resource not accessible by personal access token"}',
        ),
      );
    }

    return Promise.reject(Error(`Unexpected URL: ${url}`));
  };

  const commits = await fetchAllCommits(requestQueue, 'octocat');

  assert.equal(commits.length, 1);
  assert.equal(commits[0]?.sha, 'ok-1');
  assert.equal(commits[0]?.repository.full_name, 'owner/repo-a');
});
