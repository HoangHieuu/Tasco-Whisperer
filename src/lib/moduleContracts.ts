import type {
  AgenticRewriteProposal,
  EnrichedAttribute,
  FieldProvenance,
  IntentType,
  QueryEntity,
  RankingWeights,
  ScoreFactors,
  Suggestion,
} from './types';

export interface ProviderIdentity {
  name: string;
  version: string;
  license?: string;
  provenance: FieldProvenance;
}

export interface ExternalPoiCorpusProvider {
  readonly identity: ProviderIdentity;
  search(query: ExternalPoiSearchRequest): Promise<ExternalPoiSearchResult[]>;
  getPoi(id: string, options?: ExternalPoiDetailOptions): Promise<ExternalPoiSearchResult | undefined>;
}

export interface ExternalPoiSearchRequest {
  q: string;
  lat?: number;
  lon?: number;
  radiusMeters?: number;
  city?: string;
  category?: string;
  limit: number;
  lang: string;
}

export interface ExternalPoiDetailOptions {
  include?: Array<'hours' | 'reviews' | 'photos' | 'ai_summary' | 'attributes'>;
  lang: string;
}

export interface ExternalPoiSearchResult {
  id: string;
  label: string;
  category?: string;
  address?: string;
  lat?: number;
  lon?: number;
  score?: number;
  attributes?: EnrichedAttribute[];
  fields?: Record<string, FieldProvenance>;
}

export interface RuntimeRankerProvider {
  readonly identity: ProviderIdentity;
  rank(request: RuntimeRankingRequest): Promise<RuntimeRankingResult>;
}

export interface RuntimeRankingRequest {
  query: string;
  intent: IntentType;
  candidates: Suggestion[];
  weights: RankingWeights;
  context?: {
    city?: string;
    lat?: number;
    lon?: number;
    userId?: string;
  };
}

export interface RuntimeRankingResult {
  suggestions: Suggestion[];
  modelName: string;
  modelVersion: string;
  factors?: Record<string, ScoreFactors>;
}

export interface VietnameseNlpRuntime {
  readonly identity: ProviderIdentity;
  analyze(request: VietnameseNlpRequest): Promise<VietnameseNlpAnalysis>;
}

export interface VietnameseNlpRequest {
  text: string;
  lang: 'vi';
  normalizeAccents: boolean;
  segmentWords: boolean;
}

export interface VietnameseNlpAnalysis {
  normalizedText: string;
  segmentedText?: string;
  tokens: string[];
  entities: QueryEntity[];
  confidence: number;
  provenance: FieldProvenance;
}

export interface AgenticRuntimeModule {
  readonly identity: ProviderIdentity;
  proposeRewrite(request: AgenticRuntimeRequest): Promise<AgenticRuntimeResult>;
}

export interface AgenticRuntimeRequest {
  rawQuery: string;
  normalizedQuery: string;
  currentIntent: IntentType;
  currentSuggestions: Suggestion[];
  entities: QueryEntity[];
}

export interface AgenticRuntimeResult {
  proposal?: AgenticRewriteProposal;
  accepted: boolean;
  reason: string;
  provenance: FieldProvenance;
}
