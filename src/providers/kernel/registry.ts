import type { AnyProviderAdapter } from '../types.ts';
import type { AnyProviderManifest, ProviderId } from './manifest-types.ts';

export interface ProviderRegistry {
  manifests: Array<AnyProviderManifest>;
  providerIds: Array<ProviderId>;
  hasManifest(providerId: string): providerId is ProviderId;
  getManifest(providerId: ProviderId): AnyProviderManifest;
  getManifestById(providerId: string): AnyProviderManifest | null;
  loadAdapter(providerId: ProviderId): Promise<AnyProviderAdapter>;
}

export function createProviderRegistry(
  manifests: Array<AnyProviderManifest>,
): ProviderRegistry {
  const manifestById = new Map<ProviderId, AnyProviderManifest>();

  for (const manifest of manifests) {
    if (manifestById.has(manifest.id)) {
      throw new Error(
        `Duplicate provider manifest id "${manifest.id}" is not allowed.`,
      );
    }

    manifestById.set(manifest.id, manifest);
  }

  const providerIds = manifests.map((manifest) => manifest.id);
  const adapterCache = new Map<ProviderId, Promise<AnyProviderAdapter>>();

  function hasManifest(providerId: string): providerId is ProviderId {
    return manifestById.has(providerId as ProviderId);
  }

  function getManifest(providerId: ProviderId): AnyProviderManifest {
    const manifest = manifestById.get(providerId);
    if (!manifest) {
      throw new Error(`Unknown provider "${providerId}".`);
    }

    return manifest;
  }

  function getManifestById(providerId: string): AnyProviderManifest | null {
    return manifestById.get(providerId as ProviderId) ?? null;
  }

  async function loadAdapter(
    providerId: ProviderId,
  ): Promise<AnyProviderAdapter> {
    const cachedAdapter = adapterCache.get(providerId);
    if (cachedAdapter) {
      return cachedAdapter;
    }

    const adapterPromise = getManifest(providerId)
      .createAdapter()
      .catch((error) => {
        adapterCache.delete(providerId);
        throw error;
      });
    adapterCache.set(providerId, adapterPromise);
    return adapterPromise;
  }

  return {
    manifests,
    providerIds,
    hasManifest,
    getManifest,
    getManifestById,
    loadAdapter,
  };
}
