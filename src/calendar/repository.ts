import { getDatabase, initDatabaseSchema } from '../db/index.ts';

type SQLResult<T> = {
  rows?: T[] | undefined;
};

interface ActivityPoint {
  date: string;
  count: number;
}

export async function fetchCountsByDateRange(
  startIsoDate: string,
  endIsoDate: string,
): Promise<Map<string, number>> {
  await initDatabaseSchema();
  const db = getDatabase();

  const result = await db.sql<SQLResult<ActivityPoint>>`
    SELECT
      substr(authored_at, 1, 10) AS date,
      COUNT(*) AS count
    FROM commits
    WHERE
      length(authored_at) >= 10
      AND substr(authored_at, 1, 10) >= ${startIsoDate}
      AND substr(authored_at, 1, 10) <= ${endIsoDate}
    GROUP BY date
    ORDER BY date ASC
  `;

  const rows = result.rows ?? [];
  const countsByDate = new Map<string, number>();

  for (const row of rows) {
    countsByDate.set(row.date, row.count);
  }

  return countsByDate;
}
