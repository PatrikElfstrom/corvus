import { z } from 'zod';

export const gitLabProjectSchema = z.object({
  id: z.number().int(),
  path_with_namespace: z.string().trim().min(1),
  web_url: z.string(),
});

export const gitLabCommitSchema = z.object({
  id: z.string().trim().min(1),
  message: z.string(),
  authored_date: z.string(),
  author_name: z.string(),
  author_email: z.string(),
  web_url: z.string().optional(),
});

export const gitLabCommitWithRepositorySchema = gitLabCommitSchema.extend({
  repository: z.object({
    id: z.number().int(),
    full_name: z.string().trim().min(1),
    web_url: z.string(),
  }),
});

export const gitLabProjectListSchema = z.array(gitLabProjectSchema);
export const gitLabCommitListSchema = z.array(gitLabCommitSchema);

export type GitLabProject = z.infer<typeof gitLabProjectSchema>;
export type GitLabCommit = z.infer<typeof gitLabCommitSchema>;
export type GitLabCommitWithRepository = z.infer<
  typeof gitLabCommitWithRepositorySchema
>;
