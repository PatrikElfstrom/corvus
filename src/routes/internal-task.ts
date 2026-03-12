import {
  defineEventHandler,
  getRouterParam,
  HTTPError,
  readBody,
  setResponseStatus,
} from 'h3';
import { runTask } from 'nitro/task';
import type { TaskPayload } from 'nitro/types';
import { z } from 'zod';
import { readEnv } from '../config/env.ts';
import { loadIntegrationsFromConfig } from '../config/integrations-config.ts';
import { resolveRequestedIntegrations } from '../sync/index.ts';
import { parseSyncIntegrationsTaskPayload } from '../tasks/sync-integrations-payload.ts';
import type { SyncTriggerResult } from '../tasks/sync-trigger-coordinator.ts';
import { createSyncTaskResponse as buildSyncTaskResponse } from './internal-task-sync-response.ts';

const taskNameSchema = z.string().trim().min(1);
const taskPayloadSchema = z.record(z.string(), z.unknown());
const syncTriggerResultSchema = z.object({
  status: z.enum(['started', 'busy']),
  message: z.string().trim().min(1),
});

function isLoopbackAddress(address: string): boolean {
  return (
    address === '127.0.0.1' ||
    address === '::1' ||
    address === '::ffff:127.0.0.1'
  );
}

function parseSyncTriggerResult(taskResult: unknown): SyncTriggerResult {
  const parsed = z
    .object({
      result: syncTriggerResultSchema,
    })
    .safeParse(taskResult);

  if (!parsed.success) {
    throw new HTTPError({
      status: 500,
      message: 'Sync task returned an invalid response.',
    });
  }

  return parsed.data.result;
}

export default defineEventHandler(async (event) => {
  const remoteAddress = event.req.ip;

  if (!remoteAddress || !isLoopbackAddress(remoteAddress)) {
    throw new HTTPError({
      status: 403,
      message: 'Forbidden',
    });
  }

  const expectedToken = readEnv().CORVUS_TASK_TOKEN;

  if (expectedToken) {
    if (event.req.headers.get('x-corvus-token') !== expectedToken) {
      throw new HTTPError({
        status: 401,
        message: 'Invalid task token',
      });
    }
  }

  const rawTaskName = getRouterParam(event, 'name');
  if (rawTaskName == null) {
    throw new HTTPError({
      status: 400,
      message: 'Task name is required',
    });
  }

  let decodedTaskName = rawTaskName;

  try {
    decodedTaskName = decodeURIComponent(rawTaskName);
  } catch {
    throw new HTTPError({
      status: 400,
      message: 'Task name is invalid',
    });
  }

  const parsedTaskName = taskNameSchema.safeParse(decodedTaskName);
  if (!parsedTaskName.success) {
    throw new HTTPError({
      status: 400,
      message:
        decodedTaskName.trim().length === 0
          ? 'Task name is required'
          : 'Task name is invalid',
    });
  }

  const parsedPayload = taskPayloadSchema.safeParse(await readBody(event));
  if (!parsedPayload.success) {
    throw new HTTPError({
      status: 400,
      message: 'Task payload must be an object',
    });
  }

  const payload: TaskPayload = parsedPayload.data;

  if (parsedTaskName.data === 'sync:integrations') {
    let startedMessage =
      'Sync triggered. Check server logs for progress and result.';

    try {
      const { integrationIds, ignoreDateScope } =
        parseSyncIntegrationsTaskPayload(payload);
      const triggerLabel =
        ignoreDateScope === true
          ? 'Full-history sync'
          : ignoreDateScope === false
            ? 'Partial sync'
            : 'Sync';

      if (integrationIds) {
        const selectedIntegrations = resolveRequestedIntegrations(
          loadIntegrationsFromConfig(),
          integrationIds,
        );
        const integrationLabel =
          selectedIntegrations.length === 1 ? 'integration' : 'integrations';
        const selectedIds = selectedIntegrations
          .map((integration) => integration.id)
          .join(', ');

        startedMessage = `${triggerLabel} triggered for ${selectedIntegrations.length} ${integrationLabel} (ids: ${selectedIds}). Check server logs for progress and result.`;
      } else if (ignoreDateScope === true) {
        startedMessage =
          'Full-history sync triggered for all enabled integrations. Check server logs for progress and result.';
      } else if (ignoreDateScope === false) {
        startedMessage =
          'Partial sync triggered for all enabled integrations. Check server logs for progress and result.';
      }
    } catch (error) {
      throw new HTTPError({
        status: 400,
        message:
          error instanceof Error ? error.message : 'Task payload is invalid',
      });
    }

    const taskRunResult = await runTask(parsedTaskName.data, {
      payload,
      context: {
        trigger: 'corvus-cli',
      },
    });
    const triggerResult = parseSyncTriggerResult(taskRunResult);
    const response = buildSyncTaskResponse(
      parsedTaskName.data,
      startedMessage,
      triggerResult,
    );

    setResponseStatus(event, response.statusCode);
    return response.body;
  }

  return runTask(parsedTaskName.data, {
    payload,
    context: {
      trigger: 'corvus-cli',
    },
  });
});
