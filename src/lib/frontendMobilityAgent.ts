import type { AgentEvent, AgentTaskRequest, AgentTaskSnapshot } from './mobilityAgentTypes';

const DEFAULT_API_BASE_URL = 'http://127.0.0.1:8787';

interface CreateAgentTaskResponse {
  taskId: string;
  status: string;
  taskUrl: string;
  eventsUrl: string;
}

export async function createAgentTask(request: AgentTaskRequest): Promise<CreateAgentTaskResponse> {
  return requestJson('/v1/agent/tasks', { method: 'POST', body: JSON.stringify(request) }) as Promise<CreateAgentTaskResponse>;
}

export async function getAgentTask(taskId: string): Promise<AgentTaskSnapshot> {
  return normalizeAgentTaskSnapshot(await requestJson(`/v1/agent/tasks/${encodeURIComponent(taskId)}`, { method: 'GET' }));
}

export async function confirmAgentAction(taskId: string, actionId: string): Promise<AgentTaskSnapshot> {
  return normalizeAgentTaskSnapshot(await requestJson(`/v1/agent/tasks/${encodeURIComponent(taskId)}/actions/${encodeURIComponent(actionId)}/confirm`, { method: 'POST' }));
}

export async function reportAgentActionResult(taskId: string, actionId: string, success: boolean, message: string): Promise<AgentTaskSnapshot> {
  return normalizeAgentTaskSnapshot(await requestJson(`/v1/agent/tasks/${encodeURIComponent(taskId)}/actions/${encodeURIComponent(actionId)}/result`, {
    method: 'POST',
    body: JSON.stringify({ success, message }),
  }));
}

export async function cancelAgentTask(taskId: string): Promise<AgentTaskSnapshot> {
  return normalizeAgentTaskSnapshot(await requestJson(`/v1/agent/tasks/${encodeURIComponent(taskId)}/cancel`, { method: 'POST' }));
}

export function subscribeAgentTask(
  taskId: string,
  handlers: { onSnapshot: (task: AgentTaskSnapshot) => void; onEvent?: (event: AgentEvent) => void; onError?: () => void },
): () => void {
  const source = new EventSource(`${apiBaseUrl()}/v1/agent/tasks/${encodeURIComponent(taskId)}/events`);
  const snapshotListener = (event: Event) => handlers.onSnapshot(normalizeAgentTaskSnapshot(JSON.parse(String((event as MessageEvent).data))));
  const eventListener = (event: Event) => handlers.onEvent?.(JSON.parse(String((event as MessageEvent).data)) as AgentEvent);
  source.addEventListener('snapshot', snapshotListener);
  source.addEventListener('agent-event', eventListener);
  source.onerror = () => {
    source.close();
    handlers.onError?.();
  };
  return () => source.close();
}

export function normalizeAgentTaskSnapshot(value: unknown): AgentTaskSnapshot {
  if (!value || typeof value !== 'object') throw new Error('Agent API returned an invalid task snapshot.');
  const task = value as Partial<AgentTaskSnapshot>;
  if (!task.id || !task.status || !task.request) throw new Error('Agent API task snapshot is missing required identity fields.');
  const budgets = task.budgets;
  return {
    ...task,
    constraints: Array.isArray(task.constraints) ? task.constraints : [],
    modelCalls: Array.isArray(task.modelCalls)
      ? task.modelCalls.map((call) => ({ ...call, toolNames: Array.isArray(call.toolNames) ? call.toolNames : [] }))
      : [],
    toolCalls: Array.isArray(task.toolCalls) ? task.toolCalls : [],
    candidates: Array.isArray(task.candidates)
      ? task.candidates.map((candidate) => ({
          ...candidate,
          nearbyAmenities: Array.isArray(candidate.nearbyAmenities) ? candidate.nearbyAmenities : [],
          constraintResults: Array.isArray(candidate.constraintResults) ? candidate.constraintResults : [],
          rankingEvidence: Array.isArray(candidate.rankingEvidence) ? candidate.rankingEvidence : [],
        }))
      : [],
    events: Array.isArray(task.events) ? task.events : [],
    budgets: {
      toolCallsUsed: budgets?.toolCallsUsed ?? 0,
      toolCallLimit: budgets?.toolCallLimit ?? 20,
      replansUsed: budgets?.replansUsed ?? 0,
      replanLimit: budgets?.replanLimit ?? 2,
      elapsedMs: budgets?.elapsedMs ?? 0,
      timeLimitMs: budgets?.timeLimitMs ?? 0,
    },
  } as AgentTaskSnapshot;
}

async function requestJson(path: string, init: RequestInit): Promise<unknown> {
  const response = await fetch(`${apiBaseUrl()}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
  const payload = await response.json() as unknown;
  if (!response.ok) {
    const message = payload && typeof payload === 'object' && 'error' in payload
      ? String((payload as { error?: { message?: string } }).error?.message ?? `HTTP ${response.status}`)
      : `HTTP ${response.status}`;
    throw new Error(message);
  }
  return payload;
}

function apiBaseUrl(): string {
  return import.meta.env.VITE_TASCO_API_BASE_URL?.trim() || DEFAULT_API_BASE_URL;
}
