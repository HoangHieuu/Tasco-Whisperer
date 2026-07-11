import { describe, expect, it } from 'vitest';
import { normalizeAgentTaskSnapshot } from './frontendMobilityAgent';

describe('frontend mobility agent snapshot normalization', () => {
  it('accepts task snapshots from a pre-model-telemetry API without crashing the UI', () => {
    const snapshot = normalizeAgentTaskSnapshot({
      id: 'agent-task:legacy',
      status: 'understanding',
      request: {
        query: 'Find a charger on my route',
        context: { now: '2026-07-11T20:00:00+07:00', locale: 'en', sessionId: 'legacy' },
        executionMode: 'plan-and-propose',
      },
      constraints: [],
      toolCalls: [],
      candidates: [],
      events: [],
      budgets: { toolCallsUsed: 0, toolCallLimit: 20, replansUsed: 0, replanLimit: 2 },
      createdAt: '2026-07-11T13:00:00.000Z',
      updatedAt: '2026-07-11T13:00:00.000Z',
    });

    expect(snapshot.modelCalls).toEqual([]);
    expect(snapshot.events).toEqual([]);
    expect(snapshot.budgets).toMatchObject({ toolCallsUsed: 0, toolCallLimit: 20, elapsedMs: 0, timeLimitMs: 0 });
  });

  it('normalizes nested arrays used during rendering', () => {
    const snapshot = normalizeAgentTaskSnapshot({
      id: 'agent-task:new',
      status: 'executing',
      request: {
        query: 'Find a charger',
        context: { now: '2026-07-11T20:00:00+07:00', locale: 'en', sessionId: 'new' },
        executionMode: 'plan-and-propose',
      },
      modelCalls: [{ id: 'model:1', agent: 'Supervisor Agent', model: 'test', startedAt: '2026-07-11T13:00:00.000Z', status: 'completed' }],
      candidates: [{ id: 'bundle:1' }],
    });

    expect(snapshot.modelCalls[0].toolNames).toEqual([]);
    expect(snapshot.candidates[0].nearbyAmenities).toEqual([]);
    expect(snapshot.candidates[0].constraintResults).toEqual([]);
  });

  it('rejects non-task payloads with a useful message', () => {
    expect(() => normalizeAgentTaskSnapshot({ error: 'bad gateway' })).toThrow('missing required identity fields');
  });
});
