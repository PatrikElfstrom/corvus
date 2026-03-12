import assert from 'node:assert/strict';
import test from 'node:test';

import { fetchAllGitLabCommits } from './commits.ts';
import type { GitLabCommit, GitLabProject } from './types.ts';

function makeProject(id: number, fullName: string): GitLabProject {
  return {
    id,
    path_with_namespace: fullName,
    web_url: `https://gitlab.com/${fullName}`,
  };
}

function makeCommit(id: string): GitLabCommit {
  return {
    id,
    message: `Commit ${id}`,
    authored_date: '2024-01-01T00:00:00Z',
    author_name: 'octocat',
    author_email: 'octocat@example.com',
    web_url: `https://gitlab.com/owner/repo/-/commit/${id}`,
  };
}

test('fetchAllGitLabCommits paginates projects and commit pages', async () => {
  const calls: Array<string> = [];

  const requestQueue = (url: string): Promise<Response> => {
    calls.push(url);
    const parsed = new URL(url);
    const page = parsed.searchParams.get('page');

    if (parsed.pathname === '/api/v4/projects') {
      if (page === '1') {
        return Promise.resolve(
          new Response(
            JSON.stringify([
              makeProject(1, 'owner/repo-a'),
              makeProject(2, 'owner/repo-b'),
            ]),
            {
              status: 200,
              headers: {
                'content-type': 'application/json',
                'x-next-page': '2',
              },
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

    if (parsed.pathname === '/api/v4/projects/1/repository/commits') {
      if (page === '1') {
        return Promise.resolve(
          new Response(JSON.stringify([makeCommit('a')]), {
            status: 200,
            headers: {
              'content-type': 'application/json',
              'x-next-page': '2',
            },
          }),
        );
      }

      return Promise.resolve(
        new Response(JSON.stringify([makeCommit('b')]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    }

    if (parsed.pathname === '/api/v4/projects/2/repository/commits') {
      return Promise.resolve(
        new Response(JSON.stringify([makeCommit('c')]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    }

    return Promise.reject(Error(`Unexpected URL: ${url}`));
  };

  const commits = await fetchAllGitLabCommits(requestQueue, 'octocat');

  assert.equal(commits.length, 3);
  assert.deepEqual(
    commits.map((commit) => commit.id),
    ['a', 'b', 'c'],
  );
  assert.deepEqual(
    commits.map((commit) => commit.repository.full_name),
    ['owner/repo-a', 'owner/repo-a', 'owner/repo-b'],
  );
  assert.equal(
    calls.filter((url) => url.includes('/repository/commits')).length,
    3,
  );
});

test('fetchAllGitLabCommits supports custom GitLab API base url', async () => {
  const requestQueue = (url: string): Promise<Response> => {
    const parsed = new URL(url);
    assert.equal(parsed.origin, 'https://gitlab.internal.example');

    if (parsed.pathname === '/api/v4/projects') {
      return Promise.resolve(
        new Response(JSON.stringify([makeProject(1, 'owner/repo-a')]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    }

    if (parsed.pathname === '/api/v4/projects/1/repository/commits') {
      return Promise.resolve(
        new Response(JSON.stringify([makeCommit('custom-host-sha')]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    }

    return Promise.reject(Error(`Unexpected URL: ${url}`));
  };

  const commits = await fetchAllGitLabCommits(
    requestQueue,
    'octocat',
    [],
    undefined,
    [],
    undefined,
    'https://gitlab.internal.example/api/v4',
  );

  assert.equal(commits.length, 1);
  assert.equal(commits[0]?.id, 'custom-host-sha');
});

test('fetchAllGitLabCommits skips blacklisted projects by partial name match', async () => {
  const calls: Array<string> = [];

  const requestQueue = (url: string): Promise<Response> => {
    calls.push(url);
    const parsed = new URL(url);
    const page = parsed.searchParams.get('page');

    if (parsed.pathname === '/api/v4/projects') {
      if (page === '1') {
        return Promise.resolve(
          new Response(
            JSON.stringify([
              makeProject(
                1,
                'stenametall/application/stenarecyling/reappli/android',
              ),
              makeProject(2, 'owner/repo-b'),
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

    if (parsed.pathname === '/api/v4/projects/2/repository/commits') {
      return Promise.resolve(
        new Response(JSON.stringify([makeCommit('allowed-commit')]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    }

    return Promise.reject(Error(`Unexpected URL: ${url}`));
  };

  const commits = await fetchAllGitLabCommits(
    requestQueue,
    'octocat',
    [],
    undefined,
    ['reappli/android'],
  );

  assert.deepEqual(
    commits.map((commit) => commit.repository.full_name),
    ['owner/repo-b'],
  );
  assert.equal(
    calls.some((url) => url.includes('/api/v4/projects/1/repository/commits')),
    false,
  );
});

test('fetchAllGitLabCommits continues until there are no more commit pages', async () => {
  let commitCalls = 0;

  const requestQueue = (url: string): Promise<Response> => {
    const parsed = new URL(url);

    if (parsed.pathname === '/api/v4/projects') {
      return Promise.resolve(
        new Response(JSON.stringify([makeProject(1, 'owner/repo-a')]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    }

    if (parsed.pathname === '/api/v4/projects/1/repository/commits') {
      const page = Number(parsed.searchParams.get('page') ?? '1');
      commitCalls = Math.max(commitCalls, page);

      if (page > 10) {
        return Promise.resolve(
          new Response(JSON.stringify([]), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        );
      }

      const pageCommits = Array.from({ length: 100 }, (_, i) =>
        makeCommit(`sha-${(page - 1) * 100 + i}`),
      );
      return Promise.resolve(
        new Response(JSON.stringify(pageCommits), {
          status: 200,
          headers: {
            'content-type': 'application/json',
            'x-next-page': page < 10 ? String(page + 1) : '',
          },
        }),
      );
    }

    return Promise.reject(Error(`Unexpected URL: ${url}`));
  };

  const commits = await fetchAllGitLabCommits(requestQueue, 'octocat');

  assert.equal(commits.length, 1000);
  assert.equal(commitCalls, 10);
});

test('fetchAllGitLabCommits forwards since cursor to commit requests', async () => {
  const since = '2025-01-01T00:00:00.000Z';

  const requestQueue = (url: string): Promise<Response> => {
    const parsed = new URL(url);

    if (parsed.pathname === '/api/v4/projects') {
      return Promise.resolve(
        new Response(JSON.stringify([makeProject(1, 'owner/repo-a')]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    }

    if (parsed.pathname === '/api/v4/projects/1/repository/commits') {
      assert.equal(parsed.searchParams.get('since'), since);
      return Promise.resolve(
        new Response(JSON.stringify([makeCommit('a')]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    }

    return Promise.reject(Error(`Unexpected URL: ${url}`));
  };

  const commits = await fetchAllGitLabCommits(
    requestQueue,
    'octocat',
    [],
    undefined,
    [],
    since,
  );

  assert.deepEqual(
    commits.map((commit) => commit.id),
    ['a'],
  );
});

test('fetchAllGitLabCommits logs and skips projects with failing commit endpoints', async () => {
  const requestQueue = (url: string): Promise<Response> => {
    const parsed = new URL(url);

    if (parsed.pathname === '/api/v4/projects') {
      return Promise.resolve(
        new Response(
          JSON.stringify([
            makeProject(1, 'owner/repo-a'),
            makeProject(2, 'owner/repo-b'),
            makeProject(3, 'owner/repo-c'),
          ]),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
      );
    }

    if (parsed.pathname === '/api/v4/projects/1/repository/commits') {
      return Promise.resolve(
        new Response(JSON.stringify([makeCommit('a')]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    }

    if (parsed.pathname === '/api/v4/projects/2/repository/commits') {
      return Promise.reject(Error('GitLab API error 500: internal error'));
    }

    if (parsed.pathname === '/api/v4/projects/3/repository/commits') {
      return Promise.resolve(
        new Response(JSON.stringify([makeCommit('c')]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    }

    return Promise.reject(Error(`Unexpected URL: ${url}`));
  };

  const commits = await fetchAllGitLabCommits(requestQueue, 'octocat');

  assert.equal(commits.length, 2);
  assert.deepEqual(
    commits.map((commit) => commit.repository.full_name),
    ['owner/repo-a', 'owner/repo-c'],
  );
});

test('fetchAllGitLabCommits falls back to until cursor when next page repeats', async () => {
  const requestQueue = (url: string): Promise<Response> => {
    const parsed = new URL(url);

    if (parsed.pathname === '/api/v4/projects') {
      return Promise.resolve(
        new Response(JSON.stringify([makeProject(1, 'owner/repo-a')]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    }

    if (parsed.pathname === '/api/v4/projects/1/repository/commits') {
      const page = parsed.searchParams.get('page');
      const until = parsed.searchParams.get('until');

      if (page === '1' && until == null) {
        return Promise.resolve(
          new Response(JSON.stringify([makeCommit('a'), makeCommit('b')]), {
            status: 200,
            headers: {
              'content-type': 'application/json',
              'x-next-page': '2',
            },
          }),
        );
      }

      if (page === '2' && until == null) {
        // Simulate GitLab returning a duplicate page despite x-next-page.
        return Promise.resolve(
          new Response(JSON.stringify([makeCommit('a'), makeCommit('b')]), {
            status: 200,
            headers: {
              'content-type': 'application/json',
              'x-next-page': '3',
            },
          }),
        );
      }

      if (page === '1' && until != null) {
        return Promise.resolve(
          new Response(
            JSON.stringify([makeCommit('older-1'), makeCommit('older-2')]),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            },
          ),
        );
      }
    }

    return Promise.reject(Error(`Unexpected URL: ${url}`));
  };

  const commits = await fetchAllGitLabCommits(requestQueue, 'octocat');

  assert.deepEqual(
    commits.map((commit) => commit.id),
    ['a', 'b', 'older-1', 'older-2'],
  );
});

test('fetchAllGitLabCommits matches additional author names or emails', async () => {
  const requestQueue = (url: string): Promise<Response> => {
    const parsed = new URL(url);

    if (parsed.pathname === '/api/v4/projects') {
      return Promise.resolve(
        new Response(JSON.stringify([makeProject(1, 'owner/repo-a')]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    }

    if (parsed.pathname === '/api/v4/projects/1/repository/commits') {
      return Promise.resolve(
        new Response(
          JSON.stringify([
            makeCommit('by-username'),
            {
              ...makeCommit('by-email'),
              author_name: 'Alias User',
              author_email: 'jane@example.com',
            },
            {
              ...makeCommit('unmatched'),
              author_name: 'Someone Else',
              author_email: 'someone@example.com',
            },
          ]),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
      );
    }

    return Promise.reject(Error(`Unexpected URL: ${url}`));
  };

  const commits = await fetchAllGitLabCommits(requestQueue, 'octocat', [
    'jane@example.com',
  ]);

  assert.deepEqual(
    commits.map((commit) => commit.id),
    ['by-username', 'by-email'],
  );
});
