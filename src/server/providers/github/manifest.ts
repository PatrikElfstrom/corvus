import { z } from 'zod';
import {
  defineProviderManifest,
  normalizeNonEmptyUniqueStrings,
} from '../kernel/provider-context.ts';

const githubIntegrationOptionsSchema = z
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

type GitHubIntegrationOptions = z.infer<typeof githubIntegrationOptionsSchema>;

export const githubManifest = defineProviderManifest({
  id: 'github',
  displayName: 'GitHub',
  optionsSchema: githubIntegrationOptionsSchema,
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
      provider: 'github',
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

export type { GitHubIntegrationOptions };
