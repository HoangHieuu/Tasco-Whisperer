import type { MobilityAgentRuntime } from './mobilityAgent';
import type { AgentApiError, AgentTaskSnapshot } from './mobilityAgentTypes';

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };

export interface MobilityAgentApiRequest {
  method: string;
  url: string;
  body?: unknown;
}

export interface MobilityAgentApiResult {
  status: number;
  headers: Record<string, string>;
  body: AgentTaskSnapshot | AgentApiError | { taskId: string; status: string; taskUrl: string; eventsUrl: string };
  log: {
    action: string;
    query: string;
    statusCode: number;
    message: string;
    userId?: string;
  };
}

export function isMobilityAgentPath(pathname: string): boolean {
  return pathname === '/v1/agent/tasks' || pathname.startsWith('/v1/agent/tasks/');
}

export function agentEventsTaskId(pathname: string): string | undefined {
  const match = /^\/v1\/agent\/tasks\/([^/]+)\/events$/.exec(pathname);
  return match ? decodeURIComponent(match[1]) : undefined;
}

export function handleMobilityAgentApiRequest(runtime: MobilityAgentRuntime, request: MobilityAgentApiRequest): MobilityAgentApiResult {
  const method = request.method.toUpperCase();
  const url = new URL(request.url, 'http://localhost');
  const path = url.pathname;

  if (path === '/v1/agent/tasks') {
    if (method !== 'POST') return errorResult(405, 'method_not_allowed', 'Use POST to create an agent task.');
    const created = runtime.createTask(request.body);
    if (!created.ok) return errorResult(400, 'invalid_request', 'Invalid agent task request.', created.errors);
    return {
      status: 202,
      headers: JSON_HEADERS,
      body: {
        taskId: created.task.id,
        status: created.task.status,
        taskUrl: `/v1/agent/tasks/${encodeURIComponent(created.task.id)}`,
        eventsUrl: `/v1/agent/tasks/${encodeURIComponent(created.task.id)}/events`,
      },
      log: {
        action: 'agent.task.create',
        query: created.task.request.query,
        userId: created.task.request.context.userId,
        statusCode: 202,
        message: 'agent task accepted',
      },
    };
  }

  const taskMatch = /^\/v1\/agent\/tasks\/([^/]+)$/.exec(path);
  if (taskMatch) {
    if (method !== 'GET') return errorResult(405, 'method_not_allowed', 'Use GET to inspect an agent task.');
    const id = decodeURIComponent(taskMatch[1]);
    const task = runtime.getTask(id);
    return task ? taskResult(task, 'agent.task.get', 200, 'agent task returned') : errorResult(404, 'not_found', 'Agent task not found.');
  }

  const clarificationMatch = /^\/v1\/agent\/tasks\/([^/]+)\/clarifications$/.exec(path);
  if (clarificationMatch) {
    if (method !== 'POST') return errorResult(405, 'method_not_allowed', 'Use POST to submit clarification.');
    const result = runtime.provideClarification(decodeURIComponent(clarificationMatch[1]), request.body);
    return result.ok ? taskResult(result.task, 'agent.task.clarify', 202, 'clarification accepted') : errorResult(result.status, 'clarification_rejected', result.message);
  }

  const actionMatch = /^\/v1\/agent\/tasks\/([^/]+)\/actions\/([^/]+)\/(confirm|result)$/.exec(path);
  if (actionMatch) {
    if (method !== 'POST') return errorResult(405, 'method_not_allowed', 'Use POST for agent actions.');
    const taskId = decodeURIComponent(actionMatch[1]);
    const actionId = decodeURIComponent(actionMatch[2]);
    const result = actionMatch[3] === 'confirm'
      ? runtime.confirmAction(taskId, actionId)
      : runtime.recordActionResult(taskId, actionId, request.body);
    return result.ok ? taskResult(result.task, `agent.action.${actionMatch[3]}`, 200, `action ${actionMatch[3]} accepted`) : errorResult(result.status, 'action_rejected', result.message);
  }

  const cancelMatch = /^\/v1\/agent\/tasks\/([^/]+)\/cancel$/.exec(path);
  if (cancelMatch) {
    if (method !== 'POST') return errorResult(405, 'method_not_allowed', 'Use POST to cancel an agent task.');
    const result = runtime.cancelTask(decodeURIComponent(cancelMatch[1]));
    return result.ok ? taskResult(result.task, 'agent.task.cancel', 200, 'agent task cancelled') : errorResult(result.status, 'cancel_rejected', result.message);
  }

  if (agentEventsTaskId(path)) return errorResult(406, 'not_acceptable', 'Use an EventSource-compatible request for this SSE endpoint.');
  return errorResult(404, 'not_found', 'Unknown mobility-agent route.');
}

function taskResult(task: AgentTaskSnapshot, action: string, status: number, message: string): MobilityAgentApiResult {
  return {
    status,
    headers: JSON_HEADERS,
    body: task,
    log: {
      action,
      query: task.request.query,
      userId: task.request.context.userId,
      statusCode: status,
      message,
    },
  };
}

function errorResult(status: number, code: string, message: string, details?: string[]): MobilityAgentApiResult {
  return {
    status,
    headers: JSON_HEADERS,
    body: { error: { code, message, details } },
    log: {
      action: 'agent.error',
      query: '',
      statusCode: status,
      message,
    },
  };
}
