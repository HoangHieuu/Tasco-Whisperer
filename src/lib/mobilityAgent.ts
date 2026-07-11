import type { BehaviorEvent } from './types';
import type { MobilityLiveTools } from './mobilityLiveTools';
import type {
  AgentConstraint,
  AgentEvent,
  AgentGoal,
  AgentModelCallRecord,
  AgentTaskRequest,
  AgentTaskSnapshot,
  AgentTaskStatus,
  CandidateBundle,
  Coordinates,
  EvidenceSource,
  MobilityAgentName,
  MobilityDemoData,
  MobilityPoi,
  MobilityToolName,
  PlaceReference,
  ProposedAction,
  RouteEvidence,
  ToolCallRecord,
  VerificationReport,
} from './mobilityAgentTypes';
import type {
  AgentRunMetrics,
  ExecutorSubmission,
  ExecutorTools,
  SupervisorDecision,
  ThreeAgentSystem,
  VerifierDecision,
  VerifierTools,
} from './mobilityReasoningProvider';

const TERMINAL_STATUSES = new Set<AgentTaskStatus>(['completed', 'degraded', 'failed', 'cancelled']);
const ALLOWED_TOOLS = new Set<MobilityToolName>([
  'location.resolve', 'place.search', 'place.search_along_route', 'place.nearby', 'poi.details',
  'route.calculate', 'route.compare_detours', 'time.check_open_status', 'preferences.read',
  'preferences.record_feedback', 'action.propose', 'action.execute',
]);

export interface MobilityAgentRuntimeOptions {
  liveTools?: MobilityLiveTools;
  agentSystem?: ThreeAgentSystem;
  behaviorEventsForUser?: (userId?: string) => BehaviorEvent[];
  now?: () => Date;
  timeLimitMs?: number;
  toolCallLimit?: number;
  replanLimit?: number;
}

type TaskListener = (event: AgentEvent, snapshot: AgentTaskSnapshot) => void;

interface MutableTask extends AgentTaskSnapshot {
  startedAtMs: number;
  listeners: Set<TaskListener>;
}

interface ToolOutcome<T> {
  value: T;
  source: EvidenceSource;
  confidence: number;
  summary: string;
}

interface RouteComparison {
  poi: MobilityPoi;
  route: RouteEvidence;
  detourSeconds: number;
  detourDistanceMeters: number;
}

interface ExecutionWorkspace {
  origin?: Coordinates;
  destination?: Coordinates;
  baseline?: RouteEvidence;
  pois: Map<string, MobilityPoi>;
  comparisons: Map<string, RouteComparison>;
  opening: Map<string, boolean | null>;
  nearby: Map<string, MobilityPoi[]>;
  preferenceTerms: string[];
}

export class MobilityAgentRuntime {
  private readonly tasks = new Map<string, MutableTask>();
  private readonly now: () => Date;

  constructor(private readonly data: MobilityDemoData, private readonly options: MobilityAgentRuntimeOptions = {}) {
    this.now = options.now ?? (() => new Date());
  }

  createTask(input: unknown): { ok: true; task: AgentTaskSnapshot } | { ok: false; errors: string[] } {
    const parsed = parseAgentTaskRequest(input);
    if (!parsed.ok) return parsed;
    const now = this.now();
    const task: MutableTask = {
      id: createId('agent-task'),
      status: 'received',
      request: parsed.value,
      constraints: [],
      modelCalls: [],
      toolCalls: [],
      candidates: [],
      events: [],
      budgets: {
        toolCallsUsed: 0,
        toolCallLimit: this.options.toolCallLimit ?? 20,
        replansUsed: 0,
        replanLimit: this.options.replanLimit ?? 2,
        elapsedMs: 0,
        timeLimitMs: this.options.timeLimitMs ?? 600_000,
      },
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      startedAtMs: now.getTime(),
      listeners: new Set(),
    };
    this.tasks.set(task.id, task);
    this.emit(task, 'state', 'Supervisor Agent', 'Task received. Starting the real three-agent workflow.');
    queueMicrotask(() => void this.runTask(task.id));
    return { ok: true, task: snapshot(task) };
  }

  getTask(id: string): AgentTaskSnapshot | undefined {
    const task = this.tasks.get(id);
    return task ? snapshot(task) : undefined;
  }

  subscribe(id: string, listener: TaskListener): (() => void) | undefined {
    const task = this.tasks.get(id);
    if (!task) return undefined;
    task.listeners.add(listener);
    return () => task.listeners.delete(listener);
  }

  provideClarification(id: string, input: unknown) {
    const task = this.tasks.get(id);
    if (!task) return failure(404, 'Agent task not found.');
    if (task.status !== 'needs_clarification' || !task.clarification) return failure(409, 'Task is not waiting for clarification.');
    const place = parsePlaceReference(input);
    if (!place) return failure(400, 'Clarification must include a label and coordinates.');
    if (task.clarification.field === 'destination') task.request.context.destination = place;
    else task.request.context.origin = place;
    task.clarification = undefined;
    task.constraints = [];
    task.plan = undefined;
    task.candidates = [];
    task.verification = undefined;
    task.proposedAction = undefined;
    task.budgets.replansUsed = 0;
    task.startedAtMs = this.now().getTime();
    this.setStatus(task, 'received', 'Supervisor Agent', `Clarification received for ${place.label}. Restarting reasoning.`);
    queueMicrotask(() => void this.runTask(id));
    return { ok: true as const, task: snapshot(task) };
  }

  confirmAction(id: string, actionId: string) {
    const task = this.tasks.get(id);
    if (!task) return failure(404, 'Agent task not found.');
    const action = task.proposedAction;
    if (!action || action.id !== actionId) return failure(404, 'Proposed action not found.');
    if (task.status === 'cancelled') return failure(409, 'Cancelled tasks cannot execute actions.');
    if (action.status !== 'proposed') return failure(409, `Action is already ${action.status}.`);
    if (new Date(action.expiresAt).getTime() <= this.now().getTime()) {
      action.status = 'expired';
      this.touch(task);
      return failure(410, 'Action confirmation expired.');
    }
    action.status = 'confirmed';
    this.setStatus(task, 'executing_action', 'Verifier & Action Agent', `User confirmed “${action.label}”.`);
    action.status = 'executing';
    return { ok: true as const, task: snapshot(task) };
  }

  recordActionResult(id: string, actionId: string, input: unknown) {
    const task = this.tasks.get(id);
    if (!task) return failure(404, 'Agent task not found.');
    const action = task.proposedAction;
    if (!action || action.id !== actionId) return failure(404, 'Proposed action not found.');
    if (action.status !== 'executing') return failure(409, 'Action is not awaiting an execution result.');
    const body = input && typeof input === 'object' ? input as Record<string, unknown> : {};
    const success = body.success === true;
    const message = typeof body.message === 'string' ? body.message : undefined;
    this.recordActionExecution(task, success, message);
    action.status = success ? 'completed' : 'failed';
    action.executionMessage = message ?? (success ? 'Navigation stop added.' : 'Client executor reported failure.');
    task.finalMessage = success ? `${action.payload.place.label} was added after explicit confirmation.` : `Action execution failed: ${action.executionMessage}`;
    this.setStatus(task, success ? 'completed' : 'failed', 'Verifier & Action Agent', task.finalMessage);
    return { ok: true as const, task: snapshot(task) };
  }

  cancelTask(id: string) {
    const task = this.tasks.get(id);
    if (!task) return failure(404, 'Agent task not found.');
    if (TERMINAL_STATUSES.has(task.status)) return failure(409, `Task is already ${task.status}.`);
    this.setStatus(task, 'cancelled', 'Supervisor Agent', 'Task cancelled. No further tools or actions may run.');
    return { ok: true as const, task: snapshot(task) };
  }

  private async runTask(id: string): Promise<void> {
    const task = this.tasks.get(id);
    if (!task || task.status === 'cancelled') return;
    try {
      if (!this.options.agentSystem) throw new Error('Real mobility agents are not configured. Add TASCO_MOBILITY_AGENT_API_KEY and TASCO_MOBILITY_AGENT_MODEL to .env, then restart the website.');
      let previousFailure: string | undefined;
      for (;;) {
        this.ensureWithinBudget(task);
        const draft = groundedSupervisorDraft(task.request, this.data, (task.plan?.version ?? 0) + 1);
        this.setStatus(task, task.budgets.replansUsed ? 'replanning' : 'understanding', 'Supervisor Agent', task.budgets.replansUsed ? 'Revising the plan from verifier evidence.' : 'Reasoning over the goal, constraints, and route context.');
        const supervisor = await this.runModelWithRetry(task, 'Supervisor Agent', () => this.options.agentSystem!.runSupervisor({
          request: task.request,
          groundedDraft: draft,
          previousFailure,
          nextVersion: draft.plan.version,
        }), 2);
        validateSupervisorDecision(supervisor.decision);
        task.goal = supervisor.decision.goal;
        task.constraints = supervisor.decision.constraints;
        task.plan = supervisor.decision.plan;
        if (supervisor.decision.missing || !task.goal.origin?.coordinates || !task.goal.destination?.coordinates) {
          task.clarification = supervisor.decision.missing ?? { field: 'destination', question: 'Where are you travelling to?' };
          this.setStatus(task, 'needs_clarification', 'Supervisor Agent', task.clarification.question);
          this.emit(task, 'clarification', 'Supervisor Agent', 'Execution paused instead of guessing required route context.');
          return;
        }
        this.emit(task, 'plan', 'Supervisor Agent', `Plan v${task.plan.version} accepted with ${task.plan.steps.length} model-selected steps.`, task.plan.rationale);

        const workspace = this.createWorkspace();
        this.setStatus(task, 'executing', 'Mobility Executor Agent', 'Running a bounded reason-and-act loop over grounded mobility tools.');
        const executorTools = this.createExecutorTools(task, workspace);
        const executor = await this.runModel(task, 'Mobility Executor Agent', () => this.options.agentSystem!.runExecutor({
          request: task.request,
          goal: task.goal!,
          constraints: task.constraints,
          plan: task.plan!,
          tools: executorTools,
        }));
        task.candidates = this.buildCandidates(task, workspace, executor.submission);
        this.emit(task, 'handoff', 'Mobility Executor Agent', `${task.candidates.length} grounded candidate bundles submitted to independent verification.`);

        this.setStatus(task, 'verifying', 'Verifier & Action Agent', 'Independently inspecting hard-constraint evidence before proposing any action.');
        const verifierTools = this.createVerifierTools(task);
        const verifier = await this.runModelWithRetry(task, 'Verifier & Action Agent', () => this.options.agentSystem!.runVerifier({
          request: task.request,
          goal: task.goal!,
          constraints: task.constraints,
          candidates: task.candidates,
          replansUsed: task.budgets.replansUsed,
          replanLimit: task.budgets.replanLimit,
          tools: verifierTools,
        }), 2);
        const outcome = await this.applyVerifierDecision(task, verifier.decision);
        if (outcome !== 'replan') return;
        if (task.budgets.replansUsed >= task.budgets.replanLimit) {
          task.verification = { decision: 'no_safe_result', passed: [], failed: ['replan-budget'], unverifiable: [], rationale: 'The verifier requested another strategy, but the bounded replan limit was reached.' };
          task.finalMessage = task.verification.rationale;
          this.setStatus(task, 'degraded', 'Verifier & Action Agent', task.finalMessage);
          return;
        }
        task.budgets.replansUsed += 1;
        previousFailure = verifier.decision.kind === 'replan' ? `${verifier.decision.reason}. ${verifier.decision.guidance}` : 'Verification requested replanning.';
      }
    } catch (error) {
      task.finalMessage = error instanceof Error ? error.message : 'Unknown mobility-agent failure.';
      this.setStatus(task, 'failed', 'Supervisor Agent', 'The three-agent workflow failed safely.', task.finalMessage);
      this.emit(task, 'error', 'Supervisor Agent', task.finalMessage);
    }
  }

  private createWorkspace(): ExecutionWorkspace {
    return { pois: new Map(), comparisons: new Map(), opening: new Map(), nearby: new Map(), preferenceTerms: [] };
  }

  private createExecutorTools(task: MutableTask, workspace: ExecutionWorkspace): ExecutorTools {
    return {
      resolveLocations: async ({ originQuery, destinationQuery }) => this.runTool(task, 'Mobility Executor Agent', 'location.resolve', `${originQuery ?? 'context origin'} → ${destinationQuery ?? 'context destination'}`, async () => {
        const origin = task.goal?.origin?.coordinates ?? task.request.context.origin?.coordinates ?? task.request.context.currentLocation;
        const destination = task.goal?.destination?.coordinates ?? task.request.context.destination?.coordinates;
        if (!origin || !destination) throw new Error('Grounded origin and destination coordinates are required.');
        workspace.origin = origin;
        workspace.destination = destination;
        return { value: { origin, destination }, source: 'local-dataset', confidence: 1, summary: 'Resolved coordinates from validated request context' };
      }),

      calculateBaselineRoute: async () => this.runTool(task, 'Mobility Executor Agent', 'route.calculate', 'baseline route', async () => {
        if (!workspace.origin || !workspace.destination) throw new Error('Resolve locations before calculating a route.');
        const live = await safeLiveRoute(this.options.liveTools, [workspace.origin, workspace.destination]);
        workspace.baseline = live ?? localRoute([workspace.origin, workspace.destination]);
        return { value: publicRoute(workspace.baseline), source: workspace.baseline.source, confidence: workspace.baseline.confidence, summary: `${formatMinutes(workspace.baseline.durationSeconds)} baseline, ${formatKm(workspace.baseline.distanceMeters)}` };
      }),

      searchAlongRoute: async ({ query, category, corridorMeters, limit }) => this.runTool(task, 'Mobility Executor Agent', 'place.search_along_route', `${query}; corridor=${corridorMeters}m`, async () => {
        if (!workspace.origin || !workspace.destination || !workspace.baseline) throw new Error('Resolve locations and calculate the baseline route before corridor search.');
        const live = await safeLiveSearch(this.options.liveTools, query, limit);
        const local = this.data.places.filter((place) => place.category === category);
        const merged = uniquePois([...live, ...local]).filter((place) => distanceToRouteMeters(place.coordinates, workspace.baseline!.geometry.length > 1 ? workspace.baseline!.geometry : [workspace.origin!, workspace.destination!]) <= corridorMeters).slice(0, limit);
        for (const poi of merged) workspace.pois.set(poi.id, poi);
        return {
          value: merged.map(publicPoi),
          source: live.length ? 'live' : 'synthetic-demo',
          confidence: live.length ? 0.88 : 0.95,
          summary: `${merged.length} grounded candidates; ${live.length} live and ${Math.max(0, merged.length - live.length)} fallback`,
        };
      }),

      compareDetours: async ({ candidateIds }) => this.runTool(task, 'Mobility Executor Agent', 'route.compare_detours', `${candidateIds.length} candidate IDs`, async () => {
        if (!workspace.origin || !workspace.destination || !workspace.baseline) throw new Error('Baseline route is required before detour comparison.');
        const results: RouteComparison[] = [];
        for (const id of uniqueStrings(candidateIds)) {
          const poi = workspace.pois.get(id);
          if (!poi) continue;
          const live = await safeLiveRoute(this.options.liveTools, [workspace.origin, poi.coordinates, workspace.destination]);
          const route = live ?? localRoute([workspace.origin, poi.coordinates, workspace.destination]);
          const penalty = live ? 0 : poi.accessPenaltySeconds ?? 0;
          const adjusted = { ...route, durationSeconds: route.durationSeconds + penalty };
          const comparison = {
            poi,
            route: adjusted,
            detourSeconds: Math.max(0, adjusted.durationSeconds - workspace.baseline.durationSeconds),
            detourDistanceMeters: Math.max(0, adjusted.distanceMeters - workspace.baseline.distanceMeters),
          };
          workspace.comparisons.set(id, comparison);
          results.push(comparison);
        }
        return { value: results.map((item) => ({ candidateId: item.poi.id, detourSeconds: item.detourSeconds, detourDistanceMeters: item.detourDistanceMeters, routeSource: item.route.source })), source: results.some((item) => item.route.source === 'live') ? 'live' : 'derived-estimate', confidence: results.some((item) => item.route.source === 'live') ? 0.96 : 0.74, summary: `${results.length} waypoint routes compared` };
      }),

      checkOpeningStatus: async ({ candidateIds }) => this.runTool(task, 'Mobility Executor Agent', 'time.check_open_status', task.request.context.now, async () => {
        let verified = 0;
        const values = uniqueStrings(candidateIds).flatMap((id) => {
          const poi = workspace.pois.get(id);
          if (!poi) return [];
          const openNow = openingState(poi, task.request.context.now);
          workspace.opening.set(id, openNow);
          if (poi.openingHoursVerified) verified += 1;
          return [{ candidateId: id, openNow, verified: poi.openingHoursVerified, hours: poi.openingHours ?? null, source: poi.source }];
        });
        return { value: values, source: values.some((item) => item.source === 'live') ? 'live' : 'synthetic-demo', confidence: values.length && verified === values.length ? 0.95 : 0.55, summary: `${verified}/${values.length} candidates have source-backed hours` };
      }),

      findNearbyPlaces: async ({ candidateIds, category, radiusMeters }) => this.runTool(task, 'Mobility Executor Agent', 'place.nearby', `${category} within ${radiusMeters}m`, async () => {
        let count = 0;
        for (const id of uniqueStrings(candidateIds)) {
          const candidate = workspace.pois.get(id);
          if (!candidate) continue;
          const nearby = this.data.places.filter((poi) => poi.category === category && (poi.relatedChargerId === id || distanceMeters(candidate.coordinates, poi.coordinates) <= radiusMeters));
          workspace.nearby.set(id, nearby);
          count += nearby.length;
        }
        return { value: [...workspace.nearby].map(([candidateId, places]) => ({ candidateId, places: places.map(publicPoi) })), source: 'synthetic-demo', confidence: 0.92, summary: `${count} nearby places grounded in the fallback dataset` };
      }),

      readPreferences: async () => this.runTool(task, 'Mobility Executor Agent', 'preferences.read', task.request.context.userId ?? 'anonymous', async () => {
        const events = this.options.behaviorEventsForUser?.(task.request.context.userId) ?? [];
        workspace.preferenceTerms = events.slice(-20).map((event) => `${event.brand ?? ''} ${event.category ?? ''} ${event.selectedText}`.toLowerCase());
        return { value: { eventCount: events.length, terms: workspace.preferenceTerms.slice(0, 8) }, source: 'local-dataset', confidence: events.length ? 0.8 : 1, summary: events.length ? `${events.length} scoped preference events` : 'Neutral ranking; no stored preferences' };
      }),
    };
  }

  private buildCandidates(task: MutableTask, workspace: ExecutionWorkspace, submission: ExecutorSubmission): CandidateBundle[] {
    const maxDetourSeconds = (task.goal?.maxDetourMinutes ?? 10) * 60;
    return uniqueStrings(submission.candidateIds).flatMap((id) => {
      const comparison = workspace.comparisons.get(id);
      if (!comparison) return [];
      const poi = comparison.poi;
      const openNow = workspace.opening.has(id) ? workspace.opening.get(id)! : null;
      const nearbyAmenities = workspace.nearby.get(id) ?? [];
      const facilityPass = task.goal?.facility !== 'ev-charger' || poi.category === 'ev-charger';
      const detourPass = comparison.detourSeconds <= maxDetourSeconds;
      const hoursPass = !task.goal?.openNow || (openNow === true && poi.openingHoursVerified);
      const preferenceMatch = workspace.preferenceTerms.some((term) => term.includes(poi.label.toLowerCase()));
      const eligible = facilityPass && detourPass && hoursPass;
      const score = eligible ? roundScore(0.45 * (1 - comparison.detourSeconds / Math.max(1, maxDetourSeconds)) + 0.2 + Math.min(0.15, nearbyAmenities.length * 0.15) + poi.confidence * 0.1 + (preferenceMatch ? 0.1 : 0)) : 0;
      return [{
        id: `bundle:${id}`,
        primary: poi,
        nearbyAmenities,
        detourSeconds: comparison.detourSeconds,
        detourDistanceMeters: comparison.detourDistanceMeters,
        openNow,
        route: comparison.route,
        constraintResults: [
          { constraintId: 'facility', status: facilityPass ? 'pass' : 'fail', evidence: `category=${poi.category}` },
          { constraintId: 'route', status: 'pass', evidence: `waypoint route source=${comparison.route.source}` },
          { constraintId: 'open-now', status: !task.goal?.openNow ? 'pass' : !poi.openingHoursVerified ? 'unverified' : openNow ? 'pass' : 'fail', evidence: poi.openingHours ? `${poi.openingHours}; source=${poi.source}` : 'No source-backed opening hours' },
          { constraintId: 'detour', status: detourPass ? 'pass' : 'fail', evidence: `${formatMinutes(comparison.detourSeconds)} additional travel; limit=${task.goal?.maxDetourMinutes ?? 10} min` },
          ...(task.goal?.nearbyAmenity ? [{ constraintId: 'nearby-amenity', status: nearbyAmenities.length ? 'pass' as const : 'unverified' as const, evidence: nearbyAmenities[0]?.label ?? 'No nearby amenity evidence' }] : []),
        ],
        score,
        rankingEvidence: [`${formatMinutes(comparison.detourSeconds)} detour`, `route=${comparison.route.source}`, openNow === true ? 'open with source-backed hours' : openNow === false ? 'closed at requested time' : 'opening status unverified', nearbyAmenities[0] ? `${nearbyAmenities[0].label} nearby` : 'no nearby amenity evidence', preferenceMatch ? 'preference match after hard-constraint filtering' : 'neutral personalization'],
        eligible,
      } satisfies CandidateBundle];
    }).sort((a, b) => b.score - a.score || a.detourSeconds - b.detourSeconds);
  }

  private createVerifierTools(task: MutableTask): VerifierTools {
    return {
      inspectCandidate: async ({ candidateId }) => this.runTool<unknown>(task, 'Verifier & Action Agent', 'poi.details', candidateId, async () => {
        const candidate = task.candidates.find((item) => item.id === candidateId || item.primary.id === candidateId);
        if (!candidate) return { value: { error: 'Unknown candidate ID' }, source: 'unverified', confidence: 0, summary: 'Candidate not found' };
        const evidence = {
          id: candidate.id,
          primary: {
            id: candidate.primary.id,
            label: candidate.primary.label,
            category: candidate.primary.category,
            address: candidate.primary.address,
            source: candidate.primary.source,
            confidence: candidate.primary.confidence,
            openingHours: candidate.primary.openingHours,
            openingHoursVerified: candidate.primary.openingHoursVerified,
          },
          nearbyAmenities: candidate.nearbyAmenities.map((place) => ({
            id: place.id,
            label: place.label,
            category: place.category,
            address: place.address,
            source: place.source,
            confidence: place.confidence,
          })),
          detourSeconds: candidate.detourSeconds,
          detourDistanceMeters: candidate.detourDistanceMeters,
          openNow: candidate.openNow,
          route: {
            distanceMeters: candidate.route.distanceMeters,
            durationSeconds: candidate.route.durationSeconds,
            source: candidate.route.source,
            confidence: candidate.route.confidence,
          },
          constraintResults: candidate.constraintResults,
          score: candidate.score,
          rankingEvidence: candidate.rankingEvidence,
          eligible: candidate.eligible,
        };
        return { value: evidence, source: candidate.primary.source, confidence: candidate.primary.confidence, summary: `${candidate.primary.label}: ${candidate.eligible ? 'all hard constraints pass' : 'one or more hard constraints fail'}` };
      }),
    };
  }

  private async applyVerifierDecision(task: MutableTask, decision: VerifierDecision): Promise<'done' | 'replan'> {
    if (decision.kind === 'replan') {
      this.emit(task, 'verification', 'Verifier & Action Agent', 'Evidence rejected; bounded replanning requested.', `${decision.reason} ${decision.guidance}`);
      return 'replan';
    }
    if (decision.kind === 'no_safe_result') {
      task.verification = { decision: 'no_safe_result', passed: [], failed: ['no-safe-result'], unverifiable: [], rationale: decision.reason };
      task.finalMessage = decision.relaxableConstraint ? `${decision.reason} You may choose to relax: ${decision.relaxableConstraint}.` : decision.reason;
      this.setStatus(task, 'degraded', 'Verifier & Action Agent', task.finalMessage);
      return 'done';
    }
    const winner = task.candidates.find((item) => item.id === decision.candidateId || item.primary.id === decision.candidateId);
    if (!winner) throw new Error('Verifier attempted to approve an unknown candidate.');
    const failedHardEvidence = winner.constraintResults.some((item) => item.status === 'fail' || (item.constraintId === 'open-now' && item.status === 'unverified'));
    if (!winner.eligible || failedHardEvidence) throw new Error('Verifier attempted to approve a candidate that failed deterministic hard-constraint validation.');
    task.verification = verificationForWinner(winner, decision.rationale);
    this.emit(task, 'verification', 'Verifier & Action Agent', `${winner.primary.label} independently verified.`, decision.rationale);
    task.proposedAction = await this.runTool(task, 'Verifier & Action Agent', 'action.propose', winner.primary.id, async () => {
      const action: ProposedAction = {
        id: createId('action'),
        type: 'add_stop',
        label: `Add ${winner.primary.label} as a charging stop`,
        payload: { place: { id: winner.primary.id, label: winner.primary.label, coordinates: winner.primary.coordinates }, route: winner.route },
        confirmationRequired: true,
        status: 'proposed',
        expiresAt: new Date(this.now().getTime() + 5 * 60_000).toISOString(),
      };
      return { value: action, source: winner.primary.source, confidence: winner.primary.confidence, summary: 'Typed add_stop proposal created; execution remains locked' };
    });
    task.finalMessage = `${winner.primary.label} is verified: ${formatMinutes(winner.detourSeconds)} detour${winner.nearbyAmenities[0] ? ` with ${winner.nearbyAmenities[0].label} nearby` : ''}.`;
    this.setStatus(task, 'ready_for_confirmation', 'Verifier & Action Agent', task.finalMessage, 'No navigation state changed. Explicit confirmation is required.');
    this.emit(task, 'action', 'Verifier & Action Agent', task.proposedAction.label, `Expires at ${task.proposedAction.expiresAt}.`);
    return 'done';
  }

  private async runModel<T extends { metrics: AgentRunMetrics }>(task: MutableTask, agent: MobilityAgentName, execute: () => Promise<T>): Promise<T> {
    this.ensureWithinBudget(task);
    const started = this.now();
    const record: AgentModelCallRecord = { id: createId('model'), agent, model: this.options.agentSystem?.model ?? 'unconfigured', startedAt: started.toISOString(), status: 'running', toolNames: [] };
    task.modelCalls.push(record);
    this.emit(task, 'model_started', agent, `${agent} called ${record.model}.`);
    try {
      const result = await execute();
      const completed = this.now();
      Object.assign(record, { completedAt: completed.toISOString(), durationMs: Math.max(0, completed.getTime() - started.getTime()), status: 'completed', stepCount: result.metrics.stepCount, finishReason: result.metrics.finishReason, toolNames: result.metrics.toolNames, inputTokens: result.metrics.inputTokens, outputTokens: result.metrics.outputTokens });
      this.emit(task, 'model_completed', agent, `${agent} completed ${result.metrics.stepCount} model step${result.metrics.stepCount === 1 ? '' : 's'}.`, result.metrics.toolNames.length ? `Model-selected tools: ${result.metrics.toolNames.join(', ')}` : 'No tools selected.');
      return result;
    } catch (error) {
      record.status = 'failed';
      record.completedAt = this.now().toISOString();
      record.durationMs = Math.max(0, this.now().getTime() - started.getTime());
      record.error = error instanceof Error ? error.message : 'Unknown model error';
      this.emit(task, 'error', agent, `${agent} model call failed.`, record.error);
      throw error;
    }
  }

  private async runModelWithRetry<T extends { metrics: AgentRunMetrics }>(
    task: MutableTask,
    agent: MobilityAgentName,
    execute: () => Promise<T>,
    maxAttempts: number,
  ): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await this.runModel(task, agent, execute);
      } catch (error) {
        lastError = error;
        if (attempt >= maxAttempts || !isRetryableModelFailure(error)) throw error;
        const detail = error instanceof Error ? error.message : 'Unknown recoverable model error.';
        this.emit(
          task,
          'handoff',
          agent,
          `${agent} retry ${attempt + 1}/${maxAttempts} scheduled after a recoverable model failure.`,
          detail,
        );
      }
    }
    throw lastError instanceof Error ? lastError : new Error(`${agent} exhausted its model retry budget.`);
  }

  private async runTool<T>(task: MutableTask, agent: MobilityAgentName, toolName: MobilityToolName, inputSummary: string, execute: () => Promise<ToolOutcome<T>>): Promise<T> {
    if (!ALLOWED_TOOLS.has(toolName)) throw new Error(`Tool ${toolName} is not allowlisted.`);
    this.ensureWithinBudget(task);
    if (task.budgets.toolCallsUsed >= task.budgets.toolCallLimit) throw new Error('Agent tool-call budget exhausted.');
    const started = this.now();
    const record: ToolCallRecord = { id: createId('tool'), tool: toolName, agent, startedAt: started.toISOString(), status: 'running', inputSummary: sanitizeEvidence(inputSummary) };
    task.toolCalls.push(record);
    task.budgets.toolCallsUsed += 1;
    this.emit(task, 'tool_started', agent, `${toolName} started.`, record.inputSummary);
    try {
      const outcome = await execute();
      const completed = this.now();
      Object.assign(record, { completedAt: completed.toISOString(), durationMs: Math.max(0, completed.getTime() - started.getTime()), status: 'completed', source: outcome.source, confidence: outcome.confidence, outputSummary: sanitizeEvidence(outcome.summary) });
      this.emit(task, 'tool_completed', agent, `${toolName} completed from ${outcome.source}.`, record.outputSummary);
      return outcome.value;
    } catch (error) {
      record.status = 'failed';
      record.completedAt = this.now().toISOString();
      record.error = error instanceof Error ? error.message : 'Unknown tool failure';
      this.emit(task, 'error', agent, `${toolName} failed.`, record.error);
      throw error;
    }
  }

  private recordActionExecution(task: MutableTask, success: boolean, message?: string): void {
    const at = this.now().toISOString();
    const record: ToolCallRecord = { id: createId('tool'), tool: 'action.execute', agent: 'Verifier & Action Agent', startedAt: at, completedAt: at, durationMs: 0, status: success ? 'completed' : 'failed', source: 'local-dataset', confidence: 1, inputSummary: 'User-confirmed typed navigation command', outputSummary: sanitizeEvidence(message ?? (success ? 'Client executor completed command' : 'Client executor rejected command')), error: success ? undefined : sanitizeEvidence(message ?? 'Client executor reported failure') };
    task.toolCalls.push(record);
    task.budgets.toolCallsUsed += 1;
    this.emit(task, success ? 'tool_completed' : 'error', 'Verifier & Action Agent', success ? 'action.execute completed.' : 'action.execute failed.', record.outputSummary);
  }

  private ensureWithinBudget(task: MutableTask): void {
    if (task.status === 'cancelled') throw new Error('Task was cancelled.');
    if (this.now().getTime() - task.startedAtMs > task.budgets.timeLimitMs) throw new Error('Agent time budget exhausted.');
  }

  private setStatus(task: MutableTask, status: AgentTaskStatus, agent: MobilityAgentName, message: string, detail?: string): void {
    task.status = status;
    this.emit(task, 'state', agent, message, detail);
  }

  private emit(task: MutableTask, kind: AgentEvent['kind'], agent: MobilityAgentName, message: string, detail?: string): void {
    const event: AgentEvent = { sequence: task.events.length + 1, timestamp: this.now().toISOString(), kind, agent, message: sanitizeEvidence(message), detail: detail ? sanitizeEvidence(detail) : undefined };
    task.events.push(event);
    this.touch(task);
    const current = snapshot(task);
    for (const listener of task.listeners) listener(event, current);
  }

  private touch(task: MutableTask): void {
    const now = this.now();
    task.updatedAt = now.toISOString();
    task.budgets.elapsedMs = Math.max(0, now.getTime() - task.startedAtMs);
  }
}

function groundedSupervisorDraft(request: AgentTaskRequest, data: MobilityDemoData, version: number): SupervisorDecision {
  const normalized = normalize(request.query);
  const origin = request.context.origin ?? (request.context.currentLocation ? { label: 'Current location', coordinates: request.context.currentLocation } : undefined);
  const destination = request.context.destination ?? data.knownLocations.find((place) => place.aliases.some((alias) => normalized.includes(normalize(alias))));
  const maxDetourMinutes = parseMaxDetourMinutes(normalized) ?? 10;
  const openNow = /open now|đang mở|mo cua|mở cửa/.test(normalized);
  const nearbyAmenity = /coffee|cafe|cà phê|ca phe/.test(normalized) ? 'cafe' : undefined;
  const facility = /charger|charging|ev|sạc|sac/.test(normalized) ? 'ev-charger' : 'place';
  const constraints: AgentConstraint[] = [
    constraint('facility', 'facility', 'equals', facility, 'hard', 0.98, 'Explicit facility request'),
    constraint('route', 'route', 'required', true, 'hard', 0.95, 'Request is evaluated along a route'),
    constraint('open-now', 'openNow', 'equals', openNow, openNow ? 'hard' : 'soft', 0.98, openNow ? 'Explicit open-now requirement' : 'Not explicitly required'),
    constraint('detour', 'maxDetourMinutes', 'lte', maxDetourMinutes, /detour|minute|min|phút|phut/.test(normalized) ? 'hard' : 'soft', 0.94, `Parsed limit=${maxDetourMinutes} minutes`),
  ];
  if (nearbyAmenity) constraints.push(constraint('nearby-amenity', 'nearbyAmenity', 'near', nearbyAmenity, 'soft', 0.96, 'Explicit nearby coffee preference'));
  const missing = !origin?.coordinates ? { field: 'origin' as const, question: 'What is your starting location?' } : !destination?.coordinates ? { field: 'destination' as const, question: 'Where are you travelling to?' } : undefined;
  const goal: AgentGoal = {
    summary: `Find ${facility === 'ev-charger' ? 'an EV charger' : 'a place'} on the route${destination ? ` to ${destination.label}` : ''}`,
    facility, origin, destination, maxDetourMinutes, openNow, nearbyAmenity,
    completionCriteria: [`facility=${facility}`, `detour<=${maxDetourMinutes} minutes`, ...(openNow ? ['source-backed open now'] : []), ...(nearbyAmenity ? [`${nearbyAmenity} nearby when available`] : [])],
    rationale: ['This request has dependent mobility constraints.', 'Grounded route and POI tools are required before an action can be proposed.'],
  };
  const steps = [
    planStep('resolve', 'Resolve grounded route endpoints.', [], 'Both endpoints have coordinates.', 'clarify'),
    planStep('baseline', 'Calculate the baseline route.', ['resolve'], 'Baseline duration and geometry exist.', 'fallback'),
    planStep('discover', `Search for ${facility} along the route.`, ['baseline'], 'Search returns grounded candidates or an empty result.', 'replan'),
    planStep('verify-route', 'Compare candidate detours against the baseline.', ['discover'], 'Candidates have route evidence.', 'fallback'),
    ...(openNow ? [planStep('verify-hours', 'Verify source-backed opening status.', ['discover'], 'Opening evidence is explicit or unverified.', 'replan')] : []),
    ...(nearbyAmenity ? [planStep('nearby', `Find ${nearbyAmenity} near candidates.`, ['discover'], 'Nearby evidence is attached or unavailable.', 'fallback')] : []),
    planStep('submit', 'Submit grounded evidence for independent verification.', ['verify-route'], 'Candidate IDs reference tool results only.', 'stop'),
  ];
  return { goal, constraints, missing, plan: { version, rationale: 'Grounded draft supplied to the Supervisor; the model may revise dependencies and strategy without changing evidence.', steps } };
}

function validateSupervisorDecision(decision: SupervisorDecision): void {
  const ids = new Set(decision.plan.steps.map((step) => step.id));
  if (!decision.goal.summary || !decision.constraints.length || !decision.plan.steps.length || ids.size !== decision.plan.steps.length) throw new Error('Supervisor returned an invalid goal or plan.');
  if (!decision.plan.steps.every((step) => step.dependsOn.every((id) => ids.has(id) && id !== step.id))) throw new Error('Supervisor plan contains an invalid dependency.');
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return false;
    if (visited.has(id)) return true;
    visiting.add(id);
    for (const dep of decision.plan.steps.find((step) => step.id === id)?.dependsOn ?? []) if (!visit(dep)) return false;
    visiting.delete(id); visited.add(id); return true;
  };
  if (![...ids].every(visit)) throw new Error('Supervisor plan must be acyclic.');
}

function verificationForWinner(winner: CandidateBundle, rationale: string): VerificationReport {
  return { decision: 'pass', passed: winner.constraintResults.filter((item) => item.status === 'pass').map((item) => item.constraintId), failed: [], unverifiable: winner.constraintResults.filter((item) => item.status === 'unverified').map((item) => item.constraintId), rationale: sanitizeEvidence(rationale) };
}

function localRoute(locations: Coordinates[]): RouteEvidence {
  const distance = locations.slice(1).reduce((total, point, index) => total + distanceMeters(locations[index], point), 0);
  return { distanceMeters: Math.round(distance), durationSeconds: Math.max(1, Math.round(distance / 19.44)), geometry: locations, source: 'derived-estimate', confidence: 0.74 };
}

async function safeLiveSearch(tools: MobilityLiveTools | undefined, query: string, limit: number): Promise<MobilityPoi[]> {
  if (!tools) return [];
  try { return await tools.searchPlaces(query, limit); } catch { return []; }
}

async function safeLiveRoute(tools: MobilityLiveTools | undefined, locations: Coordinates[]): Promise<RouteEvidence | undefined> {
  if (!tools) return undefined;
  try { return await tools.calculateRoute(locations); } catch { return undefined; }
}

function isRetryableModelFailure(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return ![
    'cancelled',
    'tool-call budget',
    'time budget',
    'unknown candidate',
    'hard-constraint validation',
    'invalid goal or plan',
    'invalid dependency',
    'plan must be acyclic',
  ].some((nonRetryable) => message.includes(nonRetryable));
}

function openingState(place: MobilityPoi, nowText: string): boolean | null {
  if (!place.openingHours || !place.openingHoursVerified) return null;
  if (place.openingHours === '00:00-24:00') return true;
  const match = /^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/.exec(place.openingHours);
  const date = new Date(nowText);
  if (!match || Number.isNaN(date.getTime())) return null;
  const current = date.getHours() * 60 + date.getMinutes();
  return current >= Number(match[1]) * 60 + Number(match[2]) && current <= Number(match[3]) * 60 + Number(match[4]);
}

function parseAgentTaskRequest(input: unknown): { ok: true; value: AgentTaskRequest } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!input || typeof input !== 'object') return { ok: false, errors: ['body must be a JSON object'] };
  const record = input as Record<string, unknown>;
  const query = typeof record.query === 'string' ? record.query.trim() : '';
  if (query.length < 3 || query.length > 500) errors.push('query must contain 3 to 500 characters');
  const context = record.context && typeof record.context === 'object' ? record.context as Record<string, unknown> : {};
  const now = typeof context.now === 'string' && !Number.isNaN(new Date(context.now).getTime()) ? context.now : '';
  if (!now) errors.push('context.now must be an ISO date-time');
  const locale = context.locale === 'en' ? 'en' : context.locale === 'vi-VN' ? 'vi-VN' : undefined;
  if (!locale) errors.push('context.locale must be vi-VN or en');
  const sessionId = typeof context.sessionId === 'string' ? context.sessionId.trim() : '';
  if (!sessionId) errors.push('context.sessionId is required');
  if (record.executionMode !== 'plan-and-propose') errors.push('executionMode must be plan-and-propose');
  if (errors.length || !locale) return { ok: false, errors };
  const vehicleInput = context.vehicle && typeof context.vehicle === 'object' ? context.vehicle as Record<string, unknown> : {};
  const vehicleType = ['car', 'motorbike', 'ev'].includes(String(vehicleInput.type)) ? vehicleInput.type as 'car' | 'motorbike' | 'ev' : 'car';
  return { ok: true, value: { query, context: { currentLocation: parseCoordinates(context.currentLocation), origin: parsePlaceReference(context.origin), destination: parsePlaceReference(context.destination), now, locale, userId: typeof context.userId === 'string' ? context.userId : undefined, sessionId, vehicle: { type: vehicleType, connectorTypes: Array.isArray(vehicleInput.connectorTypes) ? vehicleInput.connectorTypes.filter((item): item is string => typeof item === 'string').slice(0, 8) : undefined } }, executionMode: 'plan-and-propose' } };
}

function parsePlaceReference(input: unknown): PlaceReference | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const record = input as Record<string, unknown>;
  const label = typeof record.label === 'string' ? record.label.trim() : '';
  const coordinates = parseCoordinates(record.coordinates);
  return label && coordinates ? { id: typeof record.id === 'string' ? record.id : undefined, label, coordinates } : undefined;
}

function parseCoordinates(input: unknown): Coordinates | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const { lat, lon } = input as Record<string, unknown>;
  return typeof lat === 'number' && typeof lon === 'number' && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180 ? { lat, lon } : undefined;
}

function constraint(id: string, field: AgentConstraint['field'], operator: AgentConstraint['operator'], value: AgentConstraint['value'], importance: AgentConstraint['importance'], confidence: number, evidence: string): AgentConstraint { return { id, field, operator, value, importance, confidence, evidence }; }
function planStep(id: string, description: string, dependsOn: string[], successCondition: string, failurePolicy: 'fallback' | 'replan' | 'clarify' | 'stop') { return { id, agent: 'Mobility Executor Agent' as const, description, dependsOn, successCondition, failurePolicy, status: 'pending' as const }; }
function failure(status: number, message: string) { return { ok: false as const, status, message }; }
function snapshot(task: MutableTask): AgentTaskSnapshot { const { startedAtMs: _, listeners: __, ...publicTask } = task; return structuredClone(publicTask); }
function createId(prefix: string): string { return `${prefix}:${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`; }
function uniquePois(places: MobilityPoi[]): MobilityPoi[] { const seen = new Set<string>(); return places.filter((place) => !seen.has(place.id) && Boolean(seen.add(place.id))); }
function uniqueStrings(values: string[]): string[] { return [...new Set(values)]; }
function parseMaxDetourMinutes(query: string): number | undefined { const match = /(\d{1,2})\s*(?:minute|min|minutes|phut|phút)/.exec(query); return match ? Math.min(60, Math.max(1, Number(match[1]))) : undefined; }
function normalize(value: string): string { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
function distanceMeters(a: Coordinates, b: Coordinates): number { const r = 6_371_000; const lat1 = a.lat * Math.PI / 180; const lat2 = b.lat * Math.PI / 180; const dLat = (b.lat - a.lat) * Math.PI / 180; const dLon = (b.lon - a.lon) * Math.PI / 180; const value = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2; return r * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value)); }
function distanceToRouteMeters(point: Coordinates, geometry: Coordinates[]): number { let best = Number.POSITIVE_INFINITY; for (let index = 1; index < geometry.length; index += 1) best = Math.min(best, distanceToSegmentMeters(point, geometry[index - 1], geometry[index])); return best; }
function distanceToSegmentMeters(point: Coordinates, start: Coordinates, end: Coordinates): number { const meanLat = ((start.lat + end.lat + point.lat) / 3) * Math.PI / 180; const sx = 111_320 * Math.cos(meanLat); const sy = 110_540; const [ax, ay, bx, by, px, py] = [start.lon * sx, start.lat * sy, end.lon * sx, end.lat * sy, point.lon * sx, point.lat * sy]; const dx = bx - ax; const dy = by - ay; const t = dx * dx + dy * dy === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))); return Math.hypot(px - (ax + t * dx), py - (ay + t * dy)); }
function sanitizeEvidence(value: string): string { return value.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 800); }
function formatMinutes(seconds: number): string { const minutes = seconds / 60; return `${minutes < 10 ? minutes.toFixed(1) : Math.round(minutes)} min`; }
function formatKm(meters: number): string { return `${(meters / 1_000).toFixed(meters >= 100_000 ? 0 : 1)} km`; }
function roundScore(value: number): number { return Math.round(Math.max(0, Math.min(1, value)) * 1_000) / 1_000; }
function publicPoi(poi: MobilityPoi) { return { id: poi.id, label: poi.label, category: poi.category, address: poi.address, coordinates: poi.coordinates, source: poi.source, confidence: poi.confidence, openingHoursVerified: poi.openingHoursVerified }; }
function publicRoute(route: RouteEvidence) { return { distanceMeters: route.distanceMeters, durationSeconds: route.durationSeconds, source: route.source, confidence: route.confidence }; }
