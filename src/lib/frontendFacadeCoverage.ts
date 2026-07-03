export interface FacadeEndpointStatus {
  id: string;
  label: string;
  method: 'GET' | 'POST';
  path: string;
  ok: boolean;
  summary: string;
}

const DEFAULT_API_BASE_URL = 'http://127.0.0.1:8787';
const DEFAULT_LOCATION = { lat: 10.7769, lon: 106.7009 };
const DEFAULT_ROUTE_DESTINATION = { lat: 10.772, lon: 106.698 };

export interface FacadeLocationContext {
  lat: number;
  lon: number;
}

export async function fetchFacadeCoverage(
  location: FacadeLocationContext | undefined,
  apiBaseUrl = resolveApiBaseUrl(),
): Promise<FacadeEndpointStatus[]> {
  const origin = location ?? DEFAULT_LOCATION;
  const routeBody = {
    locations: [origin, DEFAULT_ROUTE_DESTINATION],
    mode: 'auto',
  };
  const proximityParams = `lat=${origin.lat}&lon=${origin.lon}`;

  return Promise.all([
    checkEndpoint(apiBaseUrl, 'health', 'Health', 'GET', '/health'),
    checkEndpoint(apiBaseUrl, 'autocomplete', 'Autocomplete', 'GET', `/v1/autocomplete?q=cap&limit=3&lang=vi&${proximityParams}`),
    checkEndpoint(apiBaseUrl, 'search', 'Search', 'GET', `/v1/search?q=coffee&limit=3&lang=vi&${proximityParams}`),
    checkEndpoint(apiBaseUrl, 'poi', 'POI', 'GET', '/v1/poi/poi:POI001?include=ai_summary&lang=vi'),
    checkEndpoint(apiBaseUrl, 'reverse', 'Reverse', 'GET', `/v1/reverse-geocoding?${proximityParams}&lang=vi`),
    checkEndpoint(apiBaseUrl, 'nearby', 'Nearby', 'GET', `/v1/nearby-search?${proximityParams}&category=ATM&limit=3&lang=vi`),
    checkEndpoint(apiBaseUrl, 'geocoding', 'Geocoding', 'GET', `/v1/geocoding?address=Nguyen%20Hue&city=TP.HCM&limit=3&lang=vi&${proximityParams}`),
    checkEndpoint(apiBaseUrl, 'route', 'Route', 'POST', '/v1/route', routeBody),
  ]);
}

function resolveApiBaseUrl(): string {
  const configured = import.meta.env.VITE_TASCO_API_BASE_URL?.trim();
  return configured || DEFAULT_API_BASE_URL;
}

async function checkEndpoint(
  apiBaseUrl: string,
  id: string,
  label: string,
  method: FacadeEndpointStatus['method'],
  path: string,
  body?: unknown,
): Promise<FacadeEndpointStatus> {
  try {
    const response = await fetch(new URL(path, apiBaseUrl), {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      return { id, label, method, path, ok: false, summary: `HTTP ${response.status}` };
    }
    const payload = (await response.json()) as Record<string, unknown>;
    return { id, label, method, path, ok: true, summary: summarizePayload(payload) };
  } catch (error) {
    return {
      id,
      label,
      method,
      path,
      ok: false,
      summary: error instanceof Error ? error.message : 'request failed',
    };
  }
}

function summarizePayload(payload: Record<string, unknown>): string {
  if ('suggestions' in payload && Array.isArray(payload.suggestions)) {
    return `${payload.suggestions.length} suggestions`;
  }
  if ('results' in payload && Array.isArray(payload.results)) {
    return `${payload.results.length} results`;
  }
  if ('poi' in payload) {
    return 'POI detail';
  }
  if ('routes' in payload && Array.isArray(payload.routes)) {
    return `${payload.routes.length} route`;
  }
  if ('ok' in payload) {
    return 'healthy';
  }
  return 'ready';
}
