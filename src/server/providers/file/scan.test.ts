import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { scanForGitRepositories } from './scan.ts';

function withTempDirectory(
  callback: (directory: string) => void | Promise<void>,
): Promise<void> {
  const directory = mkdtempSync(
    path.join(os.tmpdir(), 'corvus-file-scan-test-'),
  );

  return Promise.resolve(callback(directory)).finally(() => {
    rmSync(directory, { recursive: true, force: true });
  });
}

function markGitRepository(directory: string): void {
  mkdirSync(path.join(directory, '.git'), { recursive: true });
}

test('scanForGitRepositories respects depth boundaries', async () => {
  await withTempDirectory(async (rootPath) => {
    markGitRepository(path.join(rootPath, 'one'));
    markGitRepository(path.join(rootPath, 'two', 'nested'));

    const depthOneRepositories = await scanForGitRepositories({
      rootPath,
      maxDepth: 1,
    });
    const depthTwoRepositories = await scanForGitRepositories({
      rootPath,
      maxDepth: 2,
    });

    assert.deepEqual(
      depthOneRepositories.map((repository) => repository.repositoryFullName),
      ['one'],
    );
    assert.deepEqual(
      depthTwoRepositories.map((repository) => repository.repositoryFullName),
      ['one', 'two/nested'],
    );
  });
});

test('scanForGitRepositories prunes nested repositories once parent repo is found', async () => {
  await withTempDirectory(async (rootPath) => {
    markGitRepository(path.join(rootPath, 'parent'));
    markGitRepository(path.join(rootPath, 'parent', 'child'));

    const repositories = await scanForGitRepositories({
      rootPath,
      maxDepth: 4,
    });

    assert.deepEqual(
      repositories.map((repository) => repository.repositoryFullName),
      ['parent'],
    );
  });
});

test('scanForGitRepositories skips symlinked directories', async (t) => {
  await withTempDirectory(async (rootPath) => {
    const externalRepository = mkdtempSync(
      path.join(os.tmpdir(), 'corvus-file-scan-symlink-target-'),
    );

    try {
      markGitRepository(externalRepository);

      try {
        symlinkSync(
          externalRepository,
          path.join(rootPath, 'symlinked-repository'),
          'dir',
        );
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EPERM') {
          t.skip('Symlinks are not supported in this environment');
          return;
        }

        throw error;
      }

      const repositories = await scanForGitRepositories({
        rootPath,
        maxDepth: 1,
      });
      assert.deepEqual(repositories, []);
    } finally {
      rmSync(externalRepository, { recursive: true, force: true });
    }
  });
});

test('scanForGitRepositories uses relative repository names and "." for root repository', async () => {
  await withTempDirectory(async (rootPath) => {
    markGitRepository(rootPath);
    markGitRepository(path.join(rootPath, 'nested'));

    const repositories = await scanForGitRepositories({
      rootPath,
      maxDepth: 2,
    });

    assert.deepEqual(
      repositories.map((repository) => repository.repositoryFullName),
      ['.'],
    );
  });
});
