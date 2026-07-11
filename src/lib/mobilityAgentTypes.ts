export interface Coordinates {
  lat: number;
  lon: number;
}

export interface PlaceReference {
  id?: string;
  label: string;
  coordinates?: Coordinates;
}

export interface AgentTaskRequest {
  query: string;
  context: {
    currentLocation?: Coordinates;
    origin?: PlaceReference;
    destination?: PlaceReference;
    now: string;
    locale: 'vi-VN' | 'en';
    userId?: string;
    sessionId: string;
    vehicle?: {
      type: 'car' | 'motorbike' | 'ev';
      connectorTypes?: string[];
    };
  };
  executionMode: 'plan-and-propose';
}

export type AgentTaskStatus =
  | 'received'
  | 'understanding'
  | 'planning'
  | 'executing'
  | 'verifying'
  | 'replanning'
  | 'needs_clarification'
  | 'ready_for_confirmation'
  | 'executing_action'
  | 'completed'
  | 'degraded'
  | 'failed'
  | 'cancelled';

export type ConstraintImportance = 'hard' | 'soft' | 'missing';

export interface AgentConstraint {
  id: string;
  field: 'facility' | 'route' | 'openNow' | 'maxDetourMinutes' | 'nearbyAmenity' | 'destination' | 'origin';
  operator: 'equals' | 'required' | 'lte' | 'near';
  value: string | number | boolean;
  importance: ConstraintImportance;
  confidence: number;
  evidence: string;
}

export interface AgentGoal {
  summary: string;
  facility: string;
  destination?: PlaceReference;
  origin?: PlaceReference;
  maxDetourMinutes?: number;
  openNow: boolean;
  nearbyAmenity?: string;
  completionCriteria: string[];
  rationale: string[];
}

export type MobilityAgentName =
  | 'Supervisor Agent'
  | 'Mobility Executor Agent'
  | 'Verifier & Action Agent';

export type MobilityToolName =
  | 'location.resolve'
  | 'place.search'
  | 'place.search_along_route'
  | 'place.nearby'
  | 'poi.details'
  | 'route.calculate'
  | 'route.compare_detours'
  | 'time.check_open_status'
  | 'preferences.read'
  | 'preferences.record_feedback'
  | 'action.propose'
  | 'action.execute';

export interface PlanStep {
  id: string;
  agent: MobilityAgentName;
  tool?: MobilityToolName;
  description: string;
  dependsOn: string[];
  successCondition: string;
  failurePolicy: 'fallback' | 'replan' | 'clarify' | 'stop';
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
}

export interface ExecutionPlan {
  version: number;
  rationale: string;
  steps: PlanStep[];
}

export type EvidenceSource = 'live' | 'local-dataset' | 'synthetic-demo' | 'derived-estimate' | 'unverified';

export interface ToolCallRecord {
  id: string;
  tool: MobilityToolName;
  agent: MobilityAgentName;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  status: 'running' | 'completed' | 'failed';
  source?: EvidenceSource;
  confidence?: number;
  inputSummary: string;
  outputSummary?: string;
  error?: string;
}

export interface AgentModelCallRecord {
  id: string;
  agent: MobilityAgentName;
  model: string;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  status: 'running' | 'completed' | 'failed';
  stepCount?: number;
  finishReason?: string;
  toolNames: string[];
  inputTokens?: number;
  outputTokens?: number;
  error?: string;
}

export interface MobilityPoi {
  id: string;
  label: string;
  category: 'ev-charger' | 'cafe' | 'destination' | 'other';
  address: string;
  coordinates: Coordinates;
  source: EvidenceSource;
  confidence: number;
  openingHours?: string;
  openingHoursVerified: boolean;
  connectorTypes?: string[];
  corridorOffsetMeters?: number;
  accessPenaltySeconds?: number;
  relatedChargerId?: string;
}

export interface RouteEvidence {
  distanceMeters: number;
  durationSeconds: number;
  geometry: Coordinates[];
  source: EvidenceSource;
  confidence: number;
}

export interface ConstraintResult {
  constraintId: string;
  status: 'pass' | 'fail' | 'unverified';
  evidence: string;
}

export interface CandidateBundle {
  id: string;
  primary: MobilityPoi;
  nearbyAmenities: MobilityPoi[];
  detourSeconds: number;
  detourDistanceMeters: number;
  openNow: boolean | null;
  route: RouteEvidence;
  constraintResults: ConstraintResult[];
  score: number;
  rankingEvidence: string[];
  eligible: boolean;
}

export interface VerificationReport {
  decision: 'pass' | 'replan' | 'clarify' | 'no_safe_result';
  passed: string[];
  failed: string[];
  unverifiable: string[];
  rationale: string;
}

export interface ProposedAction {
  id: string;
  type: 'add_stop' | 'replace_destination' | 'save_place' | 'start_navigation';
  label: string;
  payload: {
    place: PlaceReference;
    route?: RouteEvidence;
  };
  confirmationRequired: true;
  status: 'proposed' | 'confirmed' | 'executing' | 'completed' | 'failed' | 'expired';
  expiresAt: string;
  executionMessage?: string;
}

export interface AgentEvent {
  sequence: number;
  timestamp: string;
  kind: 'state' | 'handoff' | 'plan' | 'model_started' | 'model_completed' | 'tool_started' | 'tool_completed' | 'verification' | 'clarification' | 'action' | 'error';
  agent: MobilityAgentName;
  message: string;
  detail?: string;
}

export interface AgentTaskSnapshot {
  id: string;
  status: AgentTaskStatus;
  request: AgentTaskRequest;
  goal?: AgentGoal;
  constraints: AgentConstraint[];
  plan?: ExecutionPlan;
  modelCalls: AgentModelCallRecord[];
  toolCalls: ToolCallRecord[];
  candidates: CandidateBundle[];
  verification?: VerificationReport;
  proposedAction?: ProposedAction;
  clarification?: {
    question: string;
    field: 'origin' | 'destination';
  };
  finalMessage?: string;
  events: AgentEvent[];
  budgets: {
    toolCallsUsed: number;
    toolCallLimit: number;
    replansUsed: number;
    replanLimit: number;
    elapsedMs: number;
    timeLimitMs: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface MobilityDemoData {
  places: MobilityPoi[];
  knownLocations: Array<PlaceReference & { aliases: string[] }>;
}

export interface AgentApiError {
  error: {
    code: string;
    message: string;
    details?: string[];
  };
}
