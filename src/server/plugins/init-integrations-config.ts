import { definePlugin } from 'nitro';
import { initDatabaseSchema } from '../db/index.ts';
import { initIntegrationsConfig } from '../integrations-config.ts';
import { logger } from '../logger.ts';

export default definePlugin(async () => {
  const configPath = initIntegrationsConfig();
  await initDatabaseSchema();

  logger.info(
    { configPath },
    'Initialized integrations config and database schema on startup',
  );
});
