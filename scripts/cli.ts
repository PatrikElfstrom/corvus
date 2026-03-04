#!/usr/bin/env bun

interface CliEnv {
  CORVUS_TASK_HOST: string;
  PORT: string;
  CORVUS_TASK_TOKEN?: string;
}

interface SyncCommand {
  command: 'sync';
  integrationIds: Array<string>;
  ignoreDateScope: boolean;
}

interface RunSyncOptions {
  ignoreDateScope?: boolean;
}

type FetchImplementation = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

function readCliEnv(): CliEnv {
  const host = process.env.CORVUS_TASK_HOST?.trim() || '127.0.0.1';
  const port = process.env.PORT?.trim() || '3000';
  const token = process.env.CORVUS_TASK_TOKEN?.trim();

  return {
    CORVUS_TASK_HOST: host,
    PORT: port,
    CORVUS_TASK_TOKEN: token ?? undefined,
  };
}

function usage(): void {
  console.error('Usage: corvus sync [--partial] [integration-id ...]');
}

async function readErrorDetail(response: Response): Promise<string | null> {
  const contentType = response.headers.get('content-type') ?? '';

  try {
    if (contentType.includes('application/json')) {
      const payload = await response.json();
      const message =
        typeof payload === 'object' && payload !== null
          ? (payload as { message?: unknown }).message
          : undefined;

      if (typeof message === 'string' && message.trim().length > 0) {
        return message.trim();
      }
    }

    const text = (await response.text()).trim();
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}

const PARTIAL_SYNC_FLAG = '--partial';

export function parseCliArgs(argv: Array<string>): SyncCommand | null {
  const [command, ...args] = argv;

  if (command !== 'sync') {
    return null;
  }

  const integrationIds: Array<string> = [];
  let ignoreDateScope = true;

  for (const arg of args) {
    if (arg === PARTIAL_SYNC_FLAG) {
      ignoreDateScope = false;
      continue;
    }

    if (arg.startsWith('-')) {
      return null;
    }

    integrationIds.push(arg);
  }

  return {
    command,
    integrationIds,
    ignoreDateScope,
  };
}

export async function runSync(
  integrationIds: Array<string>,
  options: RunSyncOptions = {
    ignoreDateScope: true,
  },
  fetchImplementation: FetchImplementation = fetch,
): Promise<number> {
  const env = readCliEnv();
  const taskName = 'sync:integrations';
  const url = `http://${env.CORVUS_TASK_HOST}:${env.PORT}/_internal/tasks/${taskName}`;

  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };

  const token = env.CORVUS_TASK_TOKEN;
  if (token) {
    headers['x-corvus-token'] = token;
  }

  const payload: {
    integrationIds?: Array<string>;
    ignoreDateScope?: boolean;
  } = {};

  if (integrationIds.length > 0) {
    payload.integrationIds = integrationIds;
  }

  payload.ignoreDateScope = options.ignoreDateScope ?? true;

  const response = await fetchImplementation(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const detail = await readErrorDetail(response);
    const suffix = detail ? `: ${detail}` : '';
    console.error(
      `Failed to trigger ${taskName} (${response.status} ${response.statusText})${suffix}`,
    );
    return 1;
  }

  let message = 'Sync triggered. Check server logs for progress and result.';
  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    try {
      const payload = await response.json();
      const parsedMessage =
        typeof payload === 'object' && payload !== null
          ? (payload as { message?: unknown }).message
          : undefined;

      if (
        typeof parsedMessage === 'string' &&
        parsedMessage.trim().length > 0
      ) {
        message = parsedMessage.trim();
      }
    } catch {
      // Ignore malformed payloads; the command was still accepted.
    }
  }

  console.log(message);
  return 0;
}

async function main(): Promise<number> {
  const parsedArgs = parseCliArgs(process.argv.slice(2));

  if (parsedArgs == null) {
    usage();
    return 1;
  }

  return runSync(parsedArgs.integrationIds, {
    ignoreDateScope: parsedArgs.ignoreDateScope,
  });
}

if (import.meta.main) {
  main()
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Failed to contact running Corvus server: ${message}`);
      console.error(
        'Make sure the app container is running before using corvus sync.',
      );
      return 1;
    })
    .then((exitCode) => {
      process.exitCode = exitCode;
    });
}
