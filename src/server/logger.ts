import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import pino from 'pino';
import pretty from 'pino-pretty';
import { env } from './env.ts';

const logFilePath = resolve(env.LOG_FILE_PATH);
mkdirSync(dirname(logFilePath), { recursive: true });

const stream = pino.multistream([
  {
    stream: pretty({
      destination: logFilePath,
      colorize: false,
      translateTime: 'yyyy-mm-dd HH:MM:ss.l',
      ignore: 'pid,hostname',
      mkdir: true,
    }),
  },
  {
    stream: pretty({
      destination: 2,
      colorize: process.stderr.isTTY,
      translateTime: 'yyyy-mm-dd HH:MM:ss.l',
      ignore: 'pid,hostname',
    }),
  },
]);

export const logger = pino(
  {
    level: env.LOG_LEVEL,
  },
  stream,
);
