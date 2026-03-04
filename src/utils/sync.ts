import { loadIntegrationsFromConfig } from '../server/integrations-config.ts';
import { logger } from '../server/logger.ts';
import type { ResolvedIntegration } from '../server/providers/index.ts';
import type { Provider, SyncFetchFailure } from '../server/providers.ts';
import { fetchCommitsForProvider } from '../server/providers.ts';
import { parseSyncFailureError } from '../server/sync-failure.ts';
import { resolveRequestedIntegrations } from './sync-selection.ts';
import {
  ensureSyncDatabaseSchema,
  fetchIntegrationLastSuccessfulSyncStartedAt,
  persistCommits,
  persistIntegrationSyncRun,
} from './sync-store.ts';

interface SyncResult {
  username: string;
  repositoriesSynced: number;
  commitsFetched: number;
  commitsStored: number;
  failuresCaptured: number;
  failures: Array<SyncFetchFailure>;
}

interface RunIntegrationSyncResult {
  error: string | null;
  result: SyncResult | null;
}

export interface SyncExecutionOptions {
  ignoreDateScope?: boolean;
}

interface IntegrationSyncRun {
  integrationId: string;
  provider: Provider;
  username: string;
  repositoriesSynced: number;
  commitsFetched: number;
  commitsStored: number;
  failuresCaptured: number;
  failures: Array<SyncFetchFailure>;
  error: string | null;
}

export interface SyncAllIntegrationsResult {
  totalIntegrations: number;
  successfulCount: number;
  failedCount: number;
  runs: Array<IntegrationSyncRun>;
}

interface SyncStartProgressEvent {
  type: 'sync-started';
  integrationsConfigured: number;
  integrationsEnabled: number;
  integrationsDisabled: number;
}

interface IntegrationStartedProgressEvent {
  type: 'integration-started';
  integrationId: string;
  provider: Provider;
  username: string;
}

interface IntegrationFailureProgressEvent {
  type: 'integration-failure';
  integrationId: string;
  provider: Provider;
  username: string;
  failure: SyncFetchFailure;
}

interface IntegrationCompletedProgressEvent {
  type: 'integration-completed';
  integrationId: string;
  provider: Provider;
  username: string;
  repositoriesSynced: number;
  commitsFetched: number;
  commitsStored: number;
  failuresCaptured: number;
  error: string | null;
}

interface SyncCompletedProgressEvent {
  type: 'sync-completed';
  totalIntegrations: number;
  successfulCount: number;
  failedCount: number;
}

export type SyncProgressEvent =
  | SyncStartProgressEvent
  | IntegrationStartedProgressEvent
  | IntegrationFailureProgressEvent
  | IntegrationCompletedProgressEvent
  | SyncCompletedProgressEvent;

export type SyncProgressReporter = (
  event: SyncProgressEvent,
) => void | Promise<void>;

type IntegrationSyncExecutor = (
  integration: ResolvedIntegration,
  options?: SyncExecutionOptions,
) => Promise<RunIntegrationSyncResult>;

export { resolveRequestedIntegrations };

async function reportSyncProgress(
  onProgress: SyncProgressReporter | undefined,
  event: SyncProgressEvent,
): Promise<void> {
  if (!onProgress) {
    return;
  }

  await onProgress(event);
}

function createPartialFailureErrorMessage(
  provider: Provider,
  failuresCaptured: number,
): string | null {
  if (failuresCaptured <= 0) {
    return null;
  }

  const label = failuresCaptured === 1 ? 'failure' : 'failures';
  return `Encountered ${failuresCaptured} ${provider} fetch ${label}`;
}

async function runIntegrationSync(
  integration: ResolvedIntegration,
  options: SyncExecutionOptions = {},
): Promise<RunIntegrationSyncResult> {
  await ensureSyncDatabaseSchema();
  const integrationId = integration.id;
  const syncStartedAt = new Date();
  const syncStartedAtIso = syncStartedAt.toISOString();

  try {
    const { provider, fetchOptions } = integration;
    const {
      username,
      match_author: matchAuthor,
      blacklist,
      url,
      path,
      depth,
    } = fetchOptions;

    // Cursor policy is intentionally success-only: partial sync failures do not
    // advance the since cursor for the next partial run.
    const lastSyncStartedAt = options.ignoreDateScope
      ? null
      : await fetchIntegrationLastSuccessfulSyncStartedAt(integrationId);

    logger.info(
      {
        integrationId,
        provider,
        username,
        hasUrl: url != null,
        hasPath: path != null,
        depth,
        hasCustomMatchers: matchAuthor.some(
          (matcher) =>
            matcher.trim().toLowerCase() !== username.trim().toLowerCase(),
        ),
        blacklistMatchers: blacklist.length,
        ignoreDateScope: options.ignoreDateScope === true,
        lastSyncStartedAt,
      },
      'Starting commit sync',
    );

    const { repositoriesSynced, commits, failures } =
      await fetchCommitsForProvider({
        provider,
        fetchOptions,
        since: lastSyncStartedAt ?? undefined,
      });

    logger.info(
      {
        integrationId,
        repositoriesSynced,
        commitsFetched: commits.length,
        failuresCaptured: failures.length,
      },
      'Persisting sync results to database',
    );

    const stored = await persistCommits(commits);

    await persistIntegrationSyncRun(
      integrationId,
      syncStartedAtIso,
      new Date().toISOString(),
      repositoriesSynced,
      commits.length,
      failures.length,
    );

    logger.info(
      {
        integrationId,
        username,
        repositoriesSynced,
        commitsFetched: commits.length,
        commitsStored: stored,
        failuresCaptured: failures.length,
      },
      'Sync complete',
    );

    const partialFailureError = createPartialFailureErrorMessage(
      provider,
      failures.length,
    );
    if (partialFailureError) {
      logger.warn(
        {
          integrationId,
          provider,
          username,
          cursorPolicy: 'success-only',
          failuresCaptured: failures.length,
          sampleFailure: failures[0]?.message,
          sampleFailureTargetType: failures[0]?.targetType,
          sampleFailureTargetName: failures[0]?.targetName,
        },
        'Sync completed with provider-level fetch failures; partial sync cursor remains unchanged until a zero-failure run',
      );
    }

    return {
      error: partialFailureError,
      result: {
        username,
        repositoriesSynced,
        commitsFetched: commits.length,
        commitsStored: stored,
        failuresCaptured: failures.length,
        failures,
      },
    };
  } catch (error) {
    logger.error(
      { integrationId, err: error },
      'Commit sync failed unexpectedly',
    );

    const parsedError = parseSyncFailureError(error);
    const message = parsedError.message;

    await persistIntegrationSyncRun(
      integrationId,
      syncStartedAtIso,
      new Date().toISOString(),
      0,
      0,
      1,
    );

    return {
      error: message,
      result: null,
    };
  }
}

export async function runConfiguredIntegrationsSyncs(
  configuredIntegrations: Array<ResolvedIntegration>,
  runIntegration: IntegrationSyncExecutor = runIntegrationSync,
  onProgress?: SyncProgressReporter,
  options: SyncExecutionOptions = {},
): Promise<SyncAllIntegrationsResult> {
  const integrations = configuredIntegrations.filter(
    (integration) => integration.enabled,
  );
  const runs: Array<IntegrationSyncRun> = [];

  logger.info(
    {
      integrationsConfigured: configuredIntegrations.length,
      integrationsEnabled: integrations.length,
      integrationsDisabled: configuredIntegrations.length - integrations.length,
    },
    'Starting sync for enabled integrations',
  );
  await reportSyncProgress(onProgress, {
    type: 'sync-started',
    integrationsConfigured: configuredIntegrations.length,
    integrationsEnabled: integrations.length,
    integrationsDisabled: configuredIntegrations.length - integrations.length,
  });

  for (const integration of integrations) {
    logger.trace(
      {
        integrationId: integration.id,
        provider: integration.provider,
        username: integration.fetchOptions.username,
      },
      'Running sync for integration',
    );
    await reportSyncProgress(onProgress, {
      type: 'integration-started',
      integrationId: integration.id,
      provider: integration.provider,
      username: integration.fetchOptions.username,
    });

    const syncResponse = await runIntegration(integration, options);

    const run = {
      integrationId: integration.id,
      provider: integration.provider,
      username: integration.fetchOptions.username,
      repositoriesSynced: syncResponse.result?.repositoriesSynced ?? 0,
      commitsFetched: syncResponse.result?.commitsFetched ?? 0,
      commitsStored: syncResponse.result?.commitsStored ?? 0,
      failuresCaptured: syncResponse.result?.failuresCaptured ?? 0,
      failures: syncResponse.result?.failures ?? [],
      error: syncResponse.error,
    } satisfies IntegrationSyncRun;
    runs.push(run);

    logger.trace(
      {
        integrationId: integration.id,
        repositoriesSynced: syncResponse.result?.repositoriesSynced ?? 0,
        commitsFetched: syncResponse.result?.commitsFetched ?? 0,
        commitsStored: syncResponse.result?.commitsStored ?? 0,
        failuresCaptured: syncResponse.result?.failuresCaptured ?? 0,
        hadError: syncResponse.error !== null,
      },
      'Finished sync for integration',
    );

    for (const failure of run.failures) {
      await reportSyncProgress(onProgress, {
        type: 'integration-failure',
        integrationId: run.integrationId,
        provider: run.provider,
        username: run.username,
        failure,
      });
    }

    await reportSyncProgress(onProgress, {
      type: 'integration-completed',
      integrationId: run.integrationId,
      provider: run.provider,
      username: run.username,
      repositoriesSynced: run.repositoriesSynced,
      commitsFetched: run.commitsFetched,
      commitsStored: run.commitsStored,
      failuresCaptured: run.failuresCaptured,
      error: run.error,
    });
  }

  const failedCount = runs.filter((run) => run.error !== null).length;

  logger.info(
    {
      totalIntegrations: runs.length,
      successfulCount: runs.length - failedCount,
      failedCount,
    },
    'Completed sync for all configured integrations',
  );
  await reportSyncProgress(onProgress, {
    type: 'sync-completed',
    totalIntegrations: runs.length,
    successfulCount: runs.length - failedCount,
    failedCount,
  });

  return {
    totalIntegrations: runs.length,
    successfulCount: runs.length - failedCount,
    failedCount,
    runs,
  };
}

export async function runAllIntegrationsSyncs(
  onProgress?: SyncProgressReporter,
  options: SyncExecutionOptions = {},
): Promise<SyncAllIntegrationsResult> {
  const configuredIntegrations = loadIntegrationsFromConfig();
  return runConfiguredIntegrationsSyncs(
    configuredIntegrations,
    runIntegrationSync,
    onProgress,
    options,
  );
}
