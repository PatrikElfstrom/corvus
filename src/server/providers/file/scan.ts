import type { Dirent, Stats } from 'node:fs';
import { lstat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { logger } from '../../logger.ts';
import type { ProviderFailure } from '../types.ts';

interface ScanDirectory {
  absolutePath: string;
  depth: number;
}

export interface DiscoveredGitRepository {
  absolutePath: string;
  repositoryFullName: string;
}

export interface ScanForGitRepositoriesOptions {
  rootPath: string;
  maxDepth: number;
  onFailure?(failure: ProviderFailure): void;
}

function emitFailure(
  onFailure: ((failure: ProviderFailure) => void) | undefined,
  failure: ProviderFailure,
): void {
  logger.warn(
    {
      targetType: failure.targetType,
      targetName: failure.targetName,
      message: failure.message,
    },
    'Local repository scan failure',
  );
  onFailure?.(failure);
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message.trim();
  }

  return String(error);
}

function toRepositoryFullName(
  rootPath: string,
  repositoryPath: string,
): string {
  const relativePath = path.relative(rootPath, repositoryPath);
  if (relativePath.length === 0) {
    return '.';
  }

  return relativePath.split(path.sep).join('/');
}

function toProjectTargetName(rootPath: string, directoryPath: string): string {
  const relativePath = path.relative(rootPath, directoryPath);
  if (relativePath.length === 0) {
    return rootPath;
  }

  return relativePath.split(path.sep).join('/');
}

async function hasGitMarker(directoryPath: string): Promise<boolean> {
  try {
    await lstat(path.join(directoryPath, '.git'));
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false;
    }

    throw error;
  }
}

export async function scanForGitRepositories(
  options: ScanForGitRepositoriesOptions,
): Promise<Array<DiscoveredGitRepository>> {
  const rootPath = path.resolve(options.rootPath);
  const onFailure = options.onFailure;
  const maxDepth = options.maxDepth;
  const repositories: Array<DiscoveredGitRepository> = [];
  const queue: Array<ScanDirectory> = [{ absolutePath: rootPath, depth: 0 }];

  while (queue.length > 0) {
    const currentDirectory = queue.shift();
    if (!currentDirectory) {
      break;
    }

    let directoryStats: Stats;
    try {
      directoryStats = await lstat(currentDirectory.absolutePath);
    } catch (error) {
      emitFailure(onFailure, {
        targetType: currentDirectory.depth === 0 ? 'workspace' : 'project',
        targetName: toProjectTargetName(
          rootPath,
          currentDirectory.absolutePath,
        ),
        repositoryFullName: null,
        commitHash: null,
        statusCode: null,
        message: `Failed to inspect directory: ${formatErrorMessage(error)}`,
      });
      continue;
    }

    if (directoryStats.isSymbolicLink()) {
      continue;
    }

    if (!directoryStats.isDirectory()) {
      if (currentDirectory.depth === 0) {
        emitFailure(onFailure, {
          targetType: 'workspace',
          targetName: rootPath,
          repositoryFullName: null,
          commitHash: null,
          statusCode: null,
          message: 'Configured scan path is not a directory.',
        });
      }
      continue;
    }

    try {
      if (await hasGitMarker(currentDirectory.absolutePath)) {
        repositories.push({
          absolutePath: currentDirectory.absolutePath,
          repositoryFullName: toRepositoryFullName(
            rootPath,
            currentDirectory.absolutePath,
          ),
        });
        continue;
      }
    } catch (error) {
      emitFailure(onFailure, {
        targetType: currentDirectory.depth === 0 ? 'workspace' : 'project',
        targetName: toProjectTargetName(
          rootPath,
          currentDirectory.absolutePath,
        ),
        repositoryFullName: null,
        commitHash: null,
        statusCode: null,
        message: `Failed to inspect git metadata: ${formatErrorMessage(error)}`,
      });
      continue;
    }

    if (currentDirectory.depth >= maxDepth) {
      continue;
    }

    let directoryEntries: Array<Dirent>;
    try {
      directoryEntries = await readdir(currentDirectory.absolutePath, {
        withFileTypes: true,
      });
    } catch (error) {
      emitFailure(onFailure, {
        targetType: currentDirectory.depth === 0 ? 'workspace' : 'project',
        targetName: toProjectTargetName(
          rootPath,
          currentDirectory.absolutePath,
        ),
        repositoryFullName: null,
        commitHash: null,
        statusCode: null,
        message: `Failed to read directory: ${formatErrorMessage(error)}`,
      });
      continue;
    }

    const childDirectories = directoryEntries
      .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b));

    for (const childDirectoryName of childDirectories) {
      queue.push({
        absolutePath: path.join(
          currentDirectory.absolutePath,
          childDirectoryName,
        ),
        depth: currentDirectory.depth + 1,
      });
    }
  }

  return repositories;
}
