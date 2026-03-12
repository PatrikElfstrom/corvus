import path from 'node:path';
import { z } from 'zod';
import {
  defineProviderManifest,
  normalizeNonEmptyUniqueStrings,
} from '../kernel/provider-context.ts';

const filepathOptionsSchema = z
  .object({
    source: z
      .object({
        path: z
          .string()
          .trim()
          .min(1)
          .refine((value) => path.isAbsolute(value), {
            message: 'path must be absolute',
          }),
        depth: z.number().int().min(0).default(1),
      })
      .strict(),
    filters: z
      .object({
        author_include: z.array(z.string().trim().min(1)).min(1),
        repository_exclude: z.array(z.string().trim().min(1)).optional(),
      })
      .strict(),
  })
  .strict();

type FilepathOptions = z.infer<typeof filepathOptionsSchema>;

export const filepathManifest = defineProviderManifest({
  id: 'filepath',
  displayName: 'Filepath',
  optionsSchema: filepathOptionsSchema,
  createAdapter: () =>
    import('./adapter.ts').then((module) => module.providerAdapter),
  normalizeIntegration: ({ enabled, id, options }) => {
    const matchAuthor = normalizeNonEmptyUniqueStrings(
      options.filters.author_include,
    );
    const username = matchAuthor[0];
    if (!username) {
      throw new Error(
        'Filepath integration requires at least one filters.author_include entry.',
      );
    }

    const blacklist = normalizeNonEmptyUniqueStrings(
      options.filters.repository_exclude ?? [],
    );

    return {
      id,
      provider: 'filepath',
      enabled,
      fetchOptions: {
        username,
        match_author: matchAuthor,
        blacklist,
        path: options.source.path,
        depth: options.source.depth,
      },
    };
  },
});

export type { FilepathOptions };
