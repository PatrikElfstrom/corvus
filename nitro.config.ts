import { resolve } from "node:path";
import { defineNitroConfig } from "nitro/config";
import { resolveSqlitePath } from "./src/db/sqlite-path.ts";

const syncSchedule = process.env.SYNC_CRON ?? "0 0 * * *";
const sqlitePath = resolveSqlitePath();

export default defineNitroConfig({
  compatibilityDate: "2026-02-23",
  experimental: {
    tasks: true,
    database: true,
  },
  database: {
    default: {
      connector: "bun-sqlite",
      options: {
        path: sqlitePath,
      },
    },
  },
  devDatabase: {
    default: {
      connector: "sqlite",
      options: {
        path: sqlitePath,
      },
    },
  },
  plugins: [resolve("./src/plugins/init-integrations-config.ts")],
  handlers: [
    {
      route: "/",
      method: "GET",
      handler: resolve("./src/routes/index.ts"),
    },
    {
      route: "/year.svg",
      method: "GET",
      handler: resolve("./src/routes/year-svg.ts"),
    },
    {
      route: "/_internal/tasks/:name",
      method: "POST",
      handler: resolve("./src/routes/internal-task.ts"),
    },
  ],
  tasks: {
    "sync:integrations": {
      description: "Sync commits for all configured integrations.",
      handler: resolve("./src/tasks/sync-integrations.ts"),
    },
  },
  scheduledTasks: {
    [syncSchedule]: ["sync:integrations"],
  },
});
