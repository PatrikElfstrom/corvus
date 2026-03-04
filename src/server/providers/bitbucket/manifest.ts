import { z } from 'zod';
import {
  defineProviderManifest,
  normalizeNonEmptyUniqueStrings,
} from '../kernel/provider-context.ts';

const bitbucketIntegrationOptionsSchema = z
  .object({
    auth: z
      .object({
        username: z.string().trim().min(1),
        token: z.string().trim().min(1),
      })
      .strict(),
    source: z
      .object({
        base_url: z.url().optional(),
      })
      .strict()
      .optional(),
    filters: z
      .object({
        author_include: z.array(z.string().trim().min(1)).optional(),
        repository_exclude: z.array(z.string().trim().min(1)).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

type BitbucketIntegrationOptions = z.infer<
  typeof bitbucketIntegrationOptionsSchema
>;

export const bitbucketManifest = defineProviderManifest({
  id: 'bitbucket',
  displayName: 'Bitbucket',
  optionsSchema: bitbucketIntegrationOptionsSchema,
  createAdapter: () =>
    import('./adapter.ts').then((module) => module.providerAdapter),
  normalizeIntegration: ({ enabled, id, options }) => {
    const username = options.auth.username.trim();
    const configuredAuthorMatchers = options.filters?.author_include ?? [
      username,
    ];
    const matchAuthor = normalizeNonEmptyUniqueStrings(
      configuredAuthorMatchers,
    );
    const blacklist = normalizeNonEmptyUniqueStrings(
      options.filters?.repository_exclude ?? [],
    );

    return {
      id,
      provider: 'bitbucket',
      enabled,
      fetchOptions: {
        username,
        token: options.auth.token,
        match_author: matchAuthor.length > 0 ? matchAuthor : [username],
        blacklist,
        url: options.source?.base_url,
      },
    };
  },
});

export type { BitbucketIntegrationOptions };
