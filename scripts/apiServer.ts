import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { agentEventsTaskId, handleMobilityAgentApiRequest, isMobilityAgentPath } from '../src/lib/mobilityAgentApi';
import type { MobilityAgentRuntime } from '../src/lib/mobilityAgent';
import { handleBehaviorEventApiRequest, handleSuggestApiRequestAsync, isBehaviorEventApiPath } from '../src/lib/suggestApi';
import { handleTascoFacadeRequest, isTascoFacadePath, type TascoLiveClient, type TascoRuntimeOptions } from '../src/lib/tascoFacade';
import type { TascoDataset } from '../src/lib/types';

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'content-type,authorization,x-api-key',
  'access-control-max-age': '86400',
};

export function createTascoApiServer(
  dataset: TascoDataset,
  liveClient?: TascoLiveClient,
  runtime: TascoRuntimeOptions = {},
  mobilityAgent?: MobilityAgentRuntime,
) {
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

    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
    const eventsTaskId = agentEventsTaskId(pathname);
    if (eventsTaskId && mobilityAgent) {
      streamAgentEvents(response, mobilityAgent, eventsTaskId, requestId);
      return;
    }

    const apiRequest = {
      method: request.method ?? 'GET',
      url: request.url ?? '/',
      body: await readJsonBody(request),
    };
    const result = isMobilityAgentPath(pathname) && mobilityAgent
      ? handleMobilityAgentApiRequest(mobilityAgent, apiRequest)
      : isBehaviorEventApiPath(pathname)
      ? handleBehaviorEventApiRequest(apiRequest, {
          behaviorRuntime: runtime.behaviorRuntime,
        })
      : isTascoFacadePath(pathname)
      ? await handleTascoFacadeRequest(dataset, apiRequest, liveClient, runtime)
      : await handleSuggestApiRequestAsync(dataset, apiRequest, {
          semanticProvider: runtime.semanticProvider,
          aliasMemory: runtime.aliasMemory,
          agenticProvider: runtime.agenticProvider,
          agenticRuntime: runtime.agenticRuntime,
          behaviorRuntime: runtime.behaviorRuntime,
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

function streamAgentEvents(response: ServerResponse, runtime: MobilityAgentRuntime, taskId: string, requestId: string): void {
  const task = runtime.getTask(taskId);
  if (!task) {
    response.writeHead(404, { ...CORS_HEADERS, 'content-type': 'application/json; charset=utf-8', 'x-request-id': requestId });
    response.end(JSON.stringify({ error: { code: 'not_found', message: 'Agent task not found.' } }));
    return;
  }
  response.writeHead(200, {
    ...CORS_HEADERS,
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
    'x-request-id': requestId,
  });
  for (const event of task.events) writeSse(response, event.sequence, 'agent-event', event);
  writeSse(response, task.events.length, 'snapshot', task);
  if (isStreamTerminal(task.status) || task.status === 'ready_for_confirmation' || task.status === 'needs_clarification') {
    response.end();
    return;
  }
  const unsubscribe = runtime.subscribe(taskId, (event, nextTask) => {
    writeSse(response, event.sequence, 'agent-event', event);
    writeSse(response, event.sequence, 'snapshot', nextTask);
    if (isStreamTerminal(nextTask.status) || nextTask.status === 'ready_for_confirmation' || nextTask.status === 'needs_clarification') {
      unsubscribe?.();
      response.end();
    }
  });
  response.on('close', () => unsubscribe?.());
}

function writeSse(response: ServerResponse, id: number, event: string, data: unknown): void {
  response.write(`id: ${id}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function isStreamTerminal(status: string): boolean {
  return ['completed', 'degraded', 'failed', 'cancelled'].includes(status);
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
