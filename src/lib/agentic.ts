import { normalizeText } from './normalize';
import type {
  AgenticRewriteProposal,
  AgenticRewriteProvider,
  AgenticRewriteSource,
  AliasMemoryRecord,
  IntentType,
  QueryEntity,
  QueryUnderstanding,
  SuggestResponse,
} from './types';

const SUPPORTED_INTENTS: IntentType[] = [
  'Brand Search',
  'Category Search',
  'Nearby Search',
  'POI Search',
  'Address Suggestion',
  'Location Search',
  'Discovery Search',
  'Navigation',
  'Attribute Search',
  'Coordinate Search',
  'Ambiguous',
];

const SUPPORTED_ENTITY_KINDS: QueryEntity['kind'][] = [
  'brand',
  'category',
  'poi',
  'street',
  'city',
  'district',
  'attribute',
  'proximity',
  'navigation',
  'coordinate',
  'address',
];

interface LocalRewriteFixture {
  compact: string;
  rewrites: string[];
  intent: IntentType;
  entities: Array<Omit<QueryEntity, 'source'>>;
  confidence: number;
  evidence: string[];
}

interface AgenticTriggerContext {
  understanding: QueryUnderstanding;
  entities: QueryEntity[];
  intent: SuggestResponse['intent'];
  candidateCount: number;
  aliasMemory?: AliasMemoryRecord[];
  provider?: AgenticRewriteProvider;
  enabled?: boolean;
}

export interface AgenticCorrectionResult {
  triggered: boolean;
  provider: AgenticRewriteProvider;
  reason: string;
  appliedRewrite?: string;
  source?: AgenticRewriteSource;
  proposal?: AgenticRewriteProposal;
  aliasMemoryHits?: AliasMemoryRecord[];
}

const LOCAL_REWRITE_FIXTURES: LocalRewriteFixture[] = [
  {
    compact: 'caphe',
    rewrites: ['cà phê', 'quán cà phê'],
    intent: 'Category Search',
    entities: [{ kind: 'category', value: 'cà phê', confidence: 0.92 }],
    confidence: 0.91,
    evidence: ['caphe resembles Vietnamese no-space form of ca phe'],
  },
  {
    compact: 'khachsan',
    rewrites: ['khách sạn'],
    intent: 'Category Search',
    entities: [{ kind: 'category', value: 'khách sạn', confidence: 0.91 }],
    confidence: 0.9,
    evidence: ['khachsan resembles Vietnamese no-space form of khach san'],
  },
  {
    compact: 'benhvien',
    rewrites: ['bệnh viện'],
    intent: 'Nearby Search',
    entities: [{ kind: 'category', value: 'bệnh viện', confidence: 0.91 }],
    confidence: 0.89,
    evidence: ['benhvien resembles Vietnamese no-space form of benh vien'],
  },
  {
    compact: 'nhahang',
    rewrites: ['nhà hàng'],
    intent: 'Category Search',
    entities: [{ kind: 'category', value: 'nhà hàng', confidence: 0.88 }],
    confidence: 0.87,
    evidence: ['nhahang resembles Vietnamese no-space form of nha hang'],
  },
  {
    compact: 'trasua',
    rewrites: ['trà sữa'],
    intent: 'Discovery Search',
    entities: [{ kind: 'category', value: 'trà sữa', confidence: 0.87 }],
    confidence: 0.86,
    evidence: ['trasua resembles Vietnamese no-space form of tra sua'],
  },
  {
    compact: 'cayxang',
    rewrites: ['cây xăng'],
    intent: 'Nearby Search',
    entities: [{ kind: 'category', value: 'cây xăng', confidence: 0.9 }],
    confidence: 0.89,
    evidence: ['cayxang resembles Vietnamese no-space form of cay xang'],
  },
  {
    compact: 'duongden',
    rewrites: ['đường đến'],
    intent: 'Navigation',
    entities: [{ kind: 'navigation', value: 'đường đến', confidence: 0.9 }],
    confidence: 0.88,
    evidence: ['duongden resembles Vietnamese no-space navigation command duong den'],
  },
];

export function resolveAgenticCorrection(context: AgenticTriggerContext): AgenticCorrectionResult {
  const provider = context.enabled === false ? 'disabled' : (context.provider ?? 'local-rewrite-agent');
  if (provider === 'disabled') {
    return {
      triggered: false,
      provider,
      reason: 'agentic provider disabled',
    };
  }

  if (isCoordinateLike(context.understanding.normalized)) {
    return {
      triggered: false,
      provider,
      reason: 'coordinate-like query stays deterministic',
    };
  }

  const aliasMemoryHits = findAliasMemoryHits(context.understanding.normalized, context.aliasMemory ?? []);
  if (aliasMemoryHits.length > 0 && shouldTriggerAgenticCorrection(context)) {
    const proposal = proposalFromAliasMemory(aliasMemoryHits[0], provider);
    return {
      triggered: true,
      provider,
      reason: 'validated alias memory matched low-confidence query',
      appliedRewrite: proposal.rewrites[0],
      source: 'alias-memory',
      proposal,
      aliasMemoryHits,
    };
  }

  if (!shouldTriggerAgenticCorrection(context)) {
    return {
      triggered: false,
      provider,
      reason: 'deterministic result is strong enough',
      aliasMemoryHits,
    };
  }

  if (provider !== 'local-rewrite-agent') {
    return {
      triggered: true,
      provider,
      reason: `${provider} provider is not configured in the local demo`,
      aliasMemoryHits,
    };
  }

  const rawOutput = runLocalRewriteAgent(context.understanding.normalized);
  if (!rawOutput) {
    return {
      triggered: true,
      provider,
      reason: 'local rewrite agent found no validated rewrite',
      aliasMemoryHits,
    };
  }

  const parsed = parseAgenticRewriteOutput(rawOutput, context.understanding.normalized, provider, 'agent');
  if (!parsed.ok) {
    return {
      triggered: true,
      provider,
      reason: `agent output rejected: ${parsed.errors.join('; ')}`,
      aliasMemoryHits,
    };
  }

  return {
    triggered: true,
    provider,
    reason: 'local rewrite agent proposed validated rewrite',
    appliedRewrite: parsed.proposal.rewrites[0],
    source: 'agent',
    proposal: parsed.proposal,
    aliasMemoryHits,
  };
}

export function parseAgenticRewriteOutput(
  rawOutput: string,
  originalQuery: string,
  provider: AgenticRewriteProvider,
  source: AgenticRewriteSource,
): { ok: true; proposal: AgenticRewriteProposal } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  let payload: unknown;

  try {
    payload = JSON.parse(rawOutput);
  } catch {
    return { ok: false, errors: ['output is not valid JSON'] };
  }

  if (!isRecord(payload)) {
    return { ok: false, errors: ['output must be an object'] };
  }

  const rewrites = Array.isArray(payload.rewrites)
    ? payload.rewrites.filter((rewrite): rewrite is string => typeof rewrite === 'string').map((rewrite) => rewrite.trim())
    : [];
  const intent = typeof payload.intent === 'string' ? payload.intent : '';
  const confidence = typeof payload.confidence === 'number' ? payload.confidence : Number.NaN;
  const evidence = Array.isArray(payload.evidence)
    ? payload.evidence.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean)
    : [];
  const entities = parseEntities(payload.entities, source === 'alias-memory' ? 'alias-memory' : 'agent', errors);

  if (rewrites.length === 0) {
    errors.push('rewrites must include at least one string');
  }
  if (rewrites.length > 4) {
    errors.push('rewrites must include four items or fewer');
  }
  if (!SUPPORTED_INTENTS.includes(intent as IntentType)) {
    errors.push(`unsupported intent: ${intent || 'missing'}`);
  }
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    errors.push('confidence must be between 0 and 1');
  }
  if (evidence.length === 0) {
    errors.push('evidence is required');
  }

  const normalizedOriginal = normalizeText(originalQuery);
  const maxRewriteLength = Math.max(normalizedOriginal.length * 3, normalizedOriginal.length + 12);
  const normalizedRewrites = rewrites.map(normalizeText);
  if (normalizedRewrites.some((rewrite) => rewrite.length > maxRewriteLength)) {
    errors.push('rewrite is unreasonably longer than the original query');
  }
  if (normalizedRewrites.some((rewrite) => containsUnsupportedClaim(normalizedOriginal, rewrite))) {
    errors.push('rewrite introduces unrelated brand or place evidence');
  }

  const uniqueRewrites = [...new Set(rewrites.filter(Boolean))].slice(0, 4);
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    proposal: {
      rewrites: uniqueRewrites,
      intent: intent as IntentType,
      entities,
      confidence: roundScore(confidence),
      evidence,
      provider,
      source,
    },
  };
}

export function shouldTriggerAgenticCorrection(context: AgenticTriggerContext): boolean {
  const normalized = context.understanding.normalized;
  if (!normalized) {
    return false;
  }
  if (isCoordinateLike(normalized)) {
    return false;
  }
  if (
    context.candidateCount > 0 &&
    context.understanding.expansions.some(
      (expansion) => expansion.startsWith('syllable-segmentation:') || expansion.startsWith('telex-vni-decoder:'),
    )
  ) {
    return false;
  }
  if (context.candidateCount === 0) {
    return true;
  }
  if (context.intent.type === 'Ambiguous' && context.intent.confidence <= 0.45) {
    return true;
  }
  if (context.entities.length === 0 && normalized.replace(/\s+/g, '').length >= 4) {
    return true;
  }
  return hasKnownCompactRewrite(normalized);
}

export function findAliasMemoryHits(query: string, aliasMemory: AliasMemoryRecord[]): AliasMemoryRecord[] {
  const normalizedQuery = normalizeText(query);
  return aliasMemory
    .filter((record) => record.status !== 'rejected')
    .filter((record) => normalizeText(record.rawQuery) === normalizedQuery)
    .filter((record) => record.acceptedCount >= record.rejectedCount)
    .sort((a, b) => {
      const statusDelta = statusWeight(b.status) - statusWeight(a.status);
      if (statusDelta !== 0) return statusDelta;
      return b.acceptedCount - b.rejectedCount - (a.acceptedCount - a.rejectedCount);
    });
}

function runLocalRewriteAgent(query: string): string | null {
  const compactQuery = compact(query);
  const match = findLocalRewriteFixture(compactQuery);
  if (!match) {
    return null;
  }
  const { fixture, partial } = match;
  const confidence = partial
    ? Math.min(fixture.confidence, 0.72 + (compactQuery.length / fixture.compact.length) * 0.18)
    : fixture.confidence;
  const evidence = partial
    ? [`${query} is a compact prefix of Vietnamese phrase ${normalizeText(fixture.rewrites[0])}`]
    : fixture.evidence;
  return JSON.stringify({
    rewrites: fixture.rewrites,
    intent: fixture.intent,
    entities: fixture.entities,
    confidence,
    evidence,
  });
}

function proposalFromAliasMemory(record: AliasMemoryRecord, provider: AgenticRewriteProvider): AgenticRewriteProposal {
  return {
    rewrites: [record.rewrite],
    intent: record.intent,
    entities: record.entities.map((entity) => ({ ...entity, source: 'alias-memory' })),
    confidence: roundScore(Math.min(0.96, 0.74 + Math.max(0, record.acceptedCount - record.rejectedCount) * 0.02)),
    evidence: [`alias memory ${record.scope} ${record.status} correction`],
    provider,
    source: 'alias-memory',
  };
}

function parseEntities(rawEntities: unknown, source: QueryEntity['source'], errors: string[]): QueryEntity[] {
  if (!Array.isArray(rawEntities)) {
    errors.push('entities must be an array');
    return [];
  }

  return rawEntities.slice(0, 8).flatMap((item) => {
    if (!isRecord(item)) {
      errors.push('entity must be an object');
      return [];
    }
    const kind = typeof item.kind === 'string' ? item.kind : '';
    const value = typeof item.value === 'string' ? item.value.trim() : '';
    const confidence = typeof item.confidence === 'number' ? item.confidence : Number.NaN;
    if (!SUPPORTED_ENTITY_KINDS.includes(kind as QueryEntity['kind'])) {
      errors.push(`unsupported entity kind: ${kind || 'missing'}`);
      return [];
    }
    if (!value) {
      errors.push('entity value is required');
      return [];
    }
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      errors.push('entity confidence must be between 0 and 1');
      return [];
    }
    return [{ kind: kind as QueryEntity['kind'], value, source, confidence: roundScore(confidence) }];
  });
}

function containsUnsupportedClaim(original: string, rewrite: string): boolean {
  const protectedTerms = ['vincom', 'vinmec', 'vietcombank', 'highlands', 'noi bai', 'ben thanh', 'nguyen hue'];
  return protectedTerms.some((term) => rewrite.includes(term) && !original.includes(term));
}

function hasKnownCompactRewrite(query: string): boolean {
  return findLocalRewriteFixture(compact(query)) !== undefined;
}

function findLocalRewriteFixture(compactQuery: string): { fixture: LocalRewriteFixture; partial: boolean } | undefined {
  const exact = LOCAL_REWRITE_FIXTURES.find((fixture) => fixture.compact === compactQuery);
  if (exact) {
    return { fixture: exact, partial: false };
  }
  const partials = LOCAL_REWRITE_FIXTURES
    .filter((fixture) => isCrossSyllableCompactPrefix(compactQuery, fixture))
    .sort((a, b) => b.confidence - a.confidence || a.compact.length - b.compact.length);
  const [fixture] = partials;
  return fixture ? { fixture, partial: true } : undefined;
}

function isCrossSyllableCompactPrefix(compactQuery: string, fixture: LocalRewriteFixture): boolean {
  if (compactQuery.length < 3 || !fixture.compact.startsWith(compactQuery)) {
    return false;
  }
  const firstRewrite = normalizeText(fixture.rewrites[0]);
  const [firstToken] = firstRewrite.split(' ').filter(Boolean);
  return Boolean(firstToken) && compactQuery.length > firstToken.length;
}

function compact(value: string): string {
  return normalizeText(value).replace(/\s+/g, '');
}

function isCoordinateLike(query: string): boolean {
  return /^[\d.\s,]+$/.test(query) && /\d/.test(query);
}

function statusWeight(status: AliasMemoryRecord['status']): number {
  if (status === 'approved') return 2;
  if (status === 'candidate') return 1;
  return 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function roundScore(value: number): number {
  return Math.round(value * 1000) / 1000;
}
