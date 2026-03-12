import type { SyncTriggerResult } from '../tasks/sync-trigger-coordinator.ts';

export interface SyncTaskResponse {
  statusCode: number;
  body: {
    accepted: boolean;
    taskName: string;
    message: string;
  };
}

export function createSyncTaskResponse(
  taskName: string,
  startedMessage: string,
  triggerResult: SyncTriggerResult,
): SyncTaskResponse {
  if (triggerResult.status === 'busy') {
    return {
      statusCode: 409,
      body: {
        accepted: false,
        taskName,
        message: triggerResult.message,
      },
    };
  }

  return {
    statusCode: 202,
    body: {
      accepted: true,
      taskName,
      message: startedMessage,
    },
  };
}
