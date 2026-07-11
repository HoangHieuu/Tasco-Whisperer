import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { hasToolCall, stepCountIs, tool, ToolLoopAgent } from 'ai';
import { z } from 'zod';
import {
  MOBILITY_EXECUTOR_AGENT_SYSTEM_PROMPT,
  SUPERVISOR_AGENT_SYSTEM_PROMPT,
  VERIFIER_ACTION_AGENT_SYSTEM_PROMPT,
} from './mobilityAgentPrompts';
import type {
  AgentConstraint,
  AgentGoal,
  AgentTaskRequest,
  CandidateBundle,
  ExecutionPlan,
  MobilityPoi,
  MobilityToolName,
  RouteEvidence,
  VerificationReport,
} from './mobilityAgentTypes';

export interface AgentRunMetrics {
  stepCount: number;
  finishReason: string;
  toolNames: string[];
  inputTokens?: number;
  outputTokens?: number;
}

export interface SupervisorDecision {
  goal: AgentGoal;
  constraints: AgentConstraint[];
  plan: ExecutionPlan;
  missing?: { field: 'origin' | 'destination'; question: string };
}

export interface ExecutorSubmission {
  candidateIds: string[];
  summary: string;
}

export type VerifierDecision =
  | { kind: 'approve'; candidateId: string; rationale: string }
  | { kind: 'replan'; reason: string; guidance: string }
  | { kind: 'no_safe_result'; reason: string; relaxableConstraint?: string };

export interface ExecutorTools {
  resolveLocations(input: { originQuery?: string; destinationQuery?: string }): Promise<unknown>;
  calculateBaselineRoute(input: Record<string, never>): Promise<unknown>;
  searchAlongRoute(input: { query: string; category: 'ev-charger' | 'cafe' | 'other'; corridorMeters: number; limit: number }): Promise<unknown>;
  compareDetours(input: { candidateIds: string[] }): Promise<unknown>;
  checkOpeningStatus(input: { candidateIds: string[] }): Promise<unknown>;
  findNearbyPlaces(input: { candidateIds: string[]; category: 'cafe' | 'other'; radiusMeters: number }): Promise<unknown>;
  readPreferences(input: Record<string, never>): Promise<unknown>;
}

export interface VerifierTools {
  inspectCandidate(input: { candidateId: string }): Promise<unknown>;
}

export interface ThreeAgentSystem {
  readonly model: string;
  runSupervisor(input: {
    request: AgentTaskRequest;
    groundedDraft: SupervisorDecision;
    previousFailure?: string;
    nextVersion: number;
  }): Promise<{ decision: SupervisorDecision; metrics: AgentRunMetrics }>;
  runExecutor(input: {
    request: AgentTaskRequest;
    goal: AgentGoal;
    constraints: AgentConstraint[];
    plan: ExecutionPlan;
    tools: ExecutorTools;
  }): Promise<{ submission: ExecutorSubmission; metrics: AgentRunMetrics }>;
  runVerifier(input: {
    request: AgentTaskRequest;
    goal: AgentGoal;
    constraints: AgentConstraint[];
    candidates: CandidateBundle[];
    replansUsed: number;
    replanLimit: number;
    tools: VerifierTools;
  }): Promise<{ decision: VerifierDecision; metrics: AgentRunMetrics }>;
}

export interface OpenRouterThreeAgentConfig {
  apiKey: string;
  model: string;
  baseURL?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

const constraintIdSchema = z.enum(['facility', 'route', 'open-now', 'detour', 'nearby-amenity', 'origin', 'destination']);
const planActionSchema = z.enum(['resolve_locations', 'baseline_route', 'search_route_corridor', 'compare_detours', 'check_opening_status', 'find_nearby', 'read_preferences', 'submit_evidence']);

export function createOpenRouterThreeAgentSystem(config: OpenRouterThreeAgentConfig): ThreeAgentSystem {
  if (!config.apiKey.trim()) throw new Error('TASCO_MOBILITY_AGENT_API_KEY is required for real agent execution.');
  const provider = createOpenRouter({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    fetch: config.fetchImpl,
    compatibility: 'strict',
    appName: 'Tasco Whisperer',
  });
  const model = provider.chat(config.model);
  const timeout = config.timeoutMs ?? 10_000;

  return {
    model: config.model,

    async runSupervisor(input) {
      let submitted: SupervisorDecision | undefined;
      const submitPlan = tool({
        description: 'Submit the grounded goal, constraints, and dependency-aware execution plan. This is the only valid terminal action.',
        inputSchema: z.object({
          goalSummary: z.string().min(1),
          facility: z.enum(['ev-charger', 'place']),
          openNow: z.boolean(),
          maxDetourMinutes: z.number().positive().max(60),
          nearbyAmenity: z.enum(['cafe']).optional(),
          constraints: z.array(z.object({ id: constraintIdSchema, importance: z.enum(['hard', 'soft', 'missing']), evidence: z.string().min(1) })).min(1).max(8),
          steps: z.array(z.object({ id: z.string().min(1), action: planActionSchema, dependsOn: z.array(z.string()), failurePolicy: z.enum(['fallback', 'replan', 'clarify', 'stop']) })).min(3).max(10),
          rationale: z.string().min(1),
          missing: z.object({ field: z.enum(['origin', 'destination']), question: z.string().min(1) }).optional(),
        }),
        execute: async (value) => {
          const constraintUpdates = new Map(value.constraints.map((item) => [item.id, item]));
          const constraints = input.groundedDraft.constraints.map((item) => {
            const update = constraintUpdates.get(item.id as z.infer<typeof constraintIdSchema>);
            return update ? { ...item, importance: update.importance, evidence: update.evidence } : item;
          });
          const steps = value.steps.map((step) => ({
            id: step.id,
            agent: 'Mobility Executor Agent' as const,
            tool: toolForPlanAction(step.action),
            description: descriptionForPlanAction(step.action),
            dependsOn: step.dependsOn,
            successCondition: successForPlanAction(step.action),
            failurePolicy: step.failurePolicy,
            status: 'pending' as const,
          }));
          submitted = {
            goal: {
              ...input.groundedDraft.goal,
              summary: value.goalSummary,
              facility: value.facility,
              openNow: value.openNow,
              maxDetourMinutes: value.maxDetourMinutes,
              nearbyAmenity: value.nearbyAmenity,
              completionCriteria: [
                `facility=${value.facility}`,
                `detour<=${value.maxDetourMinutes} minutes`,
                ...(value.openNow ? ['source-backed open now'] : []),
                ...(value.nearbyAmenity ? [`${value.nearbyAmenity} nearby when available`] : []),
              ],
              rationale: [value.rationale],
            },
            constraints,
            plan: { version: input.nextVersion, rationale: value.rationale, steps },
            missing: value.missing,
          };
          return { accepted: true, planVersion: input.nextVersion, stepCount: steps.length };
        },
      });
      const agent = new ToolLoopAgent({
        model,
        maxOutputTokens: 1_600,
        temperature: 0,
        instructions: SUPERVISOR_AGENT_SYSTEM_PROMPT,
        tools: { submitPlan },
        toolChoice: 'required',
        stopWhen: [hasToolCall('submitPlan'), stepCountIs(3)],
      });
      const result = await agent.generate({
        prompt: JSON.stringify({ request: input.request, groundedDraft: input.groundedDraft, previousFailure: input.previousFailure }),
        timeout,
      });
      if (!submitted) throw new Error(`Supervisor Agent ended without submitting a valid plan (finish=${result.finishReason}; tools=${result.toolCalls.map((call) => call.toolName).join(',') || 'none'}).`);
      return { decision: submitted, metrics: metrics(result) };
    },

    async runExecutor(input) {
      let submission: ExecutorSubmission | undefined;
      const tools = {
        resolveLocations: tool({ description: 'Resolve grounded origin and destination. Use this before routing.', inputSchema: z.object({ originQuery: z.string().optional(), destinationQuery: z.string().optional() }), execute: input.tools.resolveLocations }),
        calculateBaselineRoute: tool({ description: 'Calculate the direct baseline route between resolved endpoints.', inputSchema: z.object({}), execute: input.tools.calculateBaselineRoute }),
        searchAlongRoute: tool({ description: 'Search grounded POIs inside a route corridor.', inputSchema: z.object({ query: z.string().min(1), category: z.enum(['ev-charger', 'cafe', 'other']), corridorMeters: z.number().int().min(500).max(30_000), limit: z.number().int().min(1).max(20) }), execute: input.tools.searchAlongRoute }),
        compareDetours: tool({ description: 'Calculate waypoint routes and detours for known candidate IDs.', inputSchema: z.object({ candidateIds: z.array(z.string()).min(1).max(20) }), execute: input.tools.compareDetours }),
        checkOpeningStatus: tool({ description: 'Check source-backed opening status for known candidate IDs at the requested time.', inputSchema: z.object({ candidateIds: z.array(z.string()).min(1).max(20) }), execute: input.tools.checkOpeningStatus }),
        findNearbyPlaces: tool({ description: 'Find grounded nearby amenities for known candidate IDs.', inputSchema: z.object({ candidateIds: z.array(z.string()).min(1).max(20), category: z.enum(['cafe', 'other']), radiusMeters: z.number().int().min(100).max(5_000) }), execute: input.tools.findNearbyPlaces }),
        readPreferences: tool({ description: 'Read a scoped, privacy-safe preference summary. Hard constraints always take precedence.', inputSchema: z.object({}), execute: input.tools.readPreferences }),
        submitEvidence: tool({
          description: 'Terminal action: submit candidate IDs only after gathering enough evidence to verify every hard constraint.',
          inputSchema: z.object({ candidateIds: z.array(z.string()).max(20), summary: z.string().min(1) }),
          execute: async (value) => { submission = value; return { accepted: true, candidateCount: value.candidateIds.length }; },
        }),
      };
      const agent = new ToolLoopAgent({
        model,
        maxOutputTokens: 1_200,
        temperature: 0,
        instructions: MOBILITY_EXECUTOR_AGENT_SYSTEM_PROMPT,
        tools,
        stopWhen: [hasToolCall('submitEvidence'), stepCountIs(10)],
      });
      const result = await agent.generate({ prompt: JSON.stringify({ request: input.request, goal: input.goal, constraints: input.constraints, plan: input.plan }), timeout: Math.max(timeout, 180_000) });
      if (!submission) throw new Error('Mobility Executor Agent exhausted its loop without submitting evidence.');
      return { submission, metrics: metrics(result) };
    },

    async runVerifier(input) {
      let decision: VerifierDecision | undefined;
      const tools = {
        inspectCandidate: tool({ description: 'Inspect the complete grounded evidence bundle for a candidate ID.', inputSchema: z.object({ candidateId: z.string().min(1) }), execute: input.tools.inspectCandidate }),
        approveCandidate: tool({
          description: 'Terminal action: approve one candidate only after inspection proves every hard constraint.',
          inputSchema: z.object({ candidateId: z.string().min(1), rationale: z.string().min(1) }),
          execute: async (value) => { decision = { kind: 'approve', ...value }; return { accepted: true }; },
        }),
        requestReplan: tool({
          description: 'Terminal action: request a bounded new plan when evidence fails but a different strategy may succeed.',
          inputSchema: z.object({ reason: z.string().min(1), guidance: z.string().min(1) }),
          execute: async (value) => { decision = { kind: 'replan', ...value }; return { accepted: true }; },
        }),
        noSafeResult: tool({
          description: 'Terminal action: report no safe result only when no replan budget remains or evidence proves that another strategy cannot help.',
          inputSchema: z.object({ reason: z.string().min(1), relaxableConstraint: z.string().optional() }),
          execute: async (value) => { decision = { kind: 'no_safe_result', ...value }; return { accepted: true }; },
        }),
      };
      const agent = new ToolLoopAgent({
        model,
        maxOutputTokens: 900,
        temperature: 0,
        instructions: VERIFIER_ACTION_AGENT_SYSTEM_PROMPT,
        tools,
        toolChoice: 'required',
        prepareStep: ({ stepNumber }) => {
          if (stepNumber === 0 && input.candidates.length > 0) {
            return {
              activeTools: ['inspectCandidate'] as const,
              toolChoice: 'required' as const,
            };
          }
          return {
            activeTools: ['approveCandidate', 'requestReplan', 'noSafeResult'] as const,
            toolChoice: 'required' as const,
          };
        },
        stopWhen: [hasToolCall('approveCandidate', 'requestReplan', 'noSafeResult'), stepCountIs(8)],
      });
      const result = await agent.generate({
        prompt: JSON.stringify({ request: input.request, goal: input.goal, constraints: input.constraints, replanBudget: { used: input.replansUsed, limit: input.replanLimit }, candidateIndex: input.candidates.map(candidateSummary) }),
        timeout: Math.max(timeout, 90_000),
      });
      if (!decision) throw new Error(`Verifier & Action Agent ended without a terminal decision (finish=${result.finishReason}; tools=${result.toolCalls.map((call) => call.toolName).join(',') || 'none'}).`);
      return { decision, metrics: metrics(result) };
    },
  };
}

function candidateSummary(candidate: CandidateBundle): Record<string, unknown> {
  return {
    id: candidate.id,
    label: candidate.primary.label,
    eligible: candidate.eligible,
    score: candidate.score,
    detourSeconds: candidate.detourSeconds,
    openNow: candidate.openNow,
    constraints: candidate.constraintResults,
  };
}

function metrics(result: {
  steps: unknown[];
  finishReason: string;
  toolCalls: Array<{ toolName: string }>;
  usage: { inputTokens?: number; outputTokens?: number };
}): AgentRunMetrics {
  return {
    stepCount: result.steps.length,
    finishReason: String(result.finishReason),
    toolNames: result.toolCalls.map((call) => call.toolName),
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
  };
}

export type GroundedAgentArtifacts = {
  pois: MobilityPoi[];
  routes: RouteEvidence[];
  verification?: VerificationReport;
};

function toolForPlanAction(action: z.infer<typeof planActionSchema>): MobilityToolName | undefined {
  const tools: Record<z.infer<typeof planActionSchema>, MobilityToolName | undefined> = {
    resolve_locations: 'location.resolve',
    baseline_route: 'route.calculate',
    search_route_corridor: 'place.search_along_route',
    compare_detours: 'route.compare_detours',
    check_opening_status: 'time.check_open_status',
    find_nearby: 'place.nearby',
    read_preferences: 'preferences.read',
    submit_evidence: undefined,
  };
  return tools[action];
}

function descriptionForPlanAction(action: z.infer<typeof planActionSchema>): string {
  return {
    resolve_locations: 'Resolve grounded route endpoints.',
    baseline_route: 'Calculate the direct baseline route.',
    search_route_corridor: 'Search for relevant places along the route corridor.',
    compare_detours: 'Compare waypoint routes against the baseline.',
    check_opening_status: 'Check source-backed opening status at the requested time.',
    find_nearby: 'Find requested amenities near candidate stops.',
    read_preferences: 'Read scoped preferences after hard constraints are available.',
    submit_evidence: 'Submit grounded candidate evidence to independent verification.',
  }[action];
}

function successForPlanAction(action: z.infer<typeof planActionSchema>): string {
  return {
    resolve_locations: 'Both route endpoints have coordinates.',
    baseline_route: 'A route duration and geometry are available.',
    search_route_corridor: 'Grounded candidates or an explicit empty result are returned.',
    compare_detours: 'Known candidates have waypoint detour evidence.',
    check_opening_status: 'Opening status is source-backed or explicitly unverified.',
    find_nearby: 'Nearby evidence is attached or explicitly unavailable.',
    read_preferences: 'A scoped preference summary or neutral result is returned.',
    submit_evidence: 'Only known candidate IDs are submitted.',
  }[action];
}
