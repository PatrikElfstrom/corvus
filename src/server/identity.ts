export function normalizeIdentity(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]/g, '');
}

export function normalizeIdentityMatchers(
  values: Array<string>,
): Array<string> {
  const seen = new Set<string>();
  const normalized: Array<string> = [];

  for (const value of values) {
    const next = normalizeIdentity(value);
    if (!next || seen.has(next)) continue;
    seen.add(next);
    normalized.push(next);
  }

  return normalized;
}

export function commitMatchesIdentity(
  authorName: string,
  authorEmail: string,
  identityMatchers: Array<string>,
): boolean {
  if (identityMatchers.length === 0) return true;

  const normalizedAuthorName = normalizeIdentity(authorName);
  const normalizedAuthorEmail = normalizeIdentity(authorEmail);
  const normalizedEmailLocalPart = normalizeIdentity(
    authorEmail.split('@')[0] ?? '',
  );

  return identityMatchers.some(
    (identity) =>
      normalizedAuthorName === identity ||
      normalizedAuthorEmail === identity ||
      normalizedEmailLocalPart === identity,
  );
}
