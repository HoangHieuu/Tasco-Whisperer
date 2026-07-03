import { suggest } from './engine';
import { normalizeText } from './normalize';
import type { PoiRecord, Suggestion, TascoDataset } from './types';

export interface PlaceResult {
  id: string;
  type: string;
  name: string;
  label: string;
  address?: string;
  category?: string;
  coordinates?: {
    lat: number;
    lon: number;
  };
  distanceMeters?: number;
  score?: number;
  source: string;
  tags?: string[];
}

export interface TascoReview {
  id: string;
  author: string;
  rating: number;
  text: string;
  createdAt: string;
  source: string;
}

export interface TascoPhoto {
  id: string;
  url: string;
  caption: string;
  width: number;
  height: number;
  source: string;
}

export interface TascoAutocompleteResponse {
  query: string;
  suggestions: PlaceResult[];
  meta: {
    limit: number;
    sessionId?: string;
    lang: string;
    source: 'live' | 'local-fallback';
    normalizedQuery: string;
    expandedQuery: string;
    upstreamUsed: boolean;
  };
}

export interface TascoSearchResponse {
  query: string;
  results: PlaceResult[];
  meta: {
    limit: number;
    lang: string;
    radiusMeters?: number;
    bbox?: string;
    category?: string;
    source: 'live' | 'local-fallback';
    normalizedQuery: string;
    expandedQuery: string;
    upstreamUsed: boolean;
  };
}

export interface TascoPoiResponse {
  poi: PlaceResult & {
    rating?: number;
    openingHours?: string;
    aiSummary?: string;
    reviews?: TascoReview[];
    photos?: TascoPhoto[];
  };
  meta: TascoSourceMeta;
}

export interface TascoPlacesResponse {
  results: PlaceResult[];
  center?: {
    lat: number;
    lon: number;
  };
  query?: string;
  meta: TascoSourceMeta & {
    limit?: number;
    radiusMeters?: number;
  };
}

export interface TascoRouteResponse {
  routes: Array<{
    routeId: string;
    sourceIndex: number;
    summary: {
      distanceMeters: number;
      durationSeconds: number;
    };
    geometry: {
      type: 'LineString';
      coordinates: Array<[number, number]>;
    };
    maneuvers: Array<{
      instruction: string;
      distanceMeters: number;
      durationSeconds: number;
      beginShapeIndex: number;
      endShapeIndex: number;
      streetNames: string[];
    }>;
  }>;
  meta: TascoSourceMeta & {
    mode: string;
    alternates: number;
  };
}

interface TascoSourceMeta {
  lang?: string;
  source: 'live' | 'local-fallback';
  upstreamUsed: boolean;
}

export interface TascoErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown> | string[];
  };
  requestId?: string;
}

export interface TascoFacadeResult {
  status: number;
  headers: Record<string, string>;
  body:
    | TascoAutocompleteResponse
    | TascoSearchResponse
    | TascoPoiResponse
    | TascoPlacesResponse
    | TascoRouteResponse
    | TascoErrorResponse
    | { ok: true };
  log: {
    action: string;
    query: string;
    statusCode: number;
    message: string;
  };
}

export interface TascoLiveClient {
  autocomplete?(params: TascoLiveQuery): Promise<PlaceResult[]>;
  search?(params: TascoLiveQuery): Promise<PlaceResult[]>;
  poi?(id: string, params: { lang: string; include?: string }): Promise<TascoPoiResponse['poi'] | undefined>;
  reverseGeocoding?(params: TascoCoordinateQuery): Promise<PlaceResult[]>;
  nearbySearch?(params: TascoNearbyQuery): Promise<PlaceResult[]>;
  geocoding?(params: TascoGeocodingQuery): Promise<PlaceResult[]>;
  route?(body: TascoRouteRequest): Promise<TascoRouteResponse | undefined>;
}

export interface TascoLiveQuery {
  q: string;
  lat?: number;
  lon?: number;
  radiusMeters?: number;
  bbox?: string;
  category?: string;
  limit: number;
  lang: string;
  sessionId?: string;
}

export interface TascoCoordinateQuery {
  lat: number;
  lon: number;
  radiusMeters?: number;
  lang: string;
}

export interface TascoNearbyQuery extends TascoCoordinateQuery {
  category?: string;
  openNow?: boolean;
  limit: number;
}

export interface TascoGeocodingQuery {
  address: string;
  city?: string;
  district?: string;
  lat?: number;
  lon?: number;
  limit: number;
  lang: string;
}

export interface TascoRouteRequest {
  locations: Array<{ lat: number; lon: number }>;
  mode?: string;
  alternates?: number;
  language?: string;
  units?: string;
  avoidTolls?: boolean;
  avoidHighways?: boolean;
}

interface FacadeRequest {
  method: string;
  url: string;
  body?: unknown;
}

interface ParsedFacadeParams {
  q: string;
  lat?: number;
  lon?: number;
  radiusMeters?: number;
  bbox?: string;
  category?: string;
  limit: number;
  lang: string;
  sessionId?: string;
}

const MOCK_ERROR_RESPONSES: Record<string, { status: number; message: string }> = {
  invalid_request: { status: 400, message: 'Mock invalid request.' },
  unauthorized: { status: 401, message: 'Mock missing or invalid token/key.' },
  forbidden: { status: 403, message: 'Mock caller is not allowed.' },
  not_found: { status: 404, message: 'Mock resource was not found.' },
  timeout: { status: 408, message: 'Mock upstream timeout.' },
  rate_limited: { status: 429, message: 'Mock rate limit exceeded.' },
  internal_error: { status: 500, message: 'Mock internal service error.' },
  service_unavailable: { status: 503, message: 'Mock upstream service unavailable.' },
};

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'access-control-allow-origin': '*',
};

const AUTOCOMPLETE_PATHS = new Set(['/v1/autocomplete', '/autocomplete']);
const SEARCH_PATHS = new Set(['/v1/search', '/search', '/v1/geocode-search']);
const REVERSE_PATHS = new Set(['/v1/reverse-geocoding', '/reverse-geocoding', '/v1/reverse']);
const NEARBY_PATHS = new Set(['/v1/nearby-search', '/nearby-search']);
const GEOCODING_PATHS = new Set(['/v1/geocoding', '/geocoding']);
const ROUTE_PATHS = new Set(['/v1/route', '/route']);

export function isTascoFacadePath(pathname: string): boolean {
  return (
    pathname === '/health' ||
    AUTOCOMPLETE_PATHS.has(pathname) ||
    SEARCH_PATHS.has(pathname) ||
    isPoiPath(pathname) ||
    REVERSE_PATHS.has(pathname) ||
    NEARBY_PATHS.has(pathname) ||
    GEOCODING_PATHS.has(pathname) ||
    ROUTE_PATHS.has(pathname)
  );
}

export async function handleTascoFacadeRequest(
  dataset: TascoDataset,
  request: FacadeRequest,
  liveClient?: TascoLiveClient,
): Promise<TascoFacadeResult> {
  const url = new URL(request.url, 'http://localhost');
  const method = request.method.toUpperCase();

  if (url.pathname === '/health') {
    return {
      status: 200,
      headers: JSON_HEADERS,
      body: { ok: true },
      log: { action: 'api.health', query: '', statusCode: 200, message: 'health check ok' },
    };
  }

  if (!isTascoFacadePath(url.pathname)) {
    return errorResult(404, 'not_found', 'Unknown TASCO facade route.', { path: url.pathname }, 'unknown route');
  }
  const mockError = mockErrorResult(url);
  if (mockError) {
    return mockError;
  }
  if (ROUTE_PATHS.has(url.pathname)) {
    if (method !== 'POST') {
      return errorResult(405, 'method_not_allowed', 'Use POST for route requests.', {}, 'unsupported method');
    }
    return handleRoute(request.body, liveClient);
  }

  if (method !== 'GET') {
    return errorResult(405, 'method_not_allowed', 'Use GET for this TASCO facade route.', {}, 'unsupported method');
  }

  if (isPoiPath(url.pathname)) {
    return handlePoi(dataset, url, liveClient);
  }
  if (REVERSE_PATHS.has(url.pathname)) {
    return handleReverse(dataset, url, liveClient);
  }
  if (NEARBY_PATHS.has(url.pathname)) {
    return handleNearby(dataset, url, liveClient);
  }
  if (GEOCODING_PATHS.has(url.pathname)) {
    return handleGeocoding(dataset, url, liveClient);
  }

  const isAutocomplete = AUTOCOMPLETE_PATHS.has(url.pathname);
  const parsed = parseParams(url.searchParams, isAutocomplete ? 10 : 20);
  if (!parsed.ok) {
    return errorResult(400, 'invalid_request', 'Invalid TASCO facade query parameters.', parsed.errors, 'invalid request');
  }

  const local = suggest(dataset, {
    q: parsed.value.q,
    limit: isAutocomplete ? parsed.value.limit : Math.max(parsed.value.limit, 20),
    agentic: false,
  });
  const upstreamQuery = local.expandedQuery || local.normalizedQuery || parsed.value.q;
  const liveResults = await safeLivePlaces(liveClient, isAutocomplete ? 'autocomplete' : 'search', {
    q: upstreamQuery,
    lat: parsed.value.lat,
    lon: parsed.value.lon,
    radiusMeters: isAutocomplete ? undefined : parsed.value.radiusMeters,
    bbox: isAutocomplete ? undefined : parsed.value.bbox,
    category: isAutocomplete ? undefined : parsed.value.category,
    limit: parsed.value.limit,
    lang: parsed.value.lang,
    sessionId: parsed.value.sessionId,
  });
  const localResults = applySearchFilters(
    applyLocationContext(mergePlaces(
      local.suggestions.map((suggestion) => suggestionToPlaceResult(dataset, suggestion)),
      isAutocomplete ? [] : searchPoiResults(dataset, parsed.value.q, local.expandedQuery || local.normalizedQuery),
    ), parsed.value.lat, parsed.value.lon),
    isAutocomplete
      ? {}
      : {
          radiusMeters: parsed.value.radiusMeters,
          bbox: parsed.value.bbox,
          category: parsed.value.category,
        },
  );
  const places = liveResults.length ? liveResults : isAutocomplete ? localResults : rankSearchPlaces(localResults, parsed.value.q);
  const limitedPlaces = places.slice(0, parsed.value.limit);
  const meta = {
    limit: parsed.value.limit,
    lang: parsed.value.lang,
    ...(isAutocomplete
      ? {}
      : {
          radiusMeters: parsed.value.radiusMeters,
          bbox: parsed.value.bbox,
          category: parsed.value.category,
        }),
    source: liveResults.length ? 'live' as const : 'local-fallback' as const,
    normalizedQuery: local.normalizedQuery,
    expandedQuery: local.expandedQuery,
    upstreamUsed: liveResults.length > 0,
  };

  if (isAutocomplete) {
    return {
      status: 200,
      headers: JSON_HEADERS,
      body: {
        query: parsed.value.q,
        suggestions: limitedPlaces,
        meta: {
          ...meta,
          sessionId: parsed.value.sessionId,
        },
      },
      log: {
        action: 'tasco.autocomplete',
        query: parsed.value.q,
        statusCode: 200,
        message: liveResults.length ? 'live autocomplete returned' : 'local autocomplete fallback returned',
      },
    };
  }

  return {
    status: 200,
    headers: JSON_HEADERS,
    body: {
      query: parsed.value.q,
      results: limitedPlaces,
      meta,
    },
    log: {
      action: 'tasco.search',
      query: parsed.value.q,
      statusCode: 200,
      message: liveResults.length ? 'live search returned' : 'local search fallback returned',
    },
  };
}

function parseParams(
  params: URLSearchParams,
  maxLimit: number,
): { ok: true; value: ParsedFacadeParams } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const q = params.get('q')?.trim() ?? '';
  const lat = optionalNumber(params.get('lat'), 'lat', -90, 90, errors);
  const lon = optionalNumber(params.get('lon') ?? params.get('lng'), 'lon', -180, 180, errors);
  const radiusMeters = optionalNumber(params.get('radiusMeters'), 'radiusMeters', 1, 50000, errors);
  const bbox = params.get('bbox')?.trim() || undefined;
  const category = params.get('category')?.trim() || undefined;
  const limit = optionalInteger(params.get('limit'), 'limit', 1, maxLimit, errors) ?? (maxLimit === 10 ? 5 : 10);
  const lang = params.get('lang')?.trim() || 'vi';
  const sessionId = params.get('sessionId')?.trim() || undefined;

  if (!q) {
    errors.push('q is required');
  }
  if (q.length > 160) {
    errors.push('q must be 160 characters or fewer');
  }
  if ((lat == null) !== (lon == null)) {
    errors.push('lat and lon must be provided together');
  }
  if (radiusMeters != null && (lat == null || lon == null)) {
    errors.push('radiusMeters requires lat and lon');
  }
  if (bbox && !parseBbox(bbox)) {
    errors.push('bbox must use minLon,minLat,maxLon,maxLat');
  }
  if (lang.length > 16) {
    errors.push('lang must be 16 characters or fewer');
  }
  if (sessionId && sessionId.length > 80) {
    errors.push('sessionId must be 80 characters or fewer');
  }
  if (errors.length) {
    return { ok: false, errors };
  }
  return { ok: true, value: { q, lat, lon, radiusMeters, bbox, category, limit, lang, sessionId } };
}

async function handlePoi(dataset: TascoDataset, url: URL, liveClient?: TascoLiveClient): Promise<TascoFacadeResult> {
  const id = decodeURIComponent(url.pathname.split('/').pop() ?? '').trim();
  const lang = url.searchParams.get('lang')?.trim() || 'vi';
  const include = url.searchParams.get('include')?.trim() || undefined;
  if (!id) {
    return errorResult(400, 'invalid_request', 'id is required', { field: 'id' }, 'invalid request');
  }
  const livePoi = await safeLivePoi(liveClient, id, { lang, include });
  const localPoi = poiToPlaceResult(findPoi(dataset, id));
  const poi = livePoi ?? localPoi;
  if (!poi) {
    return errorResult(404, 'not_found', 'POI was not found.', { id }, 'not found');
  }
  return {
    status: 200,
    headers: JSON_HEADERS,
    body: {
      poi: enrichPoiDetail(poi, include),
      meta: {
        lang,
        source: livePoi ? 'live' : 'local-fallback',
        upstreamUsed: Boolean(livePoi),
      },
    },
    log: {
      action: 'tasco.poi',
      query: id,
      statusCode: 200,
      message: livePoi ? 'live poi returned' : 'local poi fallback returned',
    },
  };
}

function enrichPoiDetail(poi: TascoPoiResponse['poi'], include?: string): TascoPoiResponse['poi'] {
  const includeSet = parseInclude(include);
  const enriched: TascoPoiResponse['poi'] = { ...poi };
  if (includeSet.has('hours')) {
    enriched.openingHours ??= localOpeningHours(enriched);
  }
  if (includeSet.has('ai_summary')) {
    enriched.aiSummary ??= summaryForPlace(enriched);
  }
  if (includeSet.has('reviews')) {
    enriched.reviews ??= localReviews(enriched);
  }
  if (includeSet.has('photos')) {
    enriched.photos ??= localPhotos(enriched);
  }
  return enriched;
}

function parseInclude(include?: string): Set<string> {
  const values = new Set(
    (include ?? '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
  if (values.has('opening_hours')) values.add('hours');
  if (values.has('openinghours')) values.add('hours');
  return values;
}

async function handleReverse(dataset: TascoDataset, url: URL, liveClient?: TascoLiveClient): Promise<TascoFacadeResult> {
  const errors: string[] = [];
  const lat = optionalNumber(url.searchParams.get('lat') ?? url.searchParams.get('point.lat'), 'lat', -90, 90, errors);
  const lon = optionalNumber(url.searchParams.get('lon') ?? url.searchParams.get('point.lon'), 'lon', -180, 180, errors);
  const radiusMeters = optionalNumber(url.searchParams.get('radiusMeters'), 'radiusMeters', 1, 50000, errors);
  const lang = url.searchParams.get('lang')?.trim() || 'vi';
  if (lat == null) errors.push('lat is required');
  if (lon == null) errors.push('lon is required');
  if (errors.length) {
    return errorResult(400, 'invalid_request', 'Invalid reverse-geocoding parameters.', errors, 'invalid request');
  }
  const queryLat = lat as number;
  const queryLon = lon as number;
  const liveResults = await safeLivePlaces(liveClient, 'reverseGeocoding', { lat: queryLat, lon: queryLon, radiusMeters, lang });
  const localResults = nearestPois(dataset, queryLat, queryLon, 5, radiusMeters)
    .map(({ poi, distanceMeters }) => poiToPlaceResult(poi, { distanceMeters }))
    .filter((place): place is PlaceResult => place != null);
  const results = liveResults.length ? liveResults : localResults;
  return placesResult('tasco.reverse', '', results, {
    lang,
    source: liveResults.length ? 'live' : 'local-fallback',
    upstreamUsed: liveResults.length > 0,
  });
}

async function handleNearby(dataset: TascoDataset, url: URL, liveClient?: TascoLiveClient): Promise<TascoFacadeResult> {
  const errors: string[] = [];
  const lat = optionalNumber(url.searchParams.get('lat'), 'lat', -90, 90, errors);
  const lon = optionalNumber(url.searchParams.get('lon'), 'lon', -180, 180, errors);
  const radiusMeters = optionalNumber(url.searchParams.get('radiusMeters'), 'radiusMeters', 1, 5000, errors) ?? 1000;
  const category = url.searchParams.get('category')?.trim() || undefined;
  const openNow = optionalBoolean(url.searchParams.get('openNow'), 'openNow', errors);
  const limit = optionalInteger(url.searchParams.get('limit'), 'limit', 1, 20, errors) ?? 10;
  const lang = url.searchParams.get('lang')?.trim() || 'vi';
  if (lat == null) errors.push('lat is required');
  if (lon == null) errors.push('lon is required');
  if (errors.length) {
    return errorResult(400, 'invalid_request', 'Invalid nearby-search parameters.', errors, 'invalid request');
  }
  const queryLat = lat as number;
  const queryLon = lon as number;
  const liveResults = await safeLivePlaces(liveClient, 'nearbySearch', {
    lat: queryLat,
    lon: queryLon,
    radiusMeters,
    category,
    openNow,
    limit,
    lang,
  });
  const localResults = nearestPois(dataset, queryLat, queryLon, limit, radiusMeters, category)
    .map(({ poi, distanceMeters }) => poiToPlaceResult(poi, { distanceMeters }))
    .filter((place): place is PlaceResult => place != null);
  const results = liveResults.length ? liveResults : localResults;
  return {
    status: 200,
    headers: JSON_HEADERS,
    body: {
      center: { lat: queryLat, lon: queryLon },
      results,
      meta: {
        radiusMeters,
        limit,
        lang,
        source: liveResults.length ? 'live' : 'local-fallback',
        upstreamUsed: liveResults.length > 0,
      },
    },
    log: {
      action: 'tasco.nearby',
      query: category ?? '',
      statusCode: 200,
      message: liveResults.length ? 'live nearby returned' : 'local nearby fallback returned',
    },
  };
}

async function handleGeocoding(dataset: TascoDataset, url: URL, liveClient?: TascoLiveClient): Promise<TascoFacadeResult> {
  const errors: string[] = [];
  const address = url.searchParams.get('address')?.trim() ?? '';
  const city = url.searchParams.get('city')?.trim() || undefined;
  const district = url.searchParams.get('district')?.trim() || undefined;
  const lat = optionalNumber(url.searchParams.get('lat'), 'lat', -90, 90, errors);
  const lon = optionalNumber(url.searchParams.get('lon'), 'lon', -180, 180, errors);
  const limit = optionalInteger(url.searchParams.get('limit'), 'limit', 1, 10, errors) ?? 5;
  const lang = url.searchParams.get('lang')?.trim() || 'vi';
  if (!address) errors.push('address is required');
  if ((lat == null) !== (lon == null)) errors.push('lat and lon must be provided together');
  if (errors.length) {
    return errorResult(400, 'invalid_request', 'Invalid geocoding parameters.', errors, 'invalid request');
  }
  const liveResults = await safeLivePlaces(liveClient, 'geocoding', { address, city, district, lat, lon, limit, lang });
  const localResults = localGeocoding(dataset, { address, city, district, lat, lon, limit });
  const results = liveResults.length ? liveResults : localResults;
  return {
    status: 200,
    headers: JSON_HEADERS,
    body: {
      query: [address, district, city].filter(Boolean).join(' '),
      results,
      meta: {
        limit,
        lang,
        source: liveResults.length ? 'live' : 'local-fallback',
        upstreamUsed: liveResults.length > 0,
      },
    },
    log: {
      action: 'tasco.geocoding',
      query: address,
      statusCode: 200,
      message: liveResults.length ? 'live geocoding returned' : 'local geocoding fallback returned',
    },
  };
}

async function handleRoute(body: unknown, liveClient?: TascoLiveClient): Promise<TascoFacadeResult> {
  const parsed = parseRouteBody(body);
  if (!parsed.ok) {
    return errorResult(400, 'invalid_request', 'Invalid route request body.', parsed.errors, 'invalid request');
  }
  const liveRoute = await safeLiveRoute(liveClient, parsed.value);
  const route = liveRoute ?? localRoute(parsed.value);
  return {
    status: 200,
    headers: JSON_HEADERS,
    body: {
      ...route,
      meta: {
        ...route.meta,
        source: liveRoute ? 'live' : 'local-fallback',
        upstreamUsed: Boolean(liveRoute),
      },
    },
    log: {
      action: 'tasco.route',
      query: `${parsed.value.locations.length} locations`,
      statusCode: 200,
      message: liveRoute ? 'live route returned' : 'local route fallback returned',
    },
  };
}

function placesResult(action: string, query: string, results: PlaceResult[], meta: TascoPlacesResponse['meta']): TascoFacadeResult {
  return {
    status: 200,
    headers: JSON_HEADERS,
    body: {
      results,
      meta,
    },
    log: {
      action,
      query,
      statusCode: 200,
      message: meta.upstreamUsed ? 'live places returned' : 'local places fallback returned',
    },
  };
}

async function safeLivePlaces(
  liveClient: TascoLiveClient | undefined,
  method: 'autocomplete' | 'search' | 'reverseGeocoding' | 'nearbySearch' | 'geocoding',
  params: TascoLiveQuery | TascoCoordinateQuery | TascoNearbyQuery | TascoGeocodingQuery,
): Promise<PlaceResult[]> {
  if (!liveClient || !liveClient[method]) {
    return [];
  }
  try {
    const places = await liveClient[method](params as never);
    const limit = 'limit' in params ? params.limit : 10;
    return places.slice(0, limit);
  } catch {
    return [];
  }
}

async function safeLivePoi(
  liveClient: TascoLiveClient | undefined,
  id: string,
  params: { lang: string; include?: string },
): Promise<TascoPoiResponse['poi'] | undefined> {
  if (!liveClient?.poi) return undefined;
  try {
    return await liveClient.poi(id, params);
  } catch {
    return undefined;
  }
}

async function safeLiveRoute(liveClient: TascoLiveClient | undefined, body: TascoRouteRequest): Promise<TascoRouteResponse | undefined> {
  if (!liveClient?.route) return undefined;
  try {
    return await liveClient.route(body);
  } catch {
    return undefined;
  }
}

function suggestionToPlaceResult(dataset: TascoDataset, suggestion: Suggestion): PlaceResult {
  const poi = suggestion.poiId ? dataset.pois.find((record) => record.poiId === suggestion.poiId) : undefined;
  const category = poi?.category ?? suggestion.metadata.category ?? suggestion.type;
  return {
    id: suggestion.poiId ? `poi:${suggestion.poiId}` : `suggestion:${suggestion.id}`,
    type: suggestion.poiId ? 'poi' : suggestion.source,
    name: suggestion.text,
    label: suggestion.text,
    address: suggestion.metadata.address,
    category,
    coordinates: poi ? { lat: poi.latitude, lon: poi.longitude } : undefined,
    score: suggestion.score,
    source: suggestion.source,
    tags: poi?.tags,
  };
}

function searchPoiResults(dataset: TascoDataset, query: string, expandedQuery?: string): PlaceResult[] {
  const normalizedQueries = [normalizeText(query), normalizeText(expandedQuery ?? '')]
    .flatMap((value) => value.split(/\s+/).concat(value))
    .filter((value) => value.length >= 2);
  const uniqueQueries = [...new Set(normalizedQueries)];
  if (!uniqueQueries.length) {
    return [];
  }
  return dataset.pois
    .map((poi) => ({ poi, score: poiSearchScore(poi, uniqueQueries) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || b.poi.popularityScore - a.poi.popularityScore)
    .map(({ poi, score }) => ({
      ...poiToPlaceResult(poi)!,
      score: Math.max(poi.popularityScore / 100, Math.round(score * 1000) / 1000),
    }));
}

function poiSearchScore(poi: PoiRecord, queries: string[]): number {
  const name = normalizeText(poi.poiName);
  const brand = normalizeText(poi.brand);
  const category = normalizeText(poi.category);
  const haystack = normalizeText(`${poi.poiName} ${poi.brand} ${poi.category} ${poi.address} ${poi.city} ${poi.tags.join(' ')}`);
  return queries.reduce((score, query) => {
    if (name.includes(query)) score += 0.45;
    if (brand.includes(query)) score += 0.35;
    if (category.includes(query)) score += 0.3;
    if (haystack.includes(query)) score += 0.15;
    return score;
  }, 0);
}

function mergePlaces(primary: PlaceResult[], secondary: PlaceResult[]): PlaceResult[] {
  const merged = new Map<string, PlaceResult>();
  for (const place of [...primary, ...secondary]) {
    const existing = merged.get(place.id);
    if (!existing || (place.score ?? 0) > (existing.score ?? 0) || (!existing.coordinates && place.coordinates)) {
      merged.set(place.id, { ...existing, ...place, score: Math.max(existing?.score ?? 0, place.score ?? 0) || undefined });
    }
  }
  return [...merged.values()];
}

function rankSearchPlaces(places: PlaceResult[], query: string): PlaceResult[] {
  const normalizedQuery = normalizeText(query);
  return [...places].sort((a, b) => {
    const aText = normalizeText(`${a.name} ${a.label} ${a.category ?? ''}`);
    const bText = normalizeText(`${b.name} ${b.label} ${b.category ?? ''}`);
    return (
      Number(Boolean(b.coordinates)) - Number(Boolean(a.coordinates)) ||
      Number(bText.includes(normalizedQuery)) - Number(aText.includes(normalizedQuery)) ||
      (b.score ?? 0) - (a.score ?? 0)
    );
  });
}

function applyLocationContext(places: PlaceResult[], lat?: number, lon?: number): PlaceResult[] {
  if (lat == null || lon == null) {
    return places;
  }
  return places
    .map((place) => {
      if (!place.coordinates) {
        return place;
      }
      const distance = Math.round(distanceMeters(lat, lon, place.coordinates.lat, place.coordinates.lon));
      const proximityScore = Math.max(0, 1 - Math.min(distance, 15000) / 15000);
      return {
        ...place,
        distanceMeters: distance,
        score: Math.min(1, Math.round(((place.score ?? 0.5) * 0.72 + proximityScore * 0.28 + 0.12) * 1000) / 1000),
      };
    })
    .sort(
      (a, b) =>
        Number(Boolean(b.coordinates)) - Number(Boolean(a.coordinates)) ||
        (b.score ?? 0) - (a.score ?? 0) ||
        (a.distanceMeters ?? Number.MAX_SAFE_INTEGER) - (b.distanceMeters ?? Number.MAX_SAFE_INTEGER),
    );
}

function applySearchFilters(
  places: PlaceResult[],
  filters: { radiusMeters?: number; bbox?: string; category?: string },
): PlaceResult[] {
  const bbox = filters.bbox ? parseBbox(filters.bbox) : undefined;
  const normalizedCategory = normalizeText(filters.category ?? '');
  return places.filter((place) => {
    if (filters.radiusMeters != null && place.distanceMeters != null && place.distanceMeters > filters.radiusMeters) {
      return false;
    }
    if (bbox && place.coordinates) {
      const { lat, lon } = place.coordinates;
      if (lon < bbox.minLon || lon > bbox.maxLon || lat < bbox.minLat || lat > bbox.maxLat) {
        return false;
      }
    }
    if (normalizedCategory) {
      const haystack = normalizeText(`${place.category ?? ''} ${place.type} ${(place.tags ?? []).join(' ')}`);
      return haystack.includes(normalizedCategory);
    }
    return true;
  });
}

function parseBbox(value: string): { minLon: number; minLat: number; maxLon: number; maxLat: number } | undefined {
  const parts = value.split(',').map((part) => Number(part.trim()));
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) {
    return undefined;
  }
  const [minLon, minLat, maxLon, maxLat] = parts;
  if (minLon < -180 || maxLon > 180 || minLat < -90 || maxLat > 90 || minLon > maxLon || minLat > maxLat) {
    return undefined;
  }
  return { minLon, minLat, maxLon, maxLat };
}

function findPoi(dataset: TascoDataset, id: string): PoiRecord | undefined {
  const normalizedId = normalizeText(id.replace(/^poi:/i, ''));
  return dataset.pois.find((poi) => normalizeText(poi.poiId) === normalizedId || normalizeText(`poi:${poi.poiId}`) === normalizeText(id));
}

function poiToPlaceResult(poi: PoiRecord | undefined, extras: { distanceMeters?: number } = {}): TascoPoiResponse['poi'] | undefined {
  if (!poi) return undefined;
  return {
    id: `poi:${poi.poiId}`,
    type: 'poi',
    name: poi.poiName,
    label: poi.poiName,
    address: poi.address,
    category: poi.category,
    coordinates: { lat: poi.latitude, lon: poi.longitude },
    distanceMeters: extras.distanceMeters,
    score: Math.round((poi.popularityScore / 100) * 1000) / 1000,
    source: 'local-fallback',
    tags: poi.tags,
    rating: poi.rating,
    aiSummary: summaryForPlace({ label: poi.poiName, category: poi.category, address: poi.address }),
  };
}

function nearestPois(
  dataset: TascoDataset,
  lat: number,
  lon: number,
  limit: number,
  radiusMeters?: number,
  category?: string,
): Array<{ poi: PoiRecord; distanceMeters: number }> {
  const normalizedCategory = normalizeText(category ?? '');
  return dataset.pois
    .map((poi) => ({ poi, distanceMeters: Math.round(distanceMeters(lat, lon, poi.latitude, poi.longitude)) }))
    .filter(({ poi, distanceMeters }) => {
      const categoryMatch = !normalizedCategory || normalizeText(`${poi.category} ${poi.tags.join(' ')}`).includes(normalizedCategory);
      const radiusMatch = radiusMeters == null || distanceMeters <= radiusMeters;
      return categoryMatch && radiusMatch;
    })
    .sort((a, b) => a.distanceMeters - b.distanceMeters || b.poi.popularityScore - a.poi.popularityScore)
    .slice(0, limit);
}

function localGeocoding(
  dataset: TascoDataset,
  params: { address: string; city?: string; district?: string; lat?: number; lon?: number; limit: number },
): PlaceResult[] {
  const query = normalizeText([params.address, params.district, params.city].filter(Boolean).join(' '));
  return dataset.pois
    .map((poi) => {
      const haystack = normalizeText(`${poi.poiName} ${poi.address} ${poi.city} ${poi.category} ${poi.brand}`);
      const textScore = haystack.includes(query) ? 1 : query.split(' ').filter((token) => token.length >= 2 && haystack.includes(token)).length / Math.max(1, query.split(' ').length);
      const distancePenalty = params.lat != null && params.lon != null ? Math.min(0.25, distanceMeters(params.lat, params.lon, poi.latitude, poi.longitude) / 1000000) : 0;
      return { poi, score: textScore - distancePenalty };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || b.poi.popularityScore - a.poi.popularityScore)
    .slice(0, params.limit)
    .map(({ poi, score }) => ({
      ...poiToPlaceResult(poi)!,
      score: Math.max(0.01, Math.round(score * 1000) / 1000),
    }));
}

function parseRouteBody(body: unknown): { ok: true; value: TascoRouteRequest } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!body || typeof body !== 'object') {
    return { ok: false, errors: ['body must be a JSON object'] };
  }
  const input = body as Record<string, unknown>;
  const locations = Array.isArray(input.locations) ? input.locations : [];
  if (locations.length < 2) {
    errors.push('locations must include at least origin and destination');
  }
  const parsedLocations = locations.map((location, index) => {
    if (!location || typeof location !== 'object') {
      errors.push(`locations[${index}] must be an object`);
      return undefined;
    }
    const row = location as Record<string, unknown>;
    const lat = typeof row.lat === 'number' && Number.isFinite(row.lat) ? row.lat : undefined;
    const lon = typeof row.lon === 'number' && Number.isFinite(row.lon) ? row.lon : undefined;
    if (lat == null || lat < -90 || lat > 90) errors.push(`locations[${index}].lat must be between -90 and 90`);
    if (lon == null || lon < -180 || lon > 180) errors.push(`locations[${index}].lon must be between -180 and 180`);
    return lat != null && lon != null ? { lat, lon } : undefined;
  });
  const alternates = typeof input.alternates === 'number' && Number.isFinite(input.alternates) ? Math.max(0, Math.min(3, Math.round(input.alternates))) : 2;
  if (errors.length) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    value: {
      locations: parsedLocations.filter((location): location is { lat: number; lon: number } => location != null),
      mode: typeof input.mode === 'string' ? input.mode : 'auto',
      alternates,
      language: typeof input.language === 'string' ? input.language : 'vi-VN',
      units: typeof input.units === 'string' ? input.units : 'kilometers',
      avoidTolls: typeof input.avoidTolls === 'boolean' ? input.avoidTolls : undefined,
      avoidHighways: typeof input.avoidHighways === 'boolean' ? input.avoidHighways : undefined,
    },
  };
}

function localRoute(body: TascoRouteRequest): TascoRouteResponse {
  const coordinates = body.locations.map((location) => [location.lon, location.lat] as [number, number]);
  const distance = body.locations.slice(1).reduce((sum, location, index) => {
    const previous = body.locations[index];
    return sum + distanceMeters(previous.lat, previous.lon, location.lat, location.lon);
  }, 0);
  const distanceMetersRounded = Math.round(distance);
  const durationSeconds = Math.max(1, Math.round(distanceMetersRounded / routeMetersPerSecond(body.mode ?? 'auto')));
  return {
    routes: [
      {
        routeId: 'route:local-fallback',
        sourceIndex: 0,
        summary: {
          distanceMeters: distanceMetersRounded,
          durationSeconds,
        },
        geometry: {
          type: 'LineString',
          coordinates,
        },
        maneuvers: [
          {
            instruction: 'Di theo tuyến đường được ước tính từ dữ liệu địa phương.',
            distanceMeters: distanceMetersRounded,
            durationSeconds,
            beginShapeIndex: 0,
            endShapeIndex: Math.max(1, coordinates.length - 1),
            streetNames: [],
          },
        ],
      },
    ],
    meta: {
      mode: body.mode ?? 'auto',
      alternates: body.alternates ?? 2,
      source: 'local-fallback',
      upstreamUsed: false,
    },
  };
}

function routeMetersPerSecond(mode: string): number {
  if (mode === 'pedestrian') return 1.35;
  if (mode === 'bicycle') return 4.5;
  return 8.5;
}

function summaryForPlace(place: Pick<PlaceResult, 'label' | 'category' | 'address'>): string {
  return `${place.label} is a ${place.category ?? 'place'}${place.address ? ` at ${place.address}` : ''}.`;
}

function localOpeningHours(place: Pick<PlaceResult, 'category'>): string {
  const category = normalizeText(place.category ?? '');
  if (category.includes('hospital') || category.includes('atm') || category.includes('gas')) {
    return '00:00-24:00';
  }
  if (category.includes('cafe') || category.includes('ca phe') || category.includes('coffee') || category.includes('restaurant')) {
    return '07:00-22:00';
  }
  if (category.includes('hotel')) {
    return '00:00-24:00';
  }
  return '09:00-22:00';
}

function localReviews(place: Pick<PlaceResult, 'id' | 'label' | 'category' | 'address'>): TascoReview[] {
  const category = place.category ?? 'place';
  return [
    {
      id: `${slugId(place.id)}:review:1`,
      author: 'TASCO demo user',
      rating: 4.6,
      text: `${place.label} is a relevant ${category} result for this map search.`,
      createdAt: '2026-06-25T00:00:00.000Z',
      source: 'local-fallback',
    },
    {
      id: `${slugId(place.id)}:review:2`,
      author: 'Local guide',
      rating: 4.4,
      text: place.address ? `Useful location near ${place.address}.` : 'Useful local result from the hackathon dataset.',
      createdAt: '2026-06-26T00:00:00.000Z',
      source: 'local-fallback',
    },
  ];
}

function localPhotos(place: Pick<PlaceResult, 'id' | 'label' | 'category'>): TascoPhoto[] {
  const slug = slugId(place.id);
  return [
    {
      id: `${slug}:photo:1`,
      url: `https://hackathon.example.com/mock-photos/${slug}-1.jpg`,
      caption: `${place.label} exterior`,
      width: 1200,
      height: 800,
      source: 'local-fallback',
    },
    {
      id: `${slug}:photo:2`,
      url: `https://hackathon.example.com/mock-photos/${slug}-2.jpg`,
      caption: `${place.category ?? 'Place'} context`,
      width: 1200,
      height: 800,
      source: 'local-fallback',
    },
  ];
}

function slugId(value: string): string {
  return normalizeText(value).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'place';
}

function distanceMeters(latA: number, lonA: number, latB: number, lonB: number): number {
  const earthRadiusMeters = 6371000;
  const dLat = toRadians(latB - latA);
  const dLon = toRadians(lonB - lonA);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(latA)) * Math.cos(toRadians(latB)) * Math.sin(dLon / 2) ** 2;
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function optionalInteger(
  value: string | null,
  name: string,
  min: number,
  max: number,
  errors: string[],
): number | undefined {
  if (value == null || value.trim() === '') {
    return undefined;
  }
  if (!/^\d+$/.test(value)) {
    errors.push(`${name} must be an integer`);
    return undefined;
  }
  const parsed = Number(value);
  if (parsed < min || parsed > max) {
    errors.push(`${name} must be between ${min} and ${max}`);
  }
  return parsed;
}

function optionalNumber(
  value: string | null,
  name: string,
  min: number,
  max: number,
  errors: string[],
): number | undefined {
  if (value == null || value.trim() === '') {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    errors.push(`${name} must be a finite number`);
    return undefined;
  }
  if (parsed < min || parsed > max) {
    errors.push(`${name} must be between ${min} and ${max}`);
  }
  return parsed;
}

function optionalBoolean(value: string | null, name: string, errors: string[]): boolean | undefined {
  if (value == null || value.trim() === '') return undefined;
  const normalized = value.trim().toLowerCase();
  if (['true', '1', 'yes'].includes(normalized)) return true;
  if (['false', '0', 'no'].includes(normalized)) return false;
  errors.push(`${name} must be true or false`);
  return undefined;
}

function isPoiPath(pathname: string): boolean {
  return /^\/(?:v1\/)?poi\/[^/]+$/.test(pathname);
}

function mockErrorResult(url: URL): TascoFacadeResult | undefined {
  const code = url.searchParams.get('mockError')?.trim().toLowerCase();
  if (!code) {
    return undefined;
  }
  const mockError = MOCK_ERROR_RESPONSES[code];
  if (!mockError) {
    return errorResult(
      400,
      'invalid_request',
      'Unsupported mockError value.',
      { mockError: code, supported: Object.keys(MOCK_ERROR_RESPONSES) },
      'invalid mock error',
    );
  }
  return errorResult(
    mockError.status,
    code,
    mockError.message,
    { mock: true, trigger: 'mockError', path: url.pathname },
    `mock ${code}`,
  );
}

function errorResult(
  status: number,
  code: string,
  message: string,
  details: Record<string, unknown> | string[],
  logMessage: string,
): TascoFacadeResult {
  return {
    status,
    headers: JSON_HEADERS,
    body: {
      error: {
        code,
        message,
        details,
      },
    },
    log: {
      action: 'tasco.facade',
      query: '',
      statusCode: status,
      message: logMessage,
    },
  };
}
