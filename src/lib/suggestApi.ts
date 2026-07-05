import { suggest, suggestAsync } from './engine';
import type { EmbeddingContext } from './semantic';
import type { AgenticRuntimeOptions } from './agenticRuntime';
import type { AgenticRewriteProvider, AliasMemoryRecord, SuggestRequest, SuggestResponse, TascoDataset } from './types';

export interface ApiRequest {
  method: string;
  url: string;
}

export interface ApiResult {
  status: number;
  headers: Record<string, string>;
  body: SuggestResponse | ApiErrorResponse;
  log: {
    action: string;
    query: string;
    userId?: string;
    statusCode: number;
    message: string;
  };
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details?: string[];
  };
  latencyMs: number;
}

export interface SuggestApiRuntimeOptions {
  embeddingContext?: EmbeddingContext;
  semanticProvider?: {
    contextForQuery(query: string): Promise<EmbeddingContext | undefined>;
  };
  aliasMemory?: AliasMemoryRecord[];
  agenticProvider?: AgenticRewriteProvider;
  agenticRuntime?: AgenticRuntimeOptions;
}

interface ParsedSuggestRequest {
  q: string;
  city?: string;
  userId?: string;
  limit?: number;
  lat?: number;
  lng?: number;
  agentic?: boolean;
}

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'access-control-allow-origin': '*',
};

export function handleSuggestApiRequest(
  dataset: TascoDataset,
  request: ApiRequest,
  runtime: SuggestApiRuntimeOptions = {},
): ApiResult {
  const started = performance.now();
  const url = new URL(request.url, 'http://localhost');

  if (url.pathname !== '/api/suggest') {
    return errorResult(started, 404, 'not_found', 'Unknown API route.', [], 'unknown route');
  }

  if (request.method.toUpperCase() !== 'GET') {
    return errorResult(started, 405, 'method_not_allowed', 'Use GET for /api/suggest.', [], 'unsupported method');
  }

  const parsed = parseSuggestParams(url.searchParams);
  if (!parsed.ok) {
    return errorResult(started, 400, 'invalid_request', 'Invalid /api/suggest query parameters.', parsed.errors, 'invalid request');
  }

  const suggestRequest: SuggestRequest = {
    q: parsed.value.q,
    city: parsed.value.city,
    userId: parsed.value.userId,
    limit: parsed.value.limit,
    lat: parsed.value.lat,
    lon: parsed.value.lng,
    agentic: parsed.value.agentic,
    aliasMemory: runtime.aliasMemory,
    agenticProvider: runtime.agenticProvider,
  };
  const response = suggest(dataset, suggestRequest, runtime.embeddingContext);

  return {
    status: 200,
    headers: JSON_HEADERS,
    body: response,
    log: {
      action: 'api.suggest',
      query: parsed.value.q,
      userId: parsed.value.userId,
      statusCode: 200,
      message: parsed.value.lat == null ? 'suggestions returned' : 'suggestions returned with coordinate context',
    },
  };
}

export async function handleSuggestApiRequestAsync(
  dataset: TascoDataset,
  request: ApiRequest,
  runtime: SuggestApiRuntimeOptions = {},
): Promise<ApiResult> {
  const started = performance.now();
  const url = new URL(request.url, 'http://localhost');

  if (url.pathname !== '/api/suggest') {
    return errorResult(started, 404, 'not_found', 'Unknown API route.', [], 'unknown route');
  }

  if (request.method.toUpperCase() !== 'GET') {
    return errorResult(started, 405, 'method_not_allowed', 'Use GET for /api/suggest.', [], 'unsupported method');
  }

  const parsed = parseSuggestParams(url.searchParams);
  if (!parsed.ok) {
    return errorResult(started, 400, 'invalid_request', 'Invalid /api/suggest query parameters.', parsed.errors, 'invalid request');
  }

  const suggestRequest: SuggestRequest = {
    q: parsed.value.q,
    city: parsed.value.city,
    userId: parsed.value.userId,
    limit: parsed.value.limit,
    lat: parsed.value.lat,
    lon: parsed.value.lng,
    agentic: parsed.value.agentic,
    aliasMemory: runtime.aliasMemory,
    agenticProvider: runtime.agenticRuntime?.provider ?? runtime.agenticProvider,
  };
  const response = await suggestAsync(dataset, suggestRequest, {
    embeddingContext: runtime.embeddingContext,
    embeddingProvider: runtime.semanticProvider,
    agentic: runtime.agenticRuntime,
  });

  return {
    status: 200,
    headers: JSON_HEADERS,
    body: response,
    log: {
      action: 'api.suggest',
      query: parsed.value.q,
      userId: parsed.value.userId,
      statusCode: 200,
      message: parsed.value.lat == null ? 'suggestions returned' : 'suggestions returned with coordinate context',
    },
  };
}

function parseSuggestParams(params: URLSearchParams): { ok: true; value: ParsedSuggestRequest } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const q = params.get('q') ?? '';
  const city = optionalString(params.get('city'), 'city', 80, errors);
  const userId = optionalString(params.get('userId'), 'userId', 80, errors);
  const limit = optionalInteger(params.get('limit'), 'limit', 1, 12, errors);
  const lat = optionalNumber(params.get('lat'), 'lat', -90, 90, errors);
  const lng = optionalNumber(params.get('lng'), 'lng', -180, 180, errors);
  const agentic = optionalBoolean(params.get('agentic'), 'agentic', errors);

  if (q.length > 160) {
    errors.push('q must be 160 characters or fewer');
  }
  if ((lat == null) !== (lng == null)) {
    errors.push('lat and lng must be provided together');
  }
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, value: { q, city, userId, limit, lat, lng, agentic } };
}

function optionalString(value: string | null, name: string, maxLength: number, errors: string[]): string | undefined {
  if (value == null || value.trim() === '') {
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    errors.push(`${name} must be ${maxLength} characters or fewer`);
  }
  return trimmed;
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
  if (value == null || value.trim() === '') {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no'].includes(normalized)) {
    return false;
  }
  errors.push(`${name} must be true or false`);
  return undefined;
}

function errorResult(
  started: number,
  status: number,
  code: string,
  message: string,
  details: string[],
  logMessage: string,
): ApiResult {
  return {
    status,
    headers: JSON_HEADERS,
    body: {
      error: {
        code,
        message,
        details: details.length ? details : undefined,
      },
      latencyMs: Math.max(1, Math.round(performance.now() - started)),
    },
    log: {
      action: 'api.suggest',
      query: '',
      statusCode: status,
      message: logMessage,
    },
  };
}
