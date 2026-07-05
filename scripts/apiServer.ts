import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage } from 'node:http';
import { handleSuggestApiRequestAsync } from '../src/lib/suggestApi';
import { handleTascoFacadeRequest, isTascoFacadePath, type TascoLiveClient, type TascoRuntimeOptions } from '../src/lib/tascoFacade';
import type { TascoDataset } from '../src/lib/types';

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'content-type,authorization,x-api-key',
  'access-control-max-age': '86400',
};

export function createTascoApiServer(dataset: TascoDataset, liveClient?: TascoLiveClient, runtime: TascoRuntimeOptions = {}) {
  return createServer(async (request, response) => {
    const started = performance.now();
    const requestId = randomUUID();
    if ((request.method ?? 'GET').toUpperCase() === 'OPTIONS') {
      response.writeHead(204, {
        ...CORS_HEADERS,
        'x-request-id': requestId,
      });
      response.end();
      return;
    }

    const apiRequest = {
      method: request.method ?? 'GET',
      url: request.url ?? '/',
      body: await readJsonBody(request),
    };
    const pathname = new URL(apiRequest.url, 'http://localhost').pathname;
    const result = isTascoFacadePath(pathname)
      ? await handleTascoFacadeRequest(dataset, apiRequest, liveClient, runtime)
      : await handleSuggestApiRequestAsync(dataset, apiRequest, {
          semanticProvider: runtime.semanticProvider,
          aliasMemory: runtime.aliasMemory,
          agenticProvider: runtime.agenticProvider,
          agenticRuntime: runtime.agenticRuntime,
        });
    const durationMs = Math.max(1, Math.round(performance.now() - started));

    response.writeHead(result.status, {
      ...CORS_HEADERS,
      ...result.headers,
      'x-request-id': requestId,
    });
    response.end(JSON.stringify(result.body));

    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: result.status >= 500 ? 'error' : 'info',
        request_id: requestId,
        user_id: 'userId' in result.log ? result.log.userId : undefined,
        action: result.log.action,
        query: result.log.query,
        duration_ms: durationMs,
        status_code: result.log.statusCode,
        message: result.log.message,
      }),
    );
  });
}

async function readJsonBody(request: IncomingMessage) {
  if ((request.method ?? 'GET').toUpperCase() !== 'POST') {
    return undefined;
  }
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) {
    return undefined;
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) {
    return undefined;
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}
