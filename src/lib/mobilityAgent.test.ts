import { describe, expect, it } from 'vitest';
import demoData from '../../data/agentic-mobility-demo.json';
import { MobilityAgentRuntime } from './mobilityAgent';
import { createScriptedThreeAgentTestProvider } from './mobilityAgentTestProvider';
import type { AgentTaskRequest, AgentTaskSnapshot, MobilityDemoData } from './mobilityAgentTypes';

const heroRequest: AgentTaskRequest = {
  query: 'Find an EV charger on my route to Đà Nẵng, near coffee, open now, with less than a 10-minute detour.',
  context: {
    currentLocation: { lat: 10.7769, lon: 106.7009 },
    now: '2026-07-11T20:00:00+07:00',
    locale: 'en',
    sessionId: 'agent-test',
    userId: 'commuter',
    vehicle: { type: 'ev', connectorTypes: ['CCS2'] },
  },
  executionMode: 'plan-and-propose',
};

describe('real three-agent mobility runtime', () => {
  it('runs three separate agents, replans, verifies evidence, and gates the action', async () => {
    const runtime = runtimeFor(demoData as MobilityDemoData);
    const created = runtime.createTask(heroRequest);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const task = await waitFor(runtime, created.task.id, ['ready_for_confirmation']);
    expect(task.budgets.replansUsed).toBe(1);
    expect(new Set(task.modelCalls.map((call) => call.agent))).toEqual(new Set(['Supervisor Agent', 'Mobility Executor Agent', 'Verifier & Action Agent']));
    expect(task.modelCalls).toHaveLength(6);
    expect(task.modelCalls.every((call) => call.status === 'completed' && call.toolNames.length > 0)).toBe(true);
    expect(new Set(task.toolCalls.map((call) => call.tool)).size).toBeGreaterThanOrEqual(6);
    expect(task.verification?.decision).toBe('pass');
    expect(task.candidates[0].primary.label).toBe('TASCO Charge Central A');
    expect(task.candidates[0].detourSeconds).toBeLessThanOrEqual(600);
    expect(task.proposedAction?.status).toBe('proposed');

    const confirmed = runtime.confirmAction(task.id, task.proposedAction!.id);
    expect(confirmed.ok && confirmed.task.proposedAction?.status).toBe('executing');
    expect(runtime.confirmAction(task.id, task.proposedAction!.id)).toMatchObject({ ok: false, status: 409 });
    const executed = runtime.recordActionResult(task.id, task.proposedAction!.id, { success: true, message: 'Web route updated.' });
    expect(executed.ok && executed.task.status).toBe('completed');
  });

  it('uses a Supervisor model call to ask for missing destination context', async () => {
    const runtime = runtimeFor(demoData as MobilityDemoData);
    const created = runtime.createTask({ ...heroRequest, query: 'Find a charger on my route', context: { ...heroRequest.context, destination: undefined } });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const task = await waitFor(runtime, created.task.id, ['needs_clarification']);
    expect(task.clarification).toMatchObject({ field: 'destination' });
    expect(task.modelCalls.map((call) => call.agent)).toEqual(['Supervisor Agent']);
    expect(task.toolCalls).toHaveLength(0);
  });

  it('fails clearly when production model configuration is absent', async () => {
    const runtime = new MobilityAgentRuntime(demoData as MobilityDemoData);
    const created = runtime.createTask(heroRequest);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const task = await waitFor(runtime, created.task.id, ['failed']);
    expect(task.finalMessage).toContain('TASCO_MOBILITY_AGENT_API_KEY');
    expect(task.modelCalls).toHaveLength(0);
  });

  it('rejects invalid input and supports cancellation', async () => {
    const runtime = runtimeFor(demoData as MobilityDemoData);
    expect(runtime.createTask({ query: 'x' })).toMatchObject({ ok: false });
    const created = runtime.createTask(heroRequest);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(runtime.cancelTask(created.task.id)).toMatchObject({ ok: true, task: { status: 'cancelled' } });
    await Promise.resolve();
    expect(runtime.getTask(created.task.id)?.status).toBe('cancelled');
  });

  it('never approves unverified opening hours for open-now', async () => {
    const unsafe = structuredClone(demoData) as MobilityDemoData;
    for (const poi of unsafe.places.filter((place) => place.category === 'ev-charger')) poi.openingHoursVerified = false;
    const runtime = new MobilityAgentRuntime(unsafe, {
      agentSystem: createScriptedThreeAgentTestProvider(),
      toolCallLimit: 40,
    });
    const created = runtime.createTask(heroRequest);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const task = await waitFor(runtime, created.task.id, ['degraded']);
    expect(task.verification?.decision).toBe('no_safe_result');
    expect(task.proposedAction).toBeUndefined();
    expect(task.candidates.every((candidate) => !candidate.eligible)).toBe(true);
  });

  it('uses a route-aligned labeled fallback when live chargers lack verified hours', async () => {
    const routeWaypoint = { lat: 14.362052, lon: 107.530158 };
    const runtime = new MobilityAgentRuntime(demoData as MobilityDemoData, {
      agentSystem: createScriptedThreeAgentTestProvider(),
      liveTools: {
        async searchPlaces() {
          return [{
            id: 'live:unverified-charger',
            label: 'Live charger without hours',
            category: 'ev-charger',
            address: 'Live Pelias result',
            coordinates: { lat: 14.36, lon: 107.53 },
            source: 'live',
            confidence: 0.9,
            openingHoursVerified: false,
          }];
        },
        async calculateRoute(locations) {
          return {
            distanceMeters: locations.length === 2 ? 827_955 : 828_100,
            durationSeconds: locations.length === 2 ? 36_128 : 36_188,
            geometry: [heroRequest.context.currentLocation!, routeWaypoint, { lat: 16.0544, lon: 108.2022 }],
            source: 'live',
            confidence: 0.96,
          };
        },
      },
    });
    const created = runtime.createTask(heroRequest);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const task = await waitFor(runtime, created.task.id, ['ready_for_confirmation']);
    expect(task.candidates[0].primary.id).toBe('demo:charger-central-c');
    expect(task.candidates[0].primary.source).toBe('synthetic-demo');
    expect(task.candidates[0].route.source).toBe('live');
    expect(task.candidates[0].detourSeconds).toBeLessThanOrEqual(600);
    expect(task.candidates.find((candidate) => candidate.primary.id === 'live:unverified-charger')?.eligible).toBe(false);
  });

  it('retries one recoverable verifier failure without consuming the replan budget', async () => {
    const baseProvider = createScriptedThreeAgentTestProvider();
    let verifierAttempts = 0;
    const runtime = new MobilityAgentRuntime(demoData as MobilityDemoData, {
      agentSystem: {
        ...baseProvider,
        async runVerifier(input) {
          verifierAttempts += 1;
          if (verifierAttempts === 1) {
            throw new Error('Verifier & Action Agent ended without a terminal decision.');
          }
          return baseProvider.runVerifier(input);
        },
      },
    });
    const created = runtime.createTask(heroRequest);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const task = await waitFor(runtime, created.task.id, ['ready_for_confirmation']);
    expect(task.budgets.replansUsed).toBe(1);
    expect(task.modelCalls.filter((call) => call.agent === 'Verifier & Action Agent' && call.status === 'failed')).toHaveLength(1);
    expect(task.modelCalls.filter((call) => call.agent === 'Verifier & Action Agent' && call.status === 'completed')).toHaveLength(2);
    expect(task.events.some((event) => event.message.includes('retry 2/2 scheduled'))).toBe(true);
    expect(task.verification?.decision).toBe('pass');
    expect(task.proposedAction?.status).toBe('proposed');
  });
});

function runtimeFor(data: MobilityDemoData): MobilityAgentRuntime {
  return new MobilityAgentRuntime(data, { agentSystem: createScriptedThreeAgentTestProvider() });
}

async function waitFor(runtime: MobilityAgentRuntime, id: string, statuses: AgentTaskSnapshot['status'][]): Promise<AgentTaskSnapshot> {
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    const task = runtime.getTask(id);
    if (task && statuses.includes(task.status)) return task;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Task ${id} did not reach ${statuses.join(', ')}`);
}
