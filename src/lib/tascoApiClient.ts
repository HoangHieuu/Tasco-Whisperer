import type {
  PlaceResult,
  TascoLiveClient,
  TascoLiveQuery,
  TascoCoordinateQuery,
  TascoGeocodingQuery,
  TascoNearbyQuery,
  TascoPoiResponse,
  TascoRouteRequest,
  TascoRouteResponse,
} from './tascoFacade';

export interface TascoApiClientConfig {
  baseUrl?: string;
  bearerToken?: string;
  apiKey?: string;
  locale?: string;
  timezone?: string;
  headerProvider?: () => Record<string, string>;
  fetcher?: typeof fetch;
}

interface TascoPlaceResponse {
  suggestions?: unknown[];
  results?: unknown[];
  poi?: unknown;
}

export function createTascoApiClient(config: TascoApiClientConfig): TascoLiveClient | undefined {
  if (!config.baseUrl) {
    return undefined;
  }
  const fetcher = config.fetcher ?? fetch;
  const baseUrl = normalizeBaseUrl(config.baseUrl);

  return {
    autocomplete(params) {
      return fetchPlaces(fetcher, baseUrl, '/v1/autocomplete', params, config, 'suggestions');
    },
    search(params) {
      return fetchPlaces(fetcher, baseUrl, '/v1/search', params, config, 'results');
    },
    poi(id, params) {
      return fetchPoi(fetcher, baseUrl, id, params, config);
    },
    reverseGeocoding(params) {
      return fetchPlaces(fetcher, baseUrl, '/v1/reverse-geocoding', params, config, 'results');
    },
    nearbySearch(params) {
      return fetchPlaces(fetcher, baseUrl, '/v1/nearby-search', params, config, 'results');
    },
    geocoding(params) {
      return fetchPlaces(fetcher, baseUrl, '/v1/geocoding', params, config, 'results');
    },
    route(body) {
      return fetchRoute(fetcher, baseUrl, body, config);
    },
  };
}

function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, '');
  return trimmed.replace(/\/v1$/i, '');
}

async function fetchPlaces(
  fetcher: typeof fetch,
  baseUrl: string,
  path: string,
  params: TascoLiveQuery | TascoCoordinateQuery | TascoNearbyQuery | TascoGeocodingQuery,
  config: TascoApiClientConfig,
  responseKey: 'suggestions' | 'results',
): Promise<PlaceResult[]> {
  const url = new URL(`${baseUrl}${path}`);
  if ('q' in params) url.searchParams.set('q', params.q);
  if ('address' in params) url.searchParams.set('address', params.address);
  if ('city' in params && params.city) url.searchParams.set('city', params.city);
  if ('district' in params && params.district) url.searchParams.set('district', params.district);
  if ('limit' in params) url.searchParams.set('limit', String(params.limit));
  url.searchParams.set('lang', params.lang);
  if (params.lat != null && params.lon != null) {
    url.searchParams.set('lat', String(params.lat));
    url.searchParams.set('lon', String(params.lon));
  }
  if ('radiusMeters' in params && params.radiusMeters != null) {
    url.searchParams.set('radiusMeters', String(params.radiusMeters));
  }
  if ('category' in params && params.category) {
    url.searchParams.set('category', params.category);
  }
  if ('bbox' in params && params.bbox) {
    url.searchParams.set('bbox', params.bbox);
  }
  if ('openNow' in params && params.openNow != null) {
    url.searchParams.set('openNow', String(params.openNow));
  }
  if ('sessionId' in params && params.sessionId) {
    url.searchParams.set('sessionId', params.sessionId);
  }

  const response = await fetcher(url, {
    headers: requestHeaders(config),
  });
  if (!response.ok) {
    throw new Error(`TASCO upstream ${path} returned ${response.status}`);
  }
  const body = (await response.json()) as TascoPlaceResponse;
  const rows = Array.isArray(body[responseKey]) ? body[responseKey] : [];
  return rows.map(toPlaceResult).filter((place): place is PlaceResult => place != null);
}

async function fetchPoi(
  fetcher: typeof fetch,
  baseUrl: string,
  id: string,
  params: { lang: string; include?: string },
  config: TascoApiClientConfig,
): Promise<TascoPoiResponse['poi'] | undefined> {
  const url = new URL(`${baseUrl}/v1/poi/${encodeURIComponent(id)}`);
  url.searchParams.set('lang', params.lang);
  if (params.include) {
    url.searchParams.set('include', params.include);
  }
  const response = await fetcher(url, {
    headers: requestHeaders(config),
  });
  if (!response.ok) {
    throw new Error(`TASCO upstream /v1/poi returned ${response.status}`);
  }
  const body = (await response.json()) as TascoPlaceResponse;
  return toPoiResult(body.poi);
}

async function fetchRoute(
  fetcher: typeof fetch,
  baseUrl: string,
  body: TascoRouteRequest,
  config: TascoApiClientConfig,
): Promise<TascoRouteResponse | undefined> {
  const response = await fetcher(new URL(`${baseUrl}/v1/route`), {
    method: 'POST',
    headers: {
      ...requestHeaders(config),
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`TASCO upstream /v1/route returned ${response.status}`);
  }
  return toRouteResponse(await response.json(), body);
}

function requestHeaders(config: TascoApiClientConfig): Record<string, string> {
  const headers: Record<string, string> = {
    accept: 'application/json',
    'x-request-id': createRequestId(),
    'x-locale': config.locale ?? 'vi-VN',
    'x-timezone': config.timezone ?? 'Asia/Ho_Chi_Minh',
  };
  if (config.bearerToken) {
    headers.authorization = `Bearer ${config.bearerToken}`;
  }
  if (config.apiKey) {
    headers['x-api-key'] = config.apiKey;
  }
  return {
    ...headers,
    ...(config.headerProvider?.() ?? {}),
  };
}

function createRequestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `req-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function toPlaceResult(value: unknown): PlaceResult | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const row = value as Record<string, unknown>;
  const id = stringField(row.id);
  const label = stringField(row.label) || stringField(row.name);
  if (!id || !label) {
    return undefined;
  }
  const coordinates = coordinatesField(row.coordinates);
  return {
    id,
    type: stringField(row.type) || 'poi',
    name: stringField(row.name) || label,
    label,
    address: stringField(row.address),
    category: stringField(row.category),
    coordinates,
    distanceMeters: numberField(row.distanceMeters),
    score: numberField(row.score),
    source: stringField(row.source) || 'tasco-api',
    tags: arrayOfStrings(row.tags),
  };
}

function toPoiResult(value: unknown): TascoPoiResponse['poi'] | undefined {
  const place = toPlaceResult(value);
  if (!place || !value || typeof value !== 'object') {
    return place;
  }
  const row = value as Record<string, unknown>;
  return {
    ...place,
    rating: numberField(row.rating),
    openingHours: stringField(row.openingHours),
    aiSummary: stringField(row.aiSummary),
  };
}

function toRouteResponse(value: unknown, request: TascoRouteRequest): TascoRouteResponse | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const row = value as Record<string, unknown>;
  const rawRoutes = Array.isArray(row.routes) ? row.routes : [];
  const meta = objectField(row.meta);
  return {
    routes: rawRoutes.map((route, index) => toRoute(route, index)).filter((route): route is TascoRouteResponse['routes'][number] => route != null),
    meta: {
      mode: stringField(meta.mode) ?? request.mode ?? 'auto',
      alternates: numberField(meta.alternates) ?? request.alternates ?? 2,
      source: 'live',
      upstreamUsed: true,
    },
  };
}

function toRoute(value: unknown, index: number): TascoRouteResponse['routes'][number] | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const row = value as Record<string, unknown>;
  const summary = objectField(row.summary);
  const geometry = objectField(row.geometry);
  const maneuvers = Array.isArray(row.maneuvers) ? row.maneuvers : [];
  return {
    routeId: stringField(row.routeId) ?? `route:live-${index + 1}`,
    sourceIndex: numberField(row.sourceIndex) ?? index,
    summary: {
      distanceMeters: Math.max(0, Math.round(numberField(summary.distanceMeters) ?? 0)),
      durationSeconds: Math.max(0, Math.round(numberField(summary.durationSeconds) ?? 0)),
    },
    geometry: {
      type: 'LineString',
      coordinates: coordinatesList(geometry.coordinates),
    },
    maneuvers: maneuvers.map(toManeuver).filter((maneuver): maneuver is TascoRouteResponse['routes'][number]['maneuvers'][number] => maneuver != null),
  };
}

function toManeuver(value: unknown): TascoRouteResponse['routes'][number]['maneuvers'][number] | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const row = value as Record<string, unknown>;
  return {
    instruction: stringField(row.instruction) ?? '',
    distanceMeters: Math.max(0, Math.round(numberField(row.distanceMeters) ?? 0)),
    durationSeconds: Math.max(0, Math.round(numberField(row.durationSeconds) ?? 0)),
    beginShapeIndex: Math.max(0, Math.round(numberField(row.beginShapeIndex) ?? 0)),
    endShapeIndex: Math.max(0, Math.round(numberField(row.endShapeIndex) ?? 0)),
    streetNames: arrayOfStrings(row.streetNames) ?? [],
  };
}

function coordinatesField(value: unknown): PlaceResult['coordinates'] {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const coordinates = value as Record<string, unknown>;
  const lat = numberField(coordinates.lat);
  const lon = numberField(coordinates.lon);
  if (lat == null || lon == null) {
    return undefined;
  }
  return { lat, lon };
}

function coordinatesList(value: unknown): Array<[number, number]> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item): [number, number] | undefined => {
      if (!Array.isArray(item) || item.length < 2) {
        return undefined;
      }
      const lon = numberField(item[0]);
      const lat = numberField(item[1]);
      if (lon == null || lat == null || lon < -180 || lon > 180 || lat < -90 || lat > 90) {
        return undefined;
      }
      return [lon, lat];
    })
    .filter((coordinates): coordinates is [number, number] => coordinates != null);
}

function objectField(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function numberField(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function arrayOfStrings(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const strings = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  return strings.length ? strings : undefined;
}
