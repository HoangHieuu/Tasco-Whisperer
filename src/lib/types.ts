export type IntentType =
  | 'Brand Search'
  | 'Category Search'
  | 'Nearby Search'
  | 'POI Search'
  | 'Address Suggestion'
  | 'Location Search'
  | 'Discovery Search'
  | 'Navigation'
  | 'Attribute Search'
  | 'Coordinate Search'
  | 'Ambiguous';

export interface AutocompleteRecord {
  suggestionId: string;
  inputPrefix: string;
  suggestionText: string;
  suggestionType: IntentType;
  score: number;
  queryFrequency: number;
}

export interface PoiRecord {
  poiId: string;
  poiName: string;
  category: string;
  brand: string;
  address: string;
  city: string;
  latitude: number;
  longitude: number;
  rating: number;
  reviewCount: number;
  popularityScore: number;
  tags: string[];
}

export interface AbbreviationRecord {
  abbreviation: string;
  expandedForm: string;
  type: string;
}

export interface PopularQueryRecord {
  queryId: string;
  queryText: string;
  intentType: IntentType;
  monthlyFrequency: number;
  region: string;
}

export interface EvaluationCase {
  caseId: string;
  inputPrefix: string;
  expectedSuggestionType: string;
  expectedTopSuggestions: string[];
  difficulty: 'Easy' | 'Medium' | 'Hard';
  skillsTested: string;
}

export interface TascoDataset {
  autocomplete: AutocompleteRecord[];
  pois: PoiRecord[];
  abbreviations: AbbreviationRecord[];
  popularQueries: PopularQueryRecord[];
  evaluationCases: EvaluationCase[];
}

export interface QueryUnderstanding {
  original: string;
  normalized: string;
  expanded: string;
  expansions: string[];
  tokens: string[];
}

export interface QueryEntity {
  kind:
    | 'brand'
    | 'category'
    | 'poi'
    | 'street'
    | 'city'
    | 'district'
    | 'attribute'
    | 'proximity'
    | 'navigation'
    | 'coordinate'
    | 'address';
  value: string;
  source: 'query' | 'abbreviation' | 'poi-dataset' | 'template' | 'agent' | 'alias-memory';
  confidence: number;
}

export interface ScoreFactors {
  lexical: number;
  intent: number;
  source: number;
  popularity: number;
  poiQuality: number;
  locality: number;
  personalization: number;
  diversity: number;
}

export type RankingWeights = Record<keyof ScoreFactors, number>;

export type EnrichmentSource =
  | 'provided-dataset'
  | 'local-derived'
  | 'local-mock'
  | 'live-upstream'
  | 'reconciled';

export interface FieldProvenance {
  source: EnrichmentSource;
  confidence: number;
  evidence: string[];
  generated: boolean;
  verifiedRealWorld: boolean;
  note?: string;
}

export interface EnrichedAttribute {
  key: string;
  label: string;
  value?: string | number | boolean;
  source: EnrichmentSource;
  confidence: number;
  evidence: string[];
}

export interface FieldReconciliation {
  field: string;
  localValue: unknown;
  liveValue: unknown;
  winner: 'local-fallback' | 'live';
  confidence: number;
  reason: string;
}

export interface PlaceEnrichment {
  fields: Record<string, FieldProvenance>;
  attributes: EnrichedAttribute[];
  reconciliations: FieldReconciliation[];
  summaryEvidence: string[];
}

export interface BehaviorEvent {
  userId: string;
  query: string;
  selectedText: string;
  selectedType: IntentType;
  brand?: string;
  category?: string;
  city?: string;
  occurredAt: string;
}

export interface BehaviorEventRuntime {
  eventsForUser(userId?: string): BehaviorEvent[];
  record(event: BehaviorEvent): { storedCount?: number } | void;
}

export interface SuggestionExplanation {
  summary: string;
  evidence: string[];
  groundedFields: string[];
}

export interface Suggestion {
  id: string;
  text: string;
  normalizedText: string;
  type: IntentType;
  score: number;
  source: 'autocomplete' | 'poi' | 'popular-query' | 'generated' | 'predicted' | 'template' | 'semantic' | 'embedding';
  matched: string[];
  poiId?: string;
  metadata: {
    reason: string;
    city?: string;
    address?: string;
    brand?: string;
    category?: string;
    personalizationReason?: string;
    enrichedAttributes?: EnrichedAttribute[];
    explanation?: SuggestionExplanation;
    factors: ScoreFactors;
  };
}

export type AgenticRewriteProvider =
  | 'disabled'
  | 'local-rewrite-agent'
  | 'hosted-mini'
  | 'local-hermes'
  | 'offline-reasoner';

export type AgenticRewriteSource = 'agent' | 'alias-memory' | 'manual' | 'evaluation';

export interface AgenticRewriteProposal {
  rewrites: string[];
  intent: IntentType;
  entities: QueryEntity[];
  confidence: number;
  evidence: string[];
  provider: AgenticRewriteProvider;
  source: AgenticRewriteSource;
}

export interface AliasMemoryRecord {
  rawQuery: string;
  rewrite: string;
  intent: IntentType;
  entities: QueryEntity[];
  scope: 'user' | 'session' | 'global-candidate';
  source: AgenticRewriteSource;
  acceptedCount: number;
  rejectedCount: number;
  status: 'candidate' | 'approved' | 'rejected';
  lastSeenAt: string;
}

export interface SuggestRequest {
  q: string;
  city?: string;
  userId?: string;
  lat?: number;
  lon?: number;
  limit?: number;
  rankingWeights?: Partial<RankingWeights>;
  behaviorEvents?: BehaviorEvent[];
  agentic?: boolean;
  agenticProvider?: AgenticRewriteProvider;
  aliasMemory?: AliasMemoryRecord[];
}

export interface SuggestResponse {
  query: string;
  normalizedQuery: string;
  expandedQuery: string;
  intent: {
    type: IntentType;
    confidence: number;
  };
  suggestions: Suggestion[];
  latencyMs: number;
  diagnostics: {
    expansions: string[];
    entities: QueryEntity[];
    candidateCount: number;
    agentic: {
      triggered: boolean;
      provider: AgenticRewriteProvider;
      reason: string;
      appliedRewrite?: string;
      source?: AgenticRewriteSource;
      proposal?: AgenticRewriteProposal;
      aliasMemoryHits?: AliasMemoryRecord[];
    };
    embedding?: {
      provider: 'minilm' | 'lexical-fallback';
      model?: string;
      degraded?: boolean;
      reason?: string;
      neighbors: Array<{
        id: string;
        kind: 'autocomplete' | 'poi' | 'popular-query' | 'generated-pattern';
        similarity: number;
        intent?: IntentType;
      }>;
      intentVote?: {
        type: IntentType;
        confidence: number;
      };
    };
    datasetRows: {
      autocomplete: number;
      pois: number;
      abbreviations: number;
      popularQueries: number;
      evaluationCases: number;
    };
  };
}
