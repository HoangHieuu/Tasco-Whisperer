import type { AbbreviationRecord, QueryUnderstanding } from './types';

const TOKEN_BOUNDARY = /[\s,.;:!?()[\]{}"']+/g;

const COMMON_ALIASES = new Map<string, string>([
  ['cafe', 'cà phê'],
  ['coffee', 'cà phê'],
  ['cf', 'cà phê'],
  ['near', 'gần đây'],
  ['near me', 'gần đây'],
  ['hotel', 'khách sạn'],
  ['xang', 'xăng'],
  ['tram x', 'trạm xăng'],
  ['cay xang', 'cây xăng'],
  ['benh vien', 'bệnh viện'],
  ['khach san', 'khách sạn'],
  ['sieuthi', 'siêu thị'],
  ['gara oto', 'garage ô tô'],
  ['oto', 'ô tô'],
  ['cho', 'chợ'],
  ['ben thanh', 'bến thành'],
  ['nguyen huee', 'nguyễn huệ'],
  ['da n', 'đà nẵng'],
  ['danang', 'đà nẵng'],
  ['hcm', 'TP.HCM'],
  ['bk', 'bách khoa'],
  ['q', 'quận'],
]);

export function queryAliasEntries(): Array<[string, string]> {
  return [...COMMON_ALIASES.entries()];
}

export function stripVietnameseAccents(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

export function normalizeText(value: string): string {
  return stripVietnameseAccents(value)
    .toLowerCase()
    .replace(/[-_/]+/g, ' ')
    .replace(/[^\p{L}\p{N}\s.]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenize(value: string): string[] {
  return normalizeText(value).split(TOKEN_BOUNDARY).filter(Boolean);
}

export function expandQuery(query: string, abbreviations: AbbreviationRecord[]): QueryUnderstanding {
  const normalized = normalizeText(query);
  let expanded = normalized;
  const expansions: string[] = [];

  for (const [alias, replacement] of queryAliasEntries()) {
    const normalizedAlias = normalizeText(alias);
    if (containsTokenPhrase(expanded, normalizedAlias)) {
      const normalizedReplacement = normalizeText(replacement);
      expanded = replaceTokenPhrase(expanded, normalizedAlias, normalizedReplacement);
      expansions.push(`${alias} -> ${replacement}`);
    }
  }

  const sorted = [...abbreviations].sort(
    (a, b) => normalizeText(b.abbreviation).length - normalizeText(a.abbreviation).length,
  );

  for (const item of sorted) {
    const abbreviation = normalizeText(item.abbreviation);
    if (!abbreviation || !containsTokenPhrase(expanded, abbreviation)) {
      continue;
    }
    const replacement = normalizeText(item.expandedForm);
    expanded = replaceTokenPhrase(expanded, abbreviation, replacement);
    expansions.push(`${item.abbreviation} -> ${item.expandedForm}`);
  }

  return {
    original: query,
    normalized,
    expanded: expanded.replace(/\s+/g, ' ').trim(),
    expansions,
    tokens: tokenize(expanded),
  };
}

export function containsTokenPhrase(text: string, phrase: string): boolean {
  const normalizedText = ` ${normalizeText(text)} `;
  const normalizedPhrase = ` ${normalizeText(phrase)} `;
  return normalizedText.includes(normalizedPhrase);
}

function replaceTokenPhrase(text: string, phrase: string, replacement: string): string {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return text.replace(new RegExp(`(^|\\s)${escaped}(?=\\s|$)`, 'g'), `$1${replacement}`);
}

export function fuzzyIncludes(haystack: string, needle: string): boolean {
  const normalizedHaystack = normalizeText(haystack);
  const normalizedNeedle = normalizeText(needle);
  if (!normalizedNeedle) {
    return true;
  }
  if (normalizedHaystack === normalizedNeedle) {
    return true;
  }
  if (normalizedNeedle.length >= 3 && normalizedHaystack.includes(normalizedNeedle)) {
    return true;
  }
  if (normalizedHaystack.length >= 3 && normalizedNeedle.includes(normalizedHaystack)) {
    return true;
  }
  const significantTokens = normalizedNeedle.split(' ').filter((token) => token.length >= 3);
  if (significantTokens.length === 0) {
    return false;
  }
  const haystackTokens = normalizedHaystack.split(' ').filter(Boolean);
  return significantTokens.every((token) => {
    if (token.length <= 3) {
      return haystackTokens.some((haystackToken) => haystackToken.startsWith(token));
    }
    return (
      normalizedHaystack.includes(token) ||
      haystackTokens.some((haystackToken) => haystackToken[0] === token[0] && levenshtein(haystackToken, token) <= 1)
    );
  });
}

export function levenshtein(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp = Array.from({ length: rows }, () => Array<number>(cols).fill(0));
  for (let i = 0; i < rows; i += 1) dp[i][0] = i;
  for (let j = 0; j < cols; j += 1) dp[0][j] = j;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[a.length][b.length];
}
