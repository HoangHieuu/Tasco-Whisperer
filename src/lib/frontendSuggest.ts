import { browserDataset } from './browserDataset';
import { suggest } from './engine';
import { normalizeText } from './normalize';
import type { PlaceResult, TascoAutocompleteResponse } from './tascoFacade';
import type { IntentType, QueryEntity, ScoreFactors, SuggestRequest, SuggestResponse, Suggestion } from './types';

export type FrontendTransport = 'api' | 'local-fallback';

export interface FrontendSuggestResponse extends SuggestResponse {
  transport: FrontendTransport;
  facadeSource: 'live' | 'local-fallback' | 'browser-fallback';
  apiBaseUrl: string;
  transportReason: string;
}

interface FetchFrontendSuggestOptions {
  signal?: AbortSignal;
  apiBaseUrl?: string;
}

const DEFAULT_API_BASE_URL = 'http://127.0.0.1:8787';

export function localFrontendSuggest(request: SuggestRequest, reason = 'browser fallback returned'): FrontendSuggestResponse {
  return {
    ...suggest(browserDataset, request),
    transport: 'local-fallback',
    facadeSource: 'browser-fallback',
    apiBaseUrl: resolveApiBaseUrl(),
    transportReason: reason,
  };
}

export async function fetchFrontendSuggest(
  request: SuggestRequest,
  options: FetchFrontendSuggestOptions = {},
): Promise<FrontendSuggestResponse> {
  if (!request.q.trim()) {
    return localFrontendSuggest(request, 'empty query uses browser defaults');
  }

  const apiBaseUrl = options.apiBaseUrl ?? resolveApiBaseUrl();
  const url = new URL('/v1/autocomplete', apiBaseUrl);
  url.searchParams.set('q', request.q);
  url.searchParams.set('limit', String(request.limit ?? 8));
  url.searchParams.set('lang', 'vi');
  if (request.userId) {
    url.searchParams.set('sessionId', request.userId);
  }
  if (request.lat != null && request.lon != null) {
    url.searchParams.set('lat', String(request.lat));
    url.searchParams.set('lon', String(request.lon));
  }

  try {
    const started = performance.now();
    const response = await fetch(url, { signal: options.signal });
    if (!response.ok) {
      throw new Error(`TASCO facade returned HTTP ${response.status}`);
    }
    const payload = (await response.json()) as TascoAutocompleteResponse;
    const local = suggest(browserDataset, request);
    const suggestions = applyBehaviorContext(
      payload.suggestions.map((place, index) => placeToSuggestion(place, request.q, index)),
      request,
    );
    return {
      ...local,
      query: payload.query,
      normalizedQuery: payload.meta.normalizedQuery,
      expandedQuery: payload.meta.expandedQuery,
      suggestions,
      latencyMs: Math.max(1, Math.round(performance.now() - started)),
      diagnostics: {
        ...local.diagnostics,
        expansions: buildFacadeExpansions(local.diagnostics.expansions, payload),
        candidateCount: payload.suggestions.length,
        agentic: {
          ...local.diagnostics.agentic,
          reason: payload.meta.upstreamUsed
            ? 'TASCO live autocomplete API returned results'
            : 'TASCO facade used local fallback results',
        },
        entities: mergeFacadeEntities(local.diagnostics.entities, payload.suggestions),
      },
      transport: 'api',
      facadeSource: payload.meta.source,
      apiBaseUrl,
      transportReason: payload.meta.upstreamUsed ? 'live TASCO upstream used' : 'local TASCO facade fallback used',
    };
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
    return localFrontendSuggest(
      request,
      error instanceof Error ? `TASCO facade unavailable: ${error.message}` : 'TASCO facade unavailable',
    );
  }
}

function resolveApiBaseUrl(): string {
  const configured = import.meta.env.VITE_TASCO_API_BASE_URL?.trim();
  return configured || DEFAULT_API_BASE_URL;
}

function placeToSuggestion(place: PlaceResult, query: string, index: number): Suggestion {
  const score = clampScore(place.score ?? 0.7);
  const type = inferIntentType(place);
  return {
    id: `tasco:${place.id}:${index}`,
    text: place.label || place.name,
    normalizedText: normalizeText(place.label || place.name),
    type,
    score,
    source: place.type === 'query' ? 'popular-query' : 'poi',
    matched: [query],
    poiId: place.id.startsWith('poi:') ? place.id.replace(/^poi:/, '') : place.id,
    metadata: {
      reason: `${place.source === 'live' ? 'TASCO live API' : 'TASCO facade fallback'} matched ${place.name}`,
      city: inferCity(place),
      address: place.address,
      category: place.category,
      factors: scoreFactors(score, place),
    },
  };
}

function inferIntentType(place: PlaceResult): IntentType {
  const normalized = normalizeText(`${place.category ?? ''} ${place.name} ${place.label}`);
  if (place.type === 'query') {
    return normalized.includes('gan day') ? 'Nearby Search' : 'Category Search';
  }
  if (normalized.includes('atm') || normalized.includes('benh vien') || normalized.includes('xang')) {
    return 'Nearby Search';
  }
  if (normalized.includes('duong') || /\b\d+[\s,]/.test(normalized)) {
    return 'Address Suggestion';
  }
  if (place.category) {
    return 'Category Search';
  }
  return 'POI Search';
}

function scoreFactors(score: number, place: PlaceResult): ScoreFactors {
  return {
    lexical: score,
    intent: place.category ? 0.86 : 0.72,
    source: place.source === 'live' ? 1 : 0.84,
    popularity: score,
    poiQuality: place.type === 'poi' ? Math.max(0.7, score) : 0.64,
    locality: place.distanceMeters == null ? 0.7 : 0.86,
    personalization: 0,
    diversity: 0.66,
  };
}

function applyBehaviorContext(suggestions: Suggestion[], request: SuggestRequest): Suggestion[] {
  if (!request.userId || !request.behaviorEvents?.length) {
    return suggestions;
  }
  const normalizedUser = normalizeText(request.userId);
  const events = request.behaviorEvents
    .filter((event) => normalizeText(event.userId) === normalizedUser)
    .slice(-30)
    .reverse();
  if (!events.length) {
    return suggestions;
  }

  return suggestions
    .map((suggestion) => {
      const matchedTerms = new Set<string>();
      const haystack = normalizeText(
        `${suggestion.text} ${suggestion.type} ${suggestion.metadata.reason} ${suggestion.metadata.category ?? ''} ${
          suggestion.metadata.brand ?? ''
        } ${suggestion.metadata.city ?? ''} ${suggestion.metadata.address ?? ''}`,
      );
      for (const event of events) {
        for (const term of behaviorTerms(event)) {
          const normalizedTerm = normalizeText(term);
          if (normalizedTerm.length >= 3 && haystack.includes(normalizedTerm)) {
            matchedTerms.add(term);
          }
        }
      }
      if (!matchedTerms.size) {
        return suggestion;
      }
      const boost = Math.min(0.2, 0.08 + matchedTerms.size * 0.04);
      const factors = {
        ...suggestion.metadata.factors,
        personalization: Math.min(1, suggestion.metadata.factors.personalization + boost),
      };
      return {
        ...suggestion,
        score: clampScore(suggestion.score + boost),
        metadata: {
          ...suggestion.metadata,
          factors,
          personalizationReason: `Local learner: prior result matched ${[...matchedTerms].slice(0, 2).join(', ')}`,
        },
      };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.metadata.factors.personalization - a.metadata.factors.personalization ||
        a.text.localeCompare(b.text),
    );
}

function behaviorTerms(event: NonNullable<SuggestRequest['behaviorEvents']>[number]): string[] {
  return [
    event.query,
    event.selectedText,
    event.selectedType,
    event.brand ?? '',
    event.category ?? '',
    event.city ?? '',
  ].filter(Boolean);
}

function buildFacadeExpansions(existing: string[], payload: TascoAutocompleteResponse): string[] {
  const expansions = [...existing];
  if (payload.meta.normalizedQuery !== payload.meta.expandedQuery) {
    expansions.unshift(`TASCO facade expanded ${payload.meta.normalizedQuery} -> ${payload.meta.expandedQuery}`);
  }
  expansions.unshift(`TASCO facade source -> ${payload.meta.source}`);
  return [...new Set(expansions)];
}

function mergeFacadeEntities(existing: QueryEntity[], places: PlaceResult[]): QueryEntity[] {
  const entities = [...existing];
  for (const place of places.slice(0, 5)) {
    if (!place.category) {
      continue;
    }
    entities.push({
      kind: 'category',
      value: place.category,
      source: 'poi-dataset',
      confidence: clampScore(place.score ?? 0.72),
    });
  }
  return dedupeEntities(entities);
}

function dedupeEntities(entities: QueryEntity[]): QueryEntity[] {
  const seen = new Set<string>();
  return entities.filter((entity) => {
    const key = `${entity.kind}:${normalizeText(entity.value)}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function inferCity(place: PlaceResult): string | undefined {
  if (!place.address) {
    return undefined;
  }
  return place.address.split(',').map((part) => part.trim()).filter(Boolean).at(-1);
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
