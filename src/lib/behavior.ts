import { containsTokenPhrase, normalizeText } from './normalize';
import type { BehaviorEvent, SuggestRequest, Suggestion } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;
const RECENCY_HALF_LIFE_DAYS = 14;
const KNOWN_CITY_ALIASES: Record<string, string[]> = {
  'tp.hcm': ['tp.hcm', 'tp hcm', 'hcm', 'ho chi minh', 'thanh pho ho chi minh', 'sai gon', 'sg'],
  'ha noi': ['ha noi', 'hn'],
  'da nang': ['da nang', 'dn'],
  'da lat': ['da lat', 'dl'],
  'nha trang': ['nha trang', 'nt'],
  'hai phong': ['hai phong', 'hp'],
};

export interface BehaviorBoostResult {
  boost: number;
  reason: string;
  matchedTerms: string[];
  totalWeight: number;
}

export interface BehaviorBoostOptions {
  now?: Date;
  limit?: number;
  maxBoost?: number;
}

export interface ApplyBehaviorOptions {
  refreshSuggestion?: (suggestion: Suggestion) => Suggestion;
  maxScoreBoost?: number;
  scoreBoostScale?: number;
  skipWhenAlreadyPersonalized?: boolean;
}

export function behaviorBoostForHaystack({
  userId,
  behaviorEvents = [],
  haystack,
  requestCity,
  now = new Date(),
  limit = 80,
  maxBoost = 1,
}: {
  userId?: string;
  behaviorEvents?: BehaviorEvent[];
  haystack: string;
  requestCity?: string;
} & BehaviorBoostOptions): BehaviorBoostResult {
  if (!userId || !behaviorEvents.length) {
    return emptyBehaviorBoost();
  }

  const normalizedUser = normalizeText(userId);
  const normalizedHaystack = normalizeText(haystack);
  const termWeights = new Map<string, { label: string; weight: number }>();
  const events = behaviorEvents
    .filter((event) => normalizeText(event.userId) === normalizedUser)
    .filter((event) => !requestCity || !event.city || sameBehaviorCity(event.city, requestCity))
    .slice(-limit)
    .reverse();

  for (const event of events) {
    const eventWeight = recencyWeight(event.occurredAt, now);
    for (const term of behaviorTerms(event)) {
      const normalizedTerm = normalizeText(term);
      if (normalizedTerm.length < 3 || !normalizedHaystack.includes(normalizedTerm)) {
        continue;
      }
      const existing = termWeights.get(normalizedTerm);
      termWeights.set(normalizedTerm, {
        label: existing?.label ?? term,
        weight: (existing?.weight ?? 0) + eventWeight,
      });
    }
  }

  if (termWeights.size === 0) {
    return emptyBehaviorBoost();
  }

  const rankedTerms = [...termWeights.values()].sort((a, b) => b.weight - a.weight || a.label.localeCompare(b.label));
  const totalWeight = rankedTerms.reduce((sum, term) => sum + term.weight, 0);
  const matchedTerms = rankedTerms.slice(0, 3).map((term) => term.label);
  const frequencyComponent = Math.min(0.34, Math.log1p(totalWeight) * 0.22);
  const breadthComponent = Math.min(0.24, termWeights.size * 0.06);
  const boost = Math.min(maxBoost, 0.36 + frequencyComponent + breadthComponent);

  return {
    boost,
    reason: `Local learner: prior result selections match ${matchedTerms.join(', ')}`,
    matchedTerms,
    totalWeight,
  };
}

export function behaviorTerms(event: BehaviorEvent): string[] {
  return [
    event.query,
    event.selectedText,
    event.selectedType,
    event.brand ?? '',
    event.category ?? '',
    event.city ?? '',
  ].filter(Boolean);
}

export function applyBehaviorPersonalizationToSuggestions(
  suggestions: Suggestion[],
  request: SuggestRequest,
  {
    refreshSuggestion,
    maxScoreBoost = 0.2,
    scoreBoostScale = 0.24,
    skipWhenAlreadyPersonalized = false,
  }: ApplyBehaviorOptions = {},
): Suggestion[] {
  if (!request.userId || !request.behaviorEvents?.length) {
    return suggestions;
  }

  return suggestions
    .map((suggestion) => {
      if (skipWhenAlreadyPersonalized && suggestion.metadata.factors.personalization > 0) {
        return suggestion;
      }
      const behavior = behaviorBoostForHaystack({
        userId: request.userId,
        behaviorEvents: request.behaviorEvents,
        requestCity: request.city,
        haystack: `${suggestion.text} ${suggestion.type} ${suggestion.metadata.reason} ${suggestion.metadata.category ?? ''} ${
          suggestion.metadata.brand ?? ''
        } ${suggestion.metadata.city ?? ''} ${suggestion.metadata.address ?? ''}`,
      });
      if (behavior.boost <= 0) {
        return suggestion;
      }
      const scoreBoost = Math.min(maxScoreBoost, behavior.boost * scoreBoostScale);
      const personalized: Suggestion = {
        ...suggestion,
        score: clampScore(suggestion.score + scoreBoost),
        metadata: {
          ...suggestion.metadata,
          factors: {
            ...suggestion.metadata.factors,
            personalization: Math.min(1, suggestion.metadata.factors.personalization + behavior.boost),
          },
          personalizationReason: behavior.reason,
        },
      };
      return refreshSuggestion ? refreshSuggestion(personalized) : personalized;
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.metadata.factors.personalization - a.metadata.factors.personalization ||
        a.text.localeCompare(b.text),
    );
}

export function sameBehaviorCity(left: string, right: string): boolean {
  const leftAliases = cityAliases(left);
  const rightAliases = cityAliases(right);
  return leftAliases.some((leftAlias) => rightAliases.some((rightAlias) => leftAlias === rightAlias));
}

function cityAliases(city: string): string[] {
  const normalized = normalizeText(city);
  const aliases = new Set([normalized]);
  for (const [canonical, values] of Object.entries(KNOWN_CITY_ALIASES)) {
    if (normalized === canonical || values.includes(normalized)) {
      values.forEach((value) => aliases.add(value));
    }
  }
  if (containsTokenPhrase(normalized, 'ho chi minh')) {
    KNOWN_CITY_ALIASES['tp.hcm'].forEach((value) => aliases.add(value));
  }
  return [...aliases];
}

function recencyWeight(occurredAt: string, now: Date): number {
  const occurred = Date.parse(occurredAt);
  if (!Number.isFinite(occurred)) {
    return 1;
  }
  const ageDays = Math.max(0, (now.getTime() - occurred) / DAY_MS);
  return Math.exp(-ageDays / RECENCY_HALF_LIFE_DAYS);
}

function emptyBehaviorBoost(): BehaviorBoostResult {
  return { boost: 0, reason: '', matchedTerms: [], totalWeight: 0 };
}

function clampScore(value: number): number {
  return Math.min(1, Math.max(0, Math.round(value * 1000) / 1000));
}
