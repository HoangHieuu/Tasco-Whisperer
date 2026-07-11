import type { MobilityPoi, RouteEvidence } from './mobilityAgentTypes';

export interface MobilityLiveTools {
  searchPlaces(query: string, limit: number): Promise<MobilityPoi[]>;
  calculateRoute(locations: Array<{ lat: number; lon: number }>): Promise<RouteEvidence | undefined>;
}

export interface MobilityLiveToolsConfig {
  peliasBaseUrl?: string;
  valhallaBaseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export function createMobilityLiveTools(config: MobilityLiveToolsConfig): MobilityLiveTools | undefined {
  if (!config.peliasBaseUrl && !config.valhallaBaseUrl) {
    return undefined;
  }
  const fetcher = config.fetchImpl ?? globalThis.fetch;
  if (!fetcher) {
    return undefined;
  }
  const timeoutMs = config.timeoutMs ?? 2_500;

  return {
    async searchPlaces(query, limit) {
      if (!config.peliasBaseUrl) return [];
      const base = config.peliasBaseUrl.replace(/\/+$/, '');
      const url = new URL(`${base}/v1/search`);
      url.searchParams.set('text', query);
      url.searchParams.set('size', String(limit));
      const response = await fetchWithTimeout(fetcher, url, { method: 'GET' }, timeoutMs);
      if (!response.ok) throw new Error(`Pelias returned HTTP ${response.status}`);
      return parsePeliasPlaces(await response.json());
    },
    async calculateRoute(locations) {
      if (!config.valhallaBaseUrl) return undefined;
      const endpoint = normalizeValhallaEndpoint(config.valhallaBaseUrl);
      const response = await fetchWithTimeout(
        fetcher,
        endpoint,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ locations, costing: 'auto', directions_options: { units: 'kilometers', language: 'vi-VN' } }),
        },
        timeoutMs,
      );
      if (!response.ok) throw new Error(`Valhalla returned HTTP ${response.status}`);
      return parseValhallaRoute(await response.json());
    },
  };
}

function parsePeliasPlaces(payload: unknown): MobilityPoi[] {
  if (!payload || typeof payload !== 'object') return [];
  const features = (payload as { features?: unknown }).features;
  if (!Array.isArray(features)) return [];
  return features.flatMap((feature, index) => {
    if (!feature || typeof feature !== 'object') return [];
    const row = feature as Record<string, unknown>;
    const properties = row.properties && typeof row.properties === 'object' ? (row.properties as Record<string, unknown>) : {};
    const geometry = row.geometry && typeof row.geometry === 'object' ? (row.geometry as Record<string, unknown>) : {};
    const coordinates = Array.isArray(geometry.coordinates) ? geometry.coordinates : [];
    const lon = typeof coordinates[0] === 'number' ? coordinates[0] : undefined;
    const lat = typeof coordinates[1] === 'number' ? coordinates[1] : undefined;
    const label = stringValue(properties.label) || stringValue(properties.name);
    if (lat == null || lon == null || !label) return [];
    const layer = stringValue(properties.layer);
    const categoryText = `${stringValue(properties.category)} ${label}`.toLowerCase();
    return [{
      id: stringValue(properties.gid) || `pelias:${index}:${lat}:${lon}`,
      label,
      category: /charg|charging|ev\b/.test(categoryText) ? 'ev-charger' as const : /coffee|cafe|cà phê/.test(categoryText) ? 'cafe' as const : layer === 'locality' ? 'destination' as const : 'other' as const,
      address: [stringValue(properties.housenumber), stringValue(properties.street), stringValue(properties.locality), stringValue(properties.region)].filter(Boolean).join(', '),
      coordinates: { lat, lon },
      source: 'live' as const,
      confidence: typeof properties.confidence === 'number' ? properties.confidence : 0.82,
      openingHoursVerified: false,
    }];
  });
}

function parseValhallaRoute(payload: unknown): RouteEvidence | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const record = payload as Record<string, unknown>;
  const trip = record.trip && typeof record.trip === 'object' ? (record.trip as Record<string, unknown>) : undefined;
  if (!trip) return parseNormalizedRoute(record);
  const summary = trip.summary && typeof trip.summary === 'object' ? (trip.summary as Record<string, unknown>) : {};
  const legs = Array.isArray(trip.legs) ? trip.legs : [];
  const geometry = legs.flatMap((leg) => {
    if (!leg || typeof leg !== 'object') return [];
    const shape = (leg as Record<string, unknown>).shape;
    return typeof shape === 'string' ? decodePolyline6(shape) : [];
  });
  const lengthKm = numberValue(summary.length);
  const durationSeconds = numberValue(summary.time);
  if (lengthKm == null || durationSeconds == null) return undefined;
  return {
    distanceMeters: Math.round(lengthKm * 1_000),
    durationSeconds: Math.round(durationSeconds),
    geometry,
    source: 'live',
    confidence: 0.96,
  };
}

function parseNormalizedRoute(payload: Record<string, unknown>): RouteEvidence | undefined {
  const routes = Array.isArray(payload.routes) ? payload.routes : [];
  const first = routes[0];
  if (!first || typeof first !== 'object') return undefined;
  const route = first as Record<string, unknown>;
  const summary = route.summary && typeof route.summary === 'object' ? (route.summary as Record<string, unknown>) : {};
  const geometry = route.geometry && typeof route.geometry === 'object' ? (route.geometry as Record<string, unknown>) : {};
  const coordinates = Array.isArray(geometry.coordinates) ? geometry.coordinates : [];
  const distanceMeters = numberValue(summary.distanceMeters);
  const durationSeconds = numberValue(summary.durationSeconds);
  if (distanceMeters == null || durationSeconds == null) return undefined;
  return {
    distanceMeters,
    durationSeconds,
    geometry: coordinates.flatMap((coordinate) => Array.isArray(coordinate) && typeof coordinate[0] === 'number' && typeof coordinate[1] === 'number' ? [{ lon: coordinate[0], lat: coordinate[1] }] : []),
    source: 'live',
    confidence: 0.96,
  };
}

function normalizeValhallaEndpoint(baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, '');
  // TASCO's public Valhalla gateway is mounted at /route and exposes the
  // Valhalla route action beneath it at /route/route.
  return /\/route\/route$/i.test(base) ? base : `${base}/route`;
}

async function fetchWithTimeout(fetcher: typeof fetch, input: URL | string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetcher(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function decodePolyline6(encoded: string): Array<{ lat: number; lon: number }> {
  const coordinates: Array<{ lat: number; lon: number }> = [];
  let index = 0;
  let lat = 0;
  let lon = 0;
  while (index < encoded.length) {
    const latitude = decodeValue(encoded, index);
    index = latitude.next;
    const longitude = decodeValue(encoded, index);
    index = longitude.next;
    lat += latitude.value;
    lon += longitude.value;
    coordinates.push({ lat: lat / 1e6, lon: lon / 1e6 });
  }
  return coordinates;
}

function decodeValue(encoded: string, start: number): { value: number; next: number } {
  let result = 0;
  let shift = 0;
  let index = start;
  let byte = 0;
  do {
    byte = encoded.charCodeAt(index++) - 63;
    result |= (byte & 0x1f) << shift;
    shift += 5;
  } while (byte >= 0x20 && index < encoded.length);
  return { value: result & 1 ? ~(result >> 1) : result >> 1, next: index };
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
