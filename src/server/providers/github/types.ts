import { z } from 'zod';

export const gitHubCommitAuthorSchema = z.object({
  name: z.string(),
  email: z.string(),
  date: z.string(),
});

export const gitHubCommitDetailSchema = z.object({
  author: gitHubCommitAuthorSchema,
  message: z.string(),
  url: z.string(),
});

export const gitHubCommitItemSchema = z.object({
  sha: z.string().trim().min(1),
  commit: gitHubCommitDetailSchema,
  html_url: z.string(),
  repository: z.object({
    full_name: z.string().trim().min(1),
  }),
});

export const gitHubRepositoryCommitItemSchema = gitHubCommitItemSchema.omit({
  repository: true,
});

export const gitHubRepositorySchema = z.object({
  full_name: z.string().trim().min(1),
});

export const gitHubRepositoryListSchema = z.array(gitHubRepositorySchema);
export const gitHubRepositoryCommitListSchema = z.array(
  gitHubRepositoryCommitItemSchema,
);

export type GitHubCommitAuthor = z.infer<typeof gitHubCommitAuthorSchema>;
export type GitHubCommitDetail = z.infer<typeof gitHubCommitDetailSchema>;
export type GitHubCommitItem = z.infer<typeof gitHubCommitItemSchema>;
export type GitHubRepositoryCommitItem = z.infer<
  typeof gitHubRepositoryCommitItemSchema
>;
export type GitHubRepository = z.infer<typeof gitHubRepositorySchema>;
