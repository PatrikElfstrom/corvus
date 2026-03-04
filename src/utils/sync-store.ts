import { logger } from '../server/logger.ts';
import type { NormalisedCommit } from '../server/providers.ts';

const INSERT_BATCH_SIZE = 100;

type DatabaseModule = typeof import('../server/db/index.ts');
type SQLResult<T> = {
  rows?: T[] | undefined;
};
type SQLWriteResult = {
  changes?: number | undefined;
};

type SQLExecutor = <T = unknown>(
  strings: TemplateStringsArray,
  ...values: Array<unknown>
) => Promise<T>;

interface IntegrationSyncRunRow {
  sync_started_at: string;
}

interface CommitPersistenceDatabase {
  sql: SQLExecutor;
}

let databaseModulePromise: Promise<DatabaseModule> | null = null;

async function loadDatabaseModule(): Promise<DatabaseModule> {
  if (!databaseModulePromise) {
    databaseModulePromise = import('../server/db/index.ts');
  }

  return databaseModulePromise;
}

export async function ensureSyncDatabaseSchema(): Promise<void> {
  const databaseModule = await loadDatabaseModule();
  await databaseModule.initDatabaseSchema();
}

async function getDatabaseConnection(): Promise<
  ReturnType<DatabaseModule['getDatabase']>
> {
  const databaseModule = await loadDatabaseModule();
  return databaseModule.getDatabase();
}

function toChangedRowCount(writeResult: SQLWriteResult): number {
  const value = writeResult.changes;
  if (typeof value !== 'number') {
    return 0;
  }

  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }

  return value;
}

function chunkRows<T>(rows: Array<T>, size: number): Array<Array<T>> {
  const chunks: Array<Array<T>> = [];

  for (let i = 0; i < rows.length; i += size) {
    chunks.push(rows.slice(i, i + size));
  }

  return chunks;
}

export async function fetchIntegrationLastSuccessfulSyncStartedAt(
  integrationId: string,
): Promise<string | null> {
  await ensureSyncDatabaseSchema();
  const db = await getDatabaseConnection();

  const result = await db.sql<SQLResult<IntegrationSyncRunRow>>`
    SELECT sync_started_at
    FROM integration_sync_runs
    WHERE
      integration_id = ${integrationId}
      AND failures_captured = 0
    ORDER BY sync_started_at DESC, id DESC
    LIMIT 1
  `;

  return (result.rows ?? [])[0]?.sync_started_at ?? null;
}

export async function persistIntegrationSyncRun(
  integrationId: string,
  syncStartedAt: string,
  syncFinishedAt: string,
  repositoriesSynced: number,
  commitsSynced: number,
  failuresCaptured: number,
): Promise<void> {
  await ensureSyncDatabaseSchema();
  const db = await getDatabaseConnection();

  await db.sql`
    INSERT INTO integration_sync_runs
      (
        integration_id,
        sync_started_at,
        sync_finished_at,
        repositories_synced,
        commits_synced,
        failures_captured
      )
    VALUES
      (
        ${integrationId},
        ${syncStartedAt},
        ${syncFinishedAt},
        ${repositoriesSynced},
        ${commitsSynced},
        ${failuresCaptured}
      )
  `;
}

export async function persistCommits(
  commits: Array<NormalisedCommit>,
): Promise<number> {
  if (commits.length === 0) {
    return 0;
  }

  await ensureSyncDatabaseSchema();
  const db = await getDatabaseConnection();

  return persistCommitsWithDatabase(commits, db as CommitPersistenceDatabase);
}

export async function persistCommitsWithDatabase(
  commits: Array<NormalisedCommit>,
  db: CommitPersistenceDatabase,
): Promise<number> {
  if (commits.length === 0) {
    return 0;
  }

  logger.trace(
    {
      commitsToPersist: commits.length,
      insertBatchSize: INSERT_BATCH_SIZE,
    },
    'Persisting commits to sqlite',
  );

  const batches = chunkRows(commits, INSERT_BATCH_SIZE);
  let commitsStored = 0;
  let transactionOpen = false;

  await db.sql`BEGIN`;
  transactionOpen = true;

  try {
    for (const batch of batches) {
      for (const row of batch) {
        const writeResult = await db.sql<SQLWriteResult>`
          INSERT OR IGNORE INTO commits
            (sha, author_name, author_email, authored_at)
          VALUES
            (${row.sha}, ${row.author_name}, ${row.author_email}, ${row.authored_at})
        `;
        commitsStored += toChangedRowCount(writeResult);
      }
    }

    await db.sql`COMMIT`;
    transactionOpen = false;
  } catch (error) {
    if (transactionOpen) {
      try {
        await db.sql`ROLLBACK`;
      } catch (rollbackError) {
        logger.error(
          { err: rollbackError },
          'Failed to rollback commit persistence transaction',
        );
      }
    }

    throw error;
  }

  logger.trace(
    {
      commitsAttempted: commits.length,
      commitsStored,
    },
    'Finished commit persistence',
  );
  return commitsStored;
}
