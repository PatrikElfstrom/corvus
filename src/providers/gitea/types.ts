import { z } from 'zod';

export const giteaCommitAuthorSchema = z.object({
  name: z.string(),
  email: z.string(),
  date: z.string(),
});

export const giteaCommitDetailSchema = z.object({
  author: giteaCommitAuthorSchema,
  message: z.string(),
  url: z.string().optional(),
});

export const giteaCommitItemSchema = z.object({
  sha: z.string().trim().min(1),
  commit: giteaCommitDetailSchema,
  html_url: z.string().optional(),
  repository: z.object({
    full_name: z.string().trim().min(1),
  }),
});

export const giteaRepositoryCommitItemSchema = giteaCommitItemSchema.omit({
  repository: true,
});

export const giteaRepositorySchema = z.object({
  full_name: z.string().trim().min(1),
});

export const giteaRepositoryListSchema = z.array(giteaRepositorySchema);
export const giteaRepositoryCommitListSchema = z.array(
  giteaRepositoryCommitItemSchema,
);

export type GiteaCommitAuthor = z.infer<typeof giteaCommitAuthorSchema>;
export type GiteaCommitDetail = z.infer<typeof giteaCommitDetailSchema>;
export type GiteaCommitItem = z.infer<typeof giteaCommitItemSchema>;
export type GiteaRepositoryCommitItem = z.infer<
  typeof giteaRepositoryCommitItemSchema
>;
export type GiteaRepository = z.infer<typeof giteaRepositorySchema>;
