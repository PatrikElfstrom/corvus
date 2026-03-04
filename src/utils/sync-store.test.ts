import assert from 'node:assert/strict';
import test from 'node:test';
import type { NormalisedCommit } from '../server/providers.ts';
import { persistCommitsWithDatabase } from './sync-store.ts';

interface FakeDatabaseOptions {
  failOnInsert?: number;
}

function createFakeDatabase(options: FakeDatabaseOptions = {}) {
  const seenShas = new Set<string>();
  const statements: Array<string> = [];
  let insertCounter = 0;

  const database = {
    async sql<T = unknown>(
      strings: TemplateStringsArray,
      ...values: Array<unknown>
    ): Promise<T> {
      const statement = strings.join('?').replace(/\s+/g, ' ').trim();
      statements.push(statement);

      if (statement.startsWith('INSERT OR IGNORE INTO commits')) {
        insertCounter += 1;
        if (options.failOnInsert === insertCounter) {
          throw new Error('insert failed');
        }

        const sha = String(values[0] ?? '');
        if (seenShas.has(sha)) {
          return { changes: 0 } as T;
        }

        seenShas.add(sha);
        return { changes: 1 } as T;
      }

      return {} as T;
    },
  };

  return {
    database,
    statements,
  };
}

function commit(sha: string): NormalisedCommit {
  return {
    sha,
    author_name: 'Patrik',
    author_email: 'patrik@example.com',
    authored_at: '2026-03-01T00:00:00.000Z',
  };
}

test('persistCommitsWithDatabase writes commits in a transaction and counts inserted rows', async () => {
  const { database, statements } = createFakeDatabase();

  const stored = await persistCommitsWithDatabase(
    [commit('a'), commit('a'), commit('b')],
    database,
  );

  assert.equal(stored, 2);
  assert.ok(statements.some((statement) => statement === 'BEGIN'));
  assert.ok(statements.some((statement) => statement === 'COMMIT'));
  assert.equal(
    statements.some((statement) => statement === 'ROLLBACK'),
    false,
  );
});

test('persistCommitsWithDatabase rolls back the transaction when an insert fails', async () => {
  const { database, statements } = createFakeDatabase({ failOnInsert: 2 });

  await assert.rejects(() =>
    persistCommitsWithDatabase([commit('a'), commit('b')], database),
  );

  assert.ok(statements.some((statement) => statement === 'BEGIN'));
  assert.ok(statements.some((statement) => statement === 'ROLLBACK'));
  assert.equal(
    statements.some((statement) => statement === 'COMMIT'),
    false,
  );
});
