import type { ResolvedIntegration } from '../providers/index.ts';

function normalizeRequestedIntegrationIds(
  integrationIds: Array<string>,
): Array<string> {
  const uniqueIds = new Set<string>();
  const normalizedIds: Array<string> = [];

  for (const rawId of integrationIds) {
    const id = rawId.trim();
    if (id.length === 0 || uniqueIds.has(id)) {
      continue;
    }

    uniqueIds.add(id);
    normalizedIds.push(id);
  }

  return normalizedIds;
}

export function resolveRequestedIntegrations(
  configuredIntegrations: Array<ResolvedIntegration>,
  integrationIds?: Array<string>,
): Array<ResolvedIntegration> {
  if (!integrationIds || integrationIds.length === 0) {
    return configuredIntegrations;
  }

  const requestedIds = normalizeRequestedIntegrationIds(integrationIds);
  if (requestedIds.length === 0) {
    return configuredIntegrations;
  }

  const selectedIntegrations: Array<ResolvedIntegration> = [];
  const unknownIds: Array<string> = [];
  const disabledIds: Array<string> = [];
  const duplicateConfiguredIds: Array<string> = [];

  for (const requestedId of requestedIds) {
    const matches = configuredIntegrations.filter(
      (integration) => integration.id === requestedId,
    );

    if (matches.length === 0) {
      unknownIds.push(requestedId);
      continue;
    }

    if (matches.length > 1) {
      duplicateConfiguredIds.push(requestedId);
      continue;
    }

    const integration = matches[0];
    if (!integration.enabled) {
      disabledIds.push(requestedId);
      continue;
    }

    selectedIntegrations.push(integration);
  }

  const errors: Array<string> = [];

  if (unknownIds.length > 0) {
    errors.push(`unknown integration ids: ${unknownIds.join(', ')}`);
  }

  if (disabledIds.length > 0) {
    errors.push(`disabled integration ids: ${disabledIds.join(', ')}`);
  }

  if (duplicateConfiguredIds.length > 0) {
    errors.push(
      `duplicate configured ids: ${duplicateConfiguredIds.join(', ')}`,
    );
  }

  if (errors.length > 0) {
    throw new Error(`Cannot sync requested integrations; ${errors.join('; ')}`);
  }

  return selectedIntegrations;
}
