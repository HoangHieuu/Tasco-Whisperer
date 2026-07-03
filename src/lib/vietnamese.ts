import { normalizeText } from './normalize';
import type { AbbreviationRecord, TascoDataset } from './types';

export interface VietnameseQueryKnowledge {
  tokens: Set<string>;
  phrases: string[];
}

export interface VietnameseRewrite {
  rewrite: string;
  confidence: number;
  reason: string;
  source: 'syllable-segmentation' | 'telex-vni-decoder';
}

const COMMON_DOMAIN_PHRASES = [
  'ca phe',
  'quan ca phe',
  'khach san',
  'benh vien',
  'nha hang',
  'cay xang',
  'tram xang',
  'tra sua',
  'sieu thi',
  'nha thuoc',
  'duong den',
  'chi duong',
  'san bay',
  'ben xe',
  'hoc vien',
  'trung tam',
  'gara o to',
  'garage o to',
  'quan nuong',
  'quan chay',
  'quan an',
  'an dem',
  'gan day',
  'gan nhat',
  'gan bien',
  'mo cua',
  'lam viec',
  'hoc tap',
  'check in',
  'song ao',
];

const COMMON_SYLLABLES = [
  'an',
  'atm',
  'bach',
  'bay',
  'ben',
  'benh',
  'bien',
  'ca',
  'cafe',
  'cay',
  'chay',
  'check',
  'cho',
  'cong',
  'da',
  'day',
  'dem',
  'den',
  'dia',
  'duong',
  'gan',
  'gara',
  'garage',
  'ha',
  'hoc',
  'hue',
  'khach',
  'khoa',
  'lam',
  'long',
  'mart',
  'mo',
  'mua',
  'my',
  'nang',
  'nha',
  'nhat',
  'noi',
  'nuong',
  'oto',
  'phe',
  'phong',
  'phuc',
  'quan',
  'sach',
  'san',
  'sua',
  'sua',
  'tam',
  'thanh',
  'thi',
  'thuoc',
  'tin',
  'tra',
  'tram',
  'trung',
  'vien',
  'vin',
  'wifi',
  'xang',
];

export function buildVietnameseQueryKnowledge(dataset: TascoDataset): VietnameseQueryKnowledge {
  const phrases = new Set<string>();
  const tokens = new Set<string>(COMMON_SYLLABLES);

  for (const phrase of COMMON_DOMAIN_PHRASES) {
    addPhrase(phrases, tokens, phrase);
  }

  for (const abbreviation of dataset.abbreviations) {
    addPhrase(phrases, tokens, abbreviation.abbreviation);
    addPhrase(phrases, tokens, abbreviation.expandedForm);
  }

  for (const row of dataset.autocomplete) {
    addPhrase(phrases, tokens, row.inputPrefix);
    addPhrase(phrases, tokens, row.suggestionText);
  }

  for (const row of dataset.popularQueries) {
    addPhrase(phrases, tokens, row.queryText);
    addPhrase(phrases, tokens, row.region);
  }

  for (const row of dataset.pois) {
    addPhrase(phrases, tokens, row.poiName);
    addPhrase(phrases, tokens, row.category);
    addPhrase(phrases, tokens, row.brand);
    addPhrase(phrases, tokens, row.address);
    addPhrase(phrases, tokens, row.city);
    for (const tag of row.tags) {
      addPhrase(phrases, tokens, tag);
    }
  }

  return {
    tokens,
    phrases: [...phrases].filter((phrase) => phrase.includes(' ')).sort((a, b) => compact(a).length - compact(b).length),
  };
}

export function proposeVietnameseRewrites(
  query: string,
  knowledge: VietnameseQueryKnowledge,
  abbreviations: AbbreviationRecord[] = [],
): VietnameseRewrite[] {
  const normalized = normalizeText(query);
  if (!normalized || isCoordinateLike(normalized)) {
    return [];
  }

  const rewrites: VietnameseRewrite[] = [];
  const telexDecoded = decodeTelexVni(normalized, knowledge);
  if (telexDecoded !== normalized) {
    rewrites.push({
      rewrite: telexDecoded,
      confidence: 0.82,
      reason: `Telex/VNI-style cleanup: ${normalized} -> ${telexDecoded}`,
      source: 'telex-vni-decoder',
    });
  }

  for (const candidate of [normalized, telexDecoded]) {
    const segmented = segmentCompactQuery(candidate, knowledge, abbreviations);
    if (segmented && segmented !== normalized && !rewrites.some((rewrite) => normalizeText(rewrite.rewrite) === segmented)) {
      rewrites.push({
        rewrite: segmented,
        confidence: compact(segmented) === compact(candidate) ? 0.9 : 0.84,
        reason: `Vietnamese compact syllable segmentation: ${candidate} -> ${segmented}`,
        source: 'syllable-segmentation',
      });
    }
  }

  return rewrites.sort((a, b) => b.confidence - a.confidence).slice(0, 3);
}

export function segmentCompactQuery(
  query: string,
  knowledge: VietnameseQueryKnowledge,
  abbreviations: AbbreviationRecord[] = [],
): string | undefined {
  const normalized = normalizeText(query);
  const compactQuery = compact(normalized);
  if (!compactQuery || normalized.includes(' ') || compactQuery.length < 3) {
    return undefined;
  }

  const phraseMatch = phraseForCompactPrefix(compactQuery, knowledge.phrases, abbreviations);
  if (phraseMatch) {
    return phraseMatch;
  }

  const segmented = segmentByTokenDictionary(compactQuery, knowledge.tokens);
  if (segmented && segmented.includes(' ')) {
    return segmented;
  }

  return undefined;
}

export function decodeTelexVni(query: string, knowledge?: VietnameseQueryKnowledge): string {
  return normalizeText(query)
    .split(' ')
    .map((token) => decodeTelexToken(token, knowledge))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeTelexToken(token: string, knowledge?: VietnameseQueryKnowledge): string {
  if (token.length < 3) {
    return token;
  }

  const decoded = token
    .replace(/dd/g, 'd')
    .replace(/aa/g, 'a')
    .replace(/aw/g, 'a')
    .replace(/ee/g, 'e')
    .replace(/oo/g, 'o')
    .replace(/ow/g, 'o')
    .replace(/uw/g, 'u')
    .replace(/([aeiouy])w/g, '$1');
  if (decoded !== token && (!knowledge || knowledge.tokens.has(decoded))) {
    return decoded;
  }

  const withoutTone = token.replace(/([aeiouy][a-z]*?)[sfrxj]$/u, '$1');
  if (withoutTone !== token && (!knowledge || knowledge.tokens.has(withoutTone))) {
    return withoutTone;
  }

  return token;
}

function phraseForCompactPrefix(
  compactQuery: string,
  phrases: string[],
  abbreviations: AbbreviationRecord[],
): string | undefined {
  const abbreviationExpansions = abbreviations
    .map((item) => normalizeText(item.expandedForm))
    .filter((item) => item.includes(' '));
  const candidates = [...phrases, ...abbreviationExpansions]
    .filter((phrase) => {
      const compactPhrase = compact(phrase);
      if (!compactPhrase.startsWith(compactQuery)) {
        return false;
      }
      const [firstToken] = phrase.split(' ').filter(Boolean);
      return Boolean(firstToken) && compactQuery.length > firstToken.length;
    })
    .sort((a, b) => compact(a).length - compact(b).length);
  return candidates[0];
}

function segmentByTokenDictionary(compactQuery: string, tokens: Set<string>): string | undefined {
  const dp: Array<{ score: number; parts: string[] } | undefined> = Array(compactQuery.length + 1).fill(undefined);
  dp[0] = { score: 0, parts: [] };

  for (let end = 1; end <= compactQuery.length; end += 1) {
    for (let start = Math.max(0, end - 12); start < end; start += 1) {
      const token = compactQuery.slice(start, end);
      const previous = dp[start];
      if (!previous || !tokens.has(token)) {
        continue;
      }
      const score = previous.score + tokenScore(token);
      const current = dp[end];
      if (!current || score > current.score) {
        dp[end] = { score, parts: [...previous.parts, token] };
      }
    }
  }

  const best = dp[compactQuery.length];
  if (!best || best.parts.length < 2) {
    return undefined;
  }

  return best.parts.join(' ');
}

function addPhrase(phrases: Set<string>, tokens: Set<string>, phrase: string): void {
  const normalized = normalizeText(phrase);
  if (!normalized) {
    return;
  }
  phrases.add(normalized);
  for (const token of normalized.split(' ').filter(Boolean)) {
    if (token.length >= 2) {
      tokens.add(token);
    }
  }
}

function tokenScore(token: string): number {
  if (token.length >= 4) return 4;
  if (token.length === 3) return 2;
  return 1;
}

function compact(value: string): string {
  return normalizeText(value).replace(/\s+/g, '');
}

function isCoordinateLike(query: string): boolean {
  return /^[\d.\s,]+$/.test(query) && /\d/.test(query);
}
