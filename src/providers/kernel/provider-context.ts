import type { ProviderId, ProviderManifest } from './manifest-types.ts';

export function defineProviderManifest<
  TProviderId extends ProviderId,
  TOptions,
>(
  manifest: ProviderManifest<TProviderId, TOptions>,
): ProviderManifest<TProviderId, TOptions> {
  return manifest;
}

export function normalizeNonEmptyUniqueStrings(
  values: Array<string>,
): Array<string> {
  return Array.from(
    new Set(
      values.map((value) => value.trim()).filter((value) => value.length > 0),
    ),
  );
}
