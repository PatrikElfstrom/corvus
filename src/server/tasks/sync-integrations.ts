import { defineTask } from 'nitro/task';
import { runSyncIntegrationsTask } from './sync-integrations-runner.ts';

export default defineTask({
  meta: {
    name: 'sync:integrations',
    description: 'Sync commits for all configured integrations.',
  },
  async run({ payload, context }) {
    const triggerResult = await runSyncIntegrationsTask(payload, context);
    return {
      result: triggerResult,
    };
  },
});
