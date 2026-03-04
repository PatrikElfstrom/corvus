import { z } from 'zod';

export function bitbucketPaginatedResponseSchema<T extends z.ZodTypeAny>(
  valueSchema: T,
) {
  return z.object({
    next: z.string().optional(),
    values: z.array(valueSchema),
  });
}

export const bitbucketWorkspaceAccessSchema = z.object({
  workspace: z.object({
    slug: z.string().trim().min(1),
  }),
});

export const bitbucketRepositorySchema = z.object({
  full_name: z.string().trim().min(1),
});

export const bitbucketCommitAuthorSchema = z.object({
  raw: z.string(),
});

export const bitbucketApiCommitSchema = z.object({
  hash: z.string().trim().min(1),
  message: z.string(),
  date: z.string(),
  author: bitbucketCommitAuthorSchema,
});

export const bitbucketCommitSchema = bitbucketApiCommitSchema.extend({
  repository: z.object({
    full_name: z.string().trim().min(1),
  }),
});

export type BitbucketWorkspaceAccess = z.infer<
  typeof bitbucketWorkspaceAccessSchema
>;
export type BitbucketRepository = z.infer<typeof bitbucketRepositorySchema>;
export type BitbucketCommitAuthor = z.infer<typeof bitbucketCommitAuthorSchema>;
export type BitbucketApiCommit = z.infer<typeof bitbucketApiCommitSchema>;
export type BitbucketCommit = z.infer<typeof bitbucketCommitSchema>;
