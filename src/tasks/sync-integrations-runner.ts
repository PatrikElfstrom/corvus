import type { TaskContext, TaskPayload } from 'nitro/types';
import { parseSyncIntegrationsTaskPayload } from './sync-integrations-payload.ts';
import {
  type SyncTriggerResult,
  type SyncTriggerSource,
  triggerIntegrationsSync,
} from './sync-trigger-coordinator.ts';

interface TaskContextWithTrigger {
  trigger?: unknown;
}

interface TriggerSyncDependencies {
  triggerSync(options: {
    source: SyncTriggerSource;
    integrationIds?: Array<string>;
    ignoreDateScope?: boolean;
  }): Promise<SyncTriggerResult>;
}

const defaultTriggerSyncDependencies: TriggerSyncDependencies = {
  triggerSync: triggerIntegrationsSync,
};

export function resolveSyncTriggerSource(
  context: TaskContext,
): SyncTriggerSource {
  const trigger = (context as TaskContextWithTrigger).trigger;
  return trigger === 'corvus-cli' ? 'manual' : 'scheduled';
}

export async function runSyncIntegrationsTask(
  payload: TaskPayload | null | undefined,
  context: TaskContext,
  dependencies: TriggerSyncDependencies = defaultTriggerSyncDependencies,
): Promise<SyncTriggerResult> {
  const { integrationIds, ignoreDateScope } =
    parseSyncIntegrationsTaskPayload(payload);

  return dependencies.triggerSync({
    source: resolveSyncTriggerSource(context),
    integrationIds,
    ignoreDateScope,
  });
}
