import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildGitLogArgs,
  ensureGitAvailable,
  fetchLocalRepositoryCommits,
  parseGitLogOutput,
} from './commits.ts';

const FIELD_SEPARATOR = '\u001f';
const RECORD_SEPARATOR = '\u001e';

function makeGitLogRecord(
  sha: string,
  authorName: string,
  authorEmail: string,
  authoredAt: string,
): string {
  return `${sha}${FIELD_SEPARATOR}${authorName}${FIELD_SEPARATOR}${authorEmail}${FIELD_SEPARATOR}${authoredAt}${RECORD_SEPARATOR}`;
}

test('buildGitLogArgs includes --all and forwards since', () => {
  const args = buildGitLogArgs('2025-01-01T00:00:00.000Z');

  assert.equal(args[0], 'log');
  assert.equal(args[1], '--all');
  assert.ok(args.some((arg) => arg.startsWith('--format=')));
  assert.ok(args.includes('--since=2025-01-01T00:00:00.000Z'));
});

test('parseGitLogOutput deduplicates commit shas per repository', () => {
  const output = [
    makeGitLogRecord(
      'abc123',
      'Alice',
      'alice@example.com',
      '2025-01-02T03:04:05+00:00',
    ),
    makeGitLogRecord(
      'abc123',
      'Alice',
      'alice@example.com',
      '2025-01-02T03:04:05+00:00',
    ),
    makeGitLogRecord(
      'def456',
      'Bob',
      'bob@example.com',
      '2025-01-03T03:04:05+00:00',
    ),
  ].join('');

  const commits = parseGitLogOutput(output, 'workspace/repo');

  assert.deepEqual(
    commits.map((commit) => commit.sha),
    ['abc123', 'def456'],
  );
});

test('fetchLocalRepositoryCommits continues after repository command failures', async () => {
  const repositories = [
    {
      absolutePath: '/tmp/ok-repo',
      repositoryFullName: 'ok-repo',
    },
    {
      absolutePath: '/tmp/failing-repo',
      repositoryFullName: 'failing-repo',
    },
  ];
  const failures: Array<string> = [];
  const commandCalls: Array<Array<string>> = [];

  const commits = await fetchLocalRepositoryCommits({
    repositories,
    since: '2025-01-01T00:00:00.000Z',
    onFailure: (failure) => {
      failures.push(`${failure.targetName}:${failure.message}`);
    },
    runGitCommand: async (repositoryPath, args) => {
      commandCalls.push(args);
      if (repositoryPath === '/tmp/failing-repo') {
        throw new Error('git failed for failing-repo');
      }

      return makeGitLogRecord(
        'abc123',
        'Alice',
        'alice@example.com',
        '2025-01-02T03:04:05+00:00',
      );
    },
  });

  assert.equal(commits.length, 1);
  assert.equal(commits[0]?.repositoryFullName, 'ok-repo');
  assert.deepEqual(failures, ['failing-repo:git failed for failing-repo']);
  assert.equal(commandCalls.length, 2);
  assert.ok(commandCalls[0]?.includes('--all'));
  assert.ok(commandCalls[0]?.includes('--since=2025-01-01T00:00:00.000Z'));
});

test('ensureGitAvailable resolves when git is installed', async () => {
  await assert.doesNotReject(ensureGitAvailable());
});
