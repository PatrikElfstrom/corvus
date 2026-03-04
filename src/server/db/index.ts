import { useDatabase } from 'nitro/database';
import { logger } from '../logger.ts';
import { ensureWritableSqlitePath, resolveSqlitePath } from './sqlite-path.ts';

const databasePath = resolveSqlitePath();

let schemaReady = false;

type SQLResult<T> = {
  rows?: T[] | undefined;
};

interface TableInfoRow {
  name: string;
}

export function getDatabase() {
  return useDatabase();
}

async function ensureIntegrationSyncRunsTable(
  database: ReturnType<typeof getDatabase>,
): Promise<void> {
  const tableInfo = await database.sql<SQLResult<TableInfoRow>>`
    PRAGMA table_info(integration_sync_runs)
  `;
  const existingColumns = new Set(
    (tableInfo.rows ?? []).map((row) => row.name),
  );

  if (existingColumns.size > 0 && !existingColumns.has('integration_id')) {
    await database.sql`DROP TABLE IF EXISTS integration_sync_runs`;
  }

  await database.sql`
    CREATE TABLE IF NOT EXISTS integration_sync_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      integration_id TEXT NOT NULL,
      sync_started_at TEXT NOT NULL,
      sync_finished_at TEXT NOT NULL,
      repositories_synced INTEGER NOT NULL,
      commits_synced INTEGER NOT NULL,
      failures_captured INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `;

  await database.sql`
    CREATE INDEX IF NOT EXISTS integration_sync_runs_latest_idx
    ON integration_sync_runs (integration_id, sync_started_at DESC, id DESC)
  `;

  await database.sql`
    CREATE INDEX IF NOT EXISTS integration_sync_runs_started_at_idx
    ON integration_sync_runs (sync_started_at DESC, id DESC)
  `;
}

export async function initDatabaseSchema(): Promise<void> {
  if (schemaReady) {
    return;
  }

  ensureWritableSqlitePath();

  const database = getDatabase();

  await database.sql`
    CREATE TABLE IF NOT EXISTS commits (
      sha TEXT NOT NULL PRIMARY KEY,
      author_name TEXT NOT NULL,
      author_email TEXT NOT NULL,
      authored_at TEXT NOT NULL
    )
  `;

  await database.sql`
    CREATE INDEX IF NOT EXISTS commits_authored_at_idx
    ON commits (authored_at)
  `;

  await ensureIntegrationSyncRunsTable(database);

  schemaReady = true;
  logger.info({ databasePath }, 'Initialized database schema');
}
