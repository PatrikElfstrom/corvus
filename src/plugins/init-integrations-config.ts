import { definePlugin } from 'nitro';
import { initConfig } from '../config/config.ts';
import { initIntegrationsConfig } from '../config/integrations-config.ts';
import { initDatabaseSchema } from '../db/index.ts';
import { logger } from '../logger.ts';

export default definePlugin(async () => {
  const integrationsConfigPath = initIntegrationsConfig();
  const configPath = initConfig();
  await initDatabaseSchema();

  logger.info(
    { integrationsConfigPath, configPath },
    'Initialized config files and database schema on startup',
  );
});
