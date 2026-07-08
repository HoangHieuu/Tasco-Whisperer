import { browserDataset } from './browserDataset';
import { applyBehaviorPersonalizationToSuggestions } from './behavior';
import { suggest } from './engine';
import { containsTokenPhrase, normalizeText } from './normalize';
import { withSuggestionExplanation } from './suggestionNarrator';
import type { PlaceResult, TascoAutocompleteResponse } from './tascoFacade';
import type { BehaviorEvent, IntentType, QueryEntity, ScoreFactors, SuggestRequest, SuggestResponse, Suggestion } from './types';

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
    url.searchParams.set('userId', request.userId);
  }
  if (request.city) {
    url.searchParams.set('city', request.city);
  }
  if (request.lat != null && request.lon != null) {
    url.searchParams.set('lat', String(request.lat));
    url.searchParams.set('lon', String(request.lon));
  }
  if (request.now) {
    url.searchParams.set('now', request.now);
  }

  try {
    const started = performance.now();
    const response = await fetch(url, { signal: options.signal });
    if (!response.ok) {
      throw new Error(`TASCO facade returned HTTP ${response.status}`);
    }
    const payload = (await response.json()) as TascoAutocompleteResponse;
    const local = suggest(browserDataset, request);
    const scopedPlaces = payload.suggestions.filter((place) => placeCompatibleWithCity(place, request.city));
    const suggestions = applyBehaviorPersonalizationToSuggestions(
      scopedPlaces.map((place, index) => placeToSuggestion(place, request.q, index, payload.meta.source, local.suggestions)),
      request,
      {
        refreshSuggestion: withSuggestionExplanation,
        skipWhenAlreadyPersonalized: scopedPlaces.some((place) => (place.scoreFactors?.personalization ?? 0) > 0),
      },
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
        candidateCount: scopedPlaces.length,
        agentic: {
          ...local.diagnostics.agentic,
          reason: payload.meta.upstreamUsed
            ? 'TASCO live autocomplete API returned results'
            : 'TASCO facade used local fallback results',
        },
        entities: mergeFacadeEntities(local.diagnostics.entities, scopedPlaces),
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

export async function recordFrontendBehaviorEvent(
  event: BehaviorEvent,
  options: FetchFrontendSuggestOptions = {},
): Promise<boolean> {
  const apiBaseUrl = options.apiBaseUrl ?? resolveApiBaseUrl();
  const url = new URL('/api/behavior-events', apiBaseUrl);
  try {
    const response = await fetch(url, {
      method: 'POST',
      signal: options.signal,
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(event),
    });
    return response.ok;
  } catch {
    return false;
  }
}

function resolveApiBaseUrl(): string {
  const configured = import.meta.env.VITE_TASCO_API_BASE_URL?.trim();
  return configured || DEFAULT_API_BASE_URL;
}

function placeToSuggestion(
  place: PlaceResult,
  query: string,
  index: number,
  facadeSource: FrontendSuggestResponse['facadeSource'],
  localSuggestions: Suggestion[],
): Suggestion {
  const score = clampScore(place.score ?? 0.7);
  const type = inferIntentType(place);
  const matchedLocal = findLocalSuggestion(place, localSuggestions);
  const factors = place.scoreFactors ?? matchedLocal?.metadata.factors ?? fallbackFactors(score);
  const factorReason = place.scoreFactors || matchedLocal
    ? 'engine ranking factors'
    : 'live API score only; factor details unavailable';
  return withSuggestionExplanation({
    id: `tasco:${place.id}:${index}`,
    text: place.label || place.name,
    normalizedText: normalizeText(place.label || place.name),
    type,
    score,
    source: place.type === 'query' ? 'popular-query' : 'poi',
    matched: [query],
    poiId: place.id.startsWith('poi:') ? place.id.replace(/^poi:/, '') : place.id,
    metadata: {
      reason: `${isLivePlace(place, facadeSource) ? 'TASCO live API' : 'TASCO facade fallback'} matched ${place.name}; ${factorReason}`,
      city: inferCity(place),
      address: place.address,
      category: place.category,
      factors,
    },
  });
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

function fallbackFactors(score: number): ScoreFactors {
  return {
    lexical: score,
    intent: 0,
    source: 0,
    popularity: 0,
    poiQuality: 0,
    locality: 0,
    personalization: 0,
    diversity: 0,
  };
}

function findLocalSuggestion(place: PlaceResult, suggestions: Suggestion[]): Suggestion | undefined {
  const normalizedPlaceId = normalizeText(place.id.replace(/^poi:/i, ''));
  const normalizedText = normalizeText(place.label || place.name);
  return suggestions.find((suggestion) => {
    const suggestionPoiId = normalizeText(suggestion.poiId ?? '');
    return (
      (normalizedPlaceId && suggestionPoiId && normalizedPlaceId === suggestionPoiId) ||
      normalizeText(suggestion.text) === normalizedText
    );
  });
}

function isLivePlace(place: PlaceResult, facadeSource: FrontendSuggestResponse['facadeSource']): boolean {
  return facadeSource === 'live' || ['live', 'tasco api'].includes(normalizeText(place.source));
}

const KNOWN_CITY_VALUES = ['TP.HCM', 'Hà Nội', 'Đà Nẵng', 'Đà Lạt', 'Nha Trang', 'Hải Phòng'];

function placeCompatibleWithCity(place: PlaceResult, city?: string): boolean {
  if (!city) {
    return true;
  }
  const explicitCity = inferCity(place) ?? KNOWN_CITY_VALUES.find((knownCity) => cityMentioned(`${place.name} ${place.label}`, knownCity));
  if (explicitCity) {
    return sameCity(explicitCity, city);
  }
  const haystack = `${place.name} ${place.label} ${place.address ?? ''}`;
  return !KNOWN_CITY_VALUES.some((knownCity) => !sameCity(knownCity, city) && cityMentioned(haystack, knownCity));
}

function sameCity(left: string, right: string): boolean {
  const leftAliases = cityAliases(left);
  const rightAliases = cityAliases(right);
  return leftAliases.some((leftAlias) => rightAliases.includes(leftAlias));
}

function cityMentioned(text: string, city: string): boolean {
  return cityAliases(city).some((alias) => alias.length >= 3 && containsTokenPhrase(text, alias));
}

function cityAliases(city: string): string[] {
  const normalized = normalizeText(city);
  const aliases = new Set([normalized]);
  if (['tp.hcm', 'tp hcm', 'hcm', 'ho chi minh', 'thanh pho ho chi minh', 'sai gon', 'sg'].includes(normalized)) {
    ['tp.hcm', 'tp hcm', 'hcm', 'ho chi minh', 'thanh pho ho chi minh', 'sai gon', 'sg'].forEach((alias) => aliases.add(alias));
  }
  if (['ha noi', 'hn'].includes(normalized)) {
    ['ha noi', 'hn'].forEach((alias) => aliases.add(alias));
  }
  if (['da nang', 'dn'].includes(normalized)) {
    ['da nang', 'dn'].forEach((alias) => aliases.add(alias));
  }
  if (['da lat', 'dl'].includes(normalized)) {
    ['da lat', 'dl'].forEach((alias) => aliases.add(alias));
  }
  if (['nha trang', 'nt'].includes(normalized)) {
    ['nha trang', 'nt'].forEach((alias) => aliases.add(alias));
  }
  if (['hai phong', 'hp'].includes(normalized)) {
    ['hai phong', 'hp'].forEach((alias) => aliases.add(alias));
  }
  return [...aliases];
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
