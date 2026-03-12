export interface ParsedSyncFailureError {
  message: string;
  statusCode: number | null;
  commitHash: string | null;
}

function pickErrorValue(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  return null;
}

function parseBodyMessage(rawBody: string): string {
  const trimmed = rawBody.trim();
  if (!trimmed) return 'Unknown API error';

  try {
    const parsed = JSON.parse(trimmed) as unknown;

    if (typeof parsed === 'string' && parsed.trim()) {
      return parsed.trim();
    }

    if (parsed && typeof parsed === 'object') {
      const record = parsed as Record<string, unknown>;
      const direct =
        pickErrorValue(record.message) ??
        pickErrorValue(record.error) ??
        pickErrorValue(record.error_description) ??
        pickErrorValue(record.detail) ??
        pickErrorValue(record.summary);

      if (direct) return direct;
    }
  } catch {
    // Body is not valid JSON; keep plain text fallback.
  }

  return trimmed;
}

function parseStatusCode(rawMessage: string): number | null {
  const apiMatch = rawMessage.match(/\bAPI error\s+(\d{3})\b/i);
  if (apiMatch) {
    return Number(apiMatch[1]);
  }

  if (/rate limited/i.test(rawMessage)) {
    return 429;
  }

  return null;
}

function parseCommitHash(rawMessage: string): string | null {
  const urlHashMatch = rawMessage.match(
    /\/commits\/([0-9a-f]{7,40})(?:[/?#]|$)/i,
  );
  if (urlHashMatch) {
    return urlHashMatch[1];
  }

  return null;
}

export function parseSyncFailureError(error: unknown): ParsedSyncFailureError {
  const rawMessage =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'Unknown sync failure';

  const statusCode = parseStatusCode(rawMessage);
  const commitHash = parseCommitHash(rawMessage);

  const apiBodyMatch = rawMessage.match(/\bAPI error\s+\d{3}:\s*([\s\S]+)$/i);
  const message = apiBodyMatch
    ? parseBodyMessage(apiBodyMatch[1])
    : rawMessage.trim() || 'Unknown sync failure';

  return {
    message,
    statusCode,
    commitHash,
  };
}
