import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { handleSuggestApiRequest } from '../src/lib/suggestApi';
import type { TascoDataset } from '../src/lib/types';

export function createTascoApiServer(dataset: TascoDataset) {
  return createServer((request, response) => {
    const started = performance.now();
    const requestId = randomUUID();
    const result = handleSuggestApiRequest(dataset, {
      method: request.method ?? 'GET',
      url: request.url ?? '/',
    });
    const durationMs = Math.max(1, Math.round(performance.now() - started));

    response.writeHead(result.status, {
      ...result.headers,
      'x-request-id': requestId,
    });
    response.end(JSON.stringify(result.body));

    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: result.status >= 500 ? 'error' : 'info',
        request_id: requestId,
        user_id: result.log.userId,
        action: result.log.action,
        query: result.log.query,
        duration_ms: durationMs,
        status_code: result.log.statusCode,
        message: result.log.message,
      }),
    );
  });
}
