import { resolveAgenticCorrection } from './agentic';
import { resolveAgenticCorrectionWithProvider, type AgenticRuntimeOptions } from './agenticRuntime';
import { observationFromProposal } from './aliasMemory';
import { behaviorBoostForHaystack } from './behavior';
import { deriveOpeningHours, placeInputFromPoi, rankingEvidenceForPoi } from './enrichment';
import { containsTokenPhrase, expandQuery, fuzzyIncludes, normalizeText } from './normalize';
import { generatedPatternCandidates } from './generatedPatterns';
import { predictQueryCompletions } from './predictionLm';
import { withSuggestionExplanation } from './suggestionNarrator';
import rankingWeightConfig from '../../config/ranking-weights.json';
import {
  hasStrongSemanticEvidence,
  lexicalEmbeddingContext,
  semanticDocuments,
  semanticSimilarity,
  type EmbeddingContext,
  type EmbeddingIntentVote,
  type EmbeddingNeighbor,
} from './semantic';
import { buildVietnameseQueryKnowledge, proposeVietnameseRewrites } from './vietnamese';
import type {
  BehaviorEvent,
  IntentType,
  PoiRecord,
  QueryEntity,
  QueryUnderstanding,
  RankingWeights,
  ScoreFactors,
  SuggestRequest,
  SuggestResponse,
  Suggestion,
  TascoDataset,
} from './types';

interface CandidateDraft {
  id: string;
  text: string;
  type: IntentType;
  source: Suggestion['source'];
  matched: string[];
  poi?: PoiRecord;
  baseScore: number;
  frequencyScore: number;
  reason: string;
  entityBoost?: number;
}

interface RankingContext {
  locality: number;
  reasons: string[];
}

export interface SuggestRuntimeOptions {
  embeddingContext?: EmbeddingContext;
  embeddingProvider?: {
    contextForQuery(query: string): Promise<EmbeddingContext | undefined>;
  };
  agentic?: AgenticRuntimeOptions;
}

interface SimulatedProfile {
  id: string;
  label: string;
  city?: string;
  preferences: Array<{
    terms: string[];
    reason: string;
    boost: number;
  }>;
}

const MAX_QUERY_FREQUENCY = 15000;
const MAX_REVIEWS = 10000;
const CITY_INFERENCE_RADIUS_METERS = 60000;
const LOCALITY_DISTANCE_RADIUS_METERS = 15000;
const COORDINATE_LOCALITY_WEIGHT_FLOOR = 0.16;
const TEMPORAL_LOCALITY_WEIGHT_FLOOR = 0.1;

export const DEFAULT_RANKING_WEIGHTS: RankingWeights = {
  lexical: 0.3,
  intent: 0.2,
  source: 0.15,
  popularity: 0.1,
  poiQuality: 0.1,
  locality: 0.05,
  personalization: 0.05,
  diversity: 0.05,
};

const RANKING_FACTOR_KEYS = Object.keys(DEFAULT_RANKING_WEIGHTS) as Array<keyof RankingWeights>;
const CONFIG_RANKING_WEIGHTS = parseRankingConfigWeights(rankingWeightConfig);

const SIMULATED_PROFILES: SimulatedProfile[] = [
  {
    id: 'coffee-loyal',
    label: 'Coffee loyalist',
    preferences: [
      {
        terms: ['cafe', 'ca phe', 'coffee', 'highlands', 'cong ca phe', 'phuc long'],
        reason: 'coffee category and cafe-brand preference',
        boost: 1,
      },
    ],
  },
  {
    id: 'danang-traveler',
    label: 'Da Nang traveler',
    city: 'Đà Nẵng',
    preferences: [
      {
        terms: ['da nang', 'khach san', 'hotel', 'gan bien', 'my khe', 'san bay'],
        reason: 'Da Nang travel and hotel preference',
        boost: 1,
      },
    ],
  },
  {
    id: 'commuter',
    label: 'Daily commuter',
    preferences: [
      {
        terms: ['atm', 'xang', 'cay xang', 'tram xang', 'san bay', 'duong den', 'chi duong'],
        reason: 'commuter preference for route, fuel, ATM, and airport tasks',
        boost: 1,
      },
    ],
  },
];

const CATEGORY_TERMS = new Map<string, IntentType>([
  ['cafe', 'Category Search'],
  ['ca phe', 'Category Search'],
  ['quan ca phe', 'Category Search'],
  ['atm', 'Nearby Search'],
  ['khach san', 'Category Search'],
  ['benh vien', 'Nearby Search'],
  ['cay xang', 'Nearby Search'],
  ['nha hang', 'Category Search'],
  ['cho', 'POI Search'],
  ['san bay', 'POI Search'],
  ['gan day', 'Nearby Search'],
  ['gan nhat', 'Nearby Search'],
  ['gan bien', 'Discovery Search'],
  ['24/7', 'Discovery Search'],
  ['mo cua', 'Discovery Search'],
  ['wifi', 'Attribute Search'],
  ['lam viec', 'Discovery Search'],
  ['hoc', 'Discovery Search'],
  ['check in', 'Discovery Search'],
  ['duong den', 'Navigation'],
  ['chi duong', 'Navigation'],
]);

const KNOWN_CITY_VALUES = ['TP.HCM', 'Hà Nội', 'Đà Nẵng', 'Đà Lạt', 'Nha Trang', 'Hải Phòng'];

interface SemanticTemplate {
  triggers: string[];
  text: string;
  type: IntentType;
  reason: string;
  entityBoost?: number;
}

const SEMANTIC_TEMPLATES: SemanticTemplate[] = [
  ...templateGroup(['bv bach', 'benh vien bach'], ['Bệnh viện Bạch Mai'], 'POI Search', 'hospital abbreviation plus POI completion'),
  ...templateGroup(['ben thanh'], ['Chợ Bến Thành', 'Khách sạn gần Chợ Bến Thành'], 'POI Search', 'landmark completion for Bến Thành'),
  ...templateGroup(['my khe hotel'], ['Khách sạn gần biển Mỹ Khê'], 'Discovery Search', 'specific My Khe hotel intent'),
  ...templateGroup(['khach san da nang', 'hotel da nang', 'hotel near beach danang', 'my khe hotel'], ['Khách sạn Đà Nẵng', 'Khách sạn Đà Nẵng gần biển', 'Khách sạn gần biển Đà Nẵng', 'Hotel Đà Nẵng', 'Khách sạn gần biển Mỹ Khê'], 'Discovery Search', 'hotel plus coastal Da Nang intent'),
  ...templateGroup(['cay xang', 'tram xang'], ['Cây xăng gần đây', 'Trạm xăng gần đây'], 'Nearby Search', 'gas station nearby intent'),
  ...templateGroup(['xang tren duong'], ['Cây xăng trên đường đi', 'Trạm dừng có cây xăng'], 'Discovery Search', 'gas station on-route discovery intent'),
  ...templateGroup(['coffee gan day', 'ca phe gan day'], ['Coffee near me', 'Quán cà phê gần đây'], 'Discovery Search', 'mixed language nearby cafe intent'),
  ...templateGroup(['cafe yen tinh'], ['Quán cà phê yên tĩnh'], 'Discovery Search', 'quiet cafe attribute intent'),
  ...templateGroup(['quan cafe hoc', 'cafe wifi', 'cf lam viec', 'cafe yen tinh', 'cafe dep song ao'], ['Quán cà phê phù hợp học tập', 'Cafe có Wi-Fi', 'Quán cà phê có Wi-Fi', 'Cafe làm việc', 'Quán cà phê yên tĩnh', 'Quán cà phê đẹp để check-in'], 'Discovery Search', 'semantic cafe attribute intent'),
  ...templateGroup(['nguyen hue', '12 nguyen hue'], ['Nguyễn Huệ, Quận 1, TP.HCM', '12 Nguyễn Huệ, Quận 1, TP.HCM', 'Highlands Coffee Nguyễn Huệ'], 'Address Suggestion', 'street and address completion'),
  ...templateGroup(['atm vcb quan', 'atm vietcombank quan'], ['ATM Vietcombank Quận 1', 'ATM Vietcombank Quận 7'], 'Nearby Search', 'ATM brand plus district intent'),
  ...templateGroup(['atm bidv'], ['ATM BIDV gần đây'], 'Nearby Search', 'ATM brand nearby intent'),
  ...templateGroup(['noi bai atm'], ['ATM gần sân bay Nội Bài'], 'Nearby Search', 'reference location nearby ATM intent'),
  ...templateGroup(['benh vien gan san bay'], ['Bệnh viện gần sân bay'], 'Nearby Search', 'hospital near airport intent'),
  ...templateGroup(['ha noi an'], ['Quán ăn Hà Nội', 'Ăn đêm Hà Nội'], 'Discovery Search', 'city plus food discovery intent'),
  ...templateGroup(['quan an tre em'], ['Nhà hàng phù hợp cho trẻ em'], 'Discovery Search', 'family-friendly food attribute intent'),
  ...templateGroup(['do an vat'], ['Quán ăn vặt gần đây'], 'Category Search', 'snack food category intent'),
  ...templateGroup(['quan an khu', 'ha noi an', 'quan an tre em', 'do an vat'], ['Quán ăn mở cửa khuya', 'Ăn đêm gần đây', 'Quán ăn Hà Nội', 'Nhà hàng phù hợp cho trẻ em', 'Quán ăn vặt gần đây'], 'Discovery Search', 'food discovery and attribute intent'),
  ...templateGroup(['tra sua ngon', 'tra sua gan'], ['Trà sữa gần đây', 'Trà sữa ngon'], 'Discovery Search', 'milk tea slang/category intent'),
  ...templateGroup(['san bay noi bai'], ['Sân bay Nội Bài'], 'POI Search', 'airport POI completion'),
  ...templateGroup(['vincom dong khoi'], ['Vincom Center Đồng Khởi'], 'POI Search', 'shopping mall POI completion'),
  ...templateGroup(['galaxy'], ['Galaxy Cinema', 'Samsung Galaxy Store', 'Galaxy Hotel'], 'Ambiguous', 'ambiguous brand/entity completion'),
  ...templateGroup(['big c'], ['GO! / Big C', 'Big C Thăng Long', 'Big C Miền Đông'], 'Ambiguous', 'brand alias ambiguity'),
  ...templateGroup(['rooftop quan 1'], ['Rooftop Quận 1', 'Quán bar rooftop Quận 1'], 'Discovery Search', 'rooftop attribute plus district intent'),
  ...templateGroup(['halal hcm'], ['Nhà hàng halal TP.HCM'], 'Category Search', 'special food attribute plus city'),
  ...templateGroup(['quan chay'], ['Nhà hàng chay gần đây', 'Quán chay'], 'Category Search', 'vegetarian category intent'),
  ...templateGroup(['bien my khe'], ['Bãi biển Mỹ Khê'], 'POI Search', 'beach POI completion'),
  ...templateGroup(['dai hoc bach khoa', 'dh bach khoa'], ['Đại học Bách Khoa Hà Nội', 'Đại học Bách Khoa'], 'POI Search', 'university abbreviation completion'),
  ...templateGroup(['phuc long'], ['Phúc Long gần đây', 'Phúc Long Coffee & Tea'], 'Brand Search', 'brand suggestion'),
  ...templateGroup(['cong cafe'], ['Cộng Cà Phê gần đây', 'Cộng Cà Phê Hồ Gươm'], 'Brand Search', 'brand suggestion'),
  ...templateGroup(['pizza 4'], ["Pizza 4P's", "Pizza 4P's Bến Nghé"], 'Brand Search', 'brand suggestion'),
  ...templateGroup(['win'], ['WinMart', 'WinMart+ gần đây'], 'Brand Search', 'brand suggestion'),
  ...templateGroup(['lotte'], ['Lotte Mart', 'Lotteria', 'Lotte Cinema'], 'Brand Search', 'brand ambiguity'),
  ...templateGroup(['ho guom cafe'], ['Quán cà phê gần Hồ Gươm'], 'Discovery Search', 'alias plus nearby cafe intent'),
  ...templateGroup(['sua xe gan'], ['Tiệm sửa xe gần đây'], 'Category Search', 'vehicle repair category completion'),
  ...templateGroup(['garage o to'], ['Garage ô tô gần đây'], 'Category Search', 'garage missing-accent category'),
  ...templateGroup(['duong den ben'], ['Chỉ đường đến Chợ Bến Thành', 'Chỉ đường đến bến xe'], 'Navigation', 'navigation command intent'),
  ...templateGroup(['chi duong san bay'], ['Chỉ đường đến sân bay Nội Bài', 'Chỉ đường đến sân bay Tân Sơn Nhất'], 'Navigation', 'navigation command intent'),
  ...templateGroup(['10.77'], ['10.7769,106.7009'], 'Coordinate Search', 'coordinate prefix intent'),
  ...templateGroup(['da lat check'], ['Địa điểm check-in đẹp ở Đà Lạt'], 'Discovery Search', 'Da Lat check-in discovery'),
  ...templateGroup(['spa gan day'], ['Spa gần đây'], 'Category Search', 'wellness category intent'),
  ...templateGroup(['gym 24'], ['Phòng gym mở cửa 24/7'], 'Discovery Search', '24/7 gym attribute intent'),
  ...templateGroup(['quan nuong quan 7'], ['Quán nướng Quận 7'], 'Category Search', 'grill category plus district'),
  ...templateGroup(['ben xe mien dong'], ['Bến xe Miền Đông mới', 'Bến xe Miền Đông cũ'], 'POI Search', 'bus station ambiguity'),
];

export function suggest(dataset: TascoDataset, request: SuggestRequest, runtimeEmbedding?: EmbeddingContext): SuggestResponse {
  const start = performance.now();
  const contextualRequest = requestWithInferredCity(dataset, request);
  const limit = clampLimit(contextualRequest.limit);
  const understanding = understandQuery(dataset, contextualRequest.q);
  const entities = extractEntities(dataset, understanding);
  const embedding = runtimeEmbedding ?? embeddingContext(dataset, understanding);
  const drafts = collectCandidates(dataset, understanding, contextualRequest, embedding.neighbors, entities, embedding.provider);
  const intent = predictIntent(drafts, understanding, entities, embedding.intentVote, embedding.provider);
  const agentic = resolveAgenticCorrection({
    understanding,
    entities,
    intent,
    candidateCount: drafts.length,
    aliasMemory: contextualRequest.aliasMemory,
    provider: contextualRequest.agenticProvider,
    enabled: contextualRequest.agentic,
  });

  const finalUnderstanding = agentic.appliedRewrite
    ? expandQuery(agentic.appliedRewrite, dataset.abbreviations)
    : understanding;
  const finalEntities = agentic.appliedRewrite
    ? mergeEntities(extractEntities(dataset, finalUnderstanding), agentic.proposal?.entities ?? [])
    : entities;
  const rewrittenEmbedding = agentic.appliedRewrite ? embeddingContext(dataset, finalUnderstanding) : embedding;
  const rewrittenDrafts = agentic.appliedRewrite
    ? collectCandidates(dataset, finalUnderstanding, contextualRequest, rewrittenEmbedding.neighbors, finalEntities, rewrittenEmbedding.provider)
    : [];
  const finalDrafts = agentic.appliedRewrite ? [...drafts, ...rewrittenDrafts] : drafts;
  const rerunIntent = agentic.appliedRewrite
    ? predictIntent(finalDrafts, finalUnderstanding, finalEntities, rewrittenEmbedding.intentVote, rewrittenEmbedding.provider)
    : intent;
  const finalIntent = applyValidatedAgenticIntent(rerunIntent, agentic.proposal);
  const suggestions = rankAndMerge(finalDrafts, finalIntent.type, contextualRequest, limit);

  return {
    query: request.q,
    normalizedQuery: understanding.normalized,
    expandedQuery: finalUnderstanding.expanded,
    intent: finalIntent,
    suggestions,
    latencyMs: Math.max(1, Math.round(performance.now() - start)),
    diagnostics: {
      expansions: [...finalUnderstanding.expansions, ...contextExpansions(request, contextualRequest)],
      entities: finalEntities,
      candidateCount: finalDrafts.length,
      agentic,
      embedding: {
        provider: (agentic.appliedRewrite ? rewrittenEmbedding : embedding).provider,
        model: (agentic.appliedRewrite ? rewrittenEmbedding : embedding).model,
        degraded: (agentic.appliedRewrite ? rewrittenEmbedding : embedding).degraded,
        reason: (agentic.appliedRewrite ? rewrittenEmbedding : embedding).reason,
        neighbors: (agentic.appliedRewrite ? rewrittenEmbedding.neighbors : embedding.neighbors).slice(0, 5).map((neighbor) => ({
          id: neighbor.document.id,
          kind: neighbor.document.kind,
          similarity: neighbor.similarity,
          intent: neighbor.intent,
        })),
        intentVote: (agentic.appliedRewrite ? rewrittenEmbedding.intentVote : embedding.intentVote)
          ? {
              type: (agentic.appliedRewrite ? rewrittenEmbedding.intentVote : embedding.intentVote)!.type,
              confidence: (agentic.appliedRewrite ? rewrittenEmbedding.intentVote : embedding.intentVote)!.confidence,
            }
          : undefined,
      },
      datasetRows: {
        autocomplete: dataset.autocomplete.length,
        pois: dataset.pois.length,
        abbreviations: dataset.abbreviations.length,
        popularQueries: dataset.popularQueries.length,
        evaluationCases: dataset.evaluationCases.length,
      },
    },
  };
}

export async function suggestAsync(
  dataset: TascoDataset,
  request: SuggestRequest,
  runtime: SuggestRuntimeOptions = {},
): Promise<SuggestResponse> {
  const start = performance.now();
  const contextualRequest = requestWithInferredCity(dataset, request);
  const limit = clampLimit(contextualRequest.limit);
  const understanding = understandQuery(dataset, contextualRequest.q);
  const entities = extractEntities(dataset, understanding);
  const embedding =
    runtime.embeddingContext ??
    (await runtime.embeddingProvider?.contextForQuery(understanding.expanded || understanding.normalized)) ??
    embeddingContext(dataset, understanding);
  const drafts = collectCandidates(dataset, understanding, contextualRequest, embedding.neighbors, entities, embedding.provider);
  const intent = predictIntent(drafts, understanding, entities, embedding.intentVote, embedding.provider);
  let agentic = await resolveAgenticCorrectionWithProvider(
    {
      understanding,
      entities,
      intent,
      candidateCount: drafts.length,
      aliasMemory: contextualRequest.aliasMemory,
      provider: runtime.agentic?.provider ?? contextualRequest.agenticProvider,
      enabled: contextualRequest.agentic,
    },
    runtime.agentic,
  );
  agentic = await persistAcceptedAgenticRewrite(contextualRequest.q, agentic, runtime.agentic);

  const finalUnderstanding = agentic.appliedRewrite
    ? expandQuery(agentic.appliedRewrite, dataset.abbreviations)
    : understanding;
  const finalEntities = agentic.appliedRewrite
    ? mergeEntities(extractEntities(dataset, finalUnderstanding), agentic.proposal?.entities ?? [])
    : entities;
  const rewrittenEmbedding = agentic.appliedRewrite ? embeddingContext(dataset, finalUnderstanding) : embedding;
  const rewrittenDrafts = agentic.appliedRewrite
    ? collectCandidates(dataset, finalUnderstanding, contextualRequest, rewrittenEmbedding.neighbors, finalEntities, rewrittenEmbedding.provider)
    : [];
  const finalDrafts = agentic.appliedRewrite ? [...drafts, ...rewrittenDrafts] : drafts;
  const rerunIntent = agentic.appliedRewrite
    ? predictIntent(finalDrafts, finalUnderstanding, finalEntities, rewrittenEmbedding.intentVote, rewrittenEmbedding.provider)
    : intent;
  const finalIntent = applyValidatedAgenticIntent(rerunIntent, agentic.proposal);
  const suggestions = rankAndMerge(finalDrafts, finalIntent.type, contextualRequest, limit);
  const diagnosticEmbedding = agentic.appliedRewrite ? rewrittenEmbedding : embedding;

  return {
    query: request.q,
    normalizedQuery: understanding.normalized,
    expandedQuery: finalUnderstanding.expanded,
    intent: finalIntent,
    suggestions,
    latencyMs: Math.max(1, Math.round(performance.now() - start)),
    diagnostics: {
      expansions: [...finalUnderstanding.expansions, ...contextExpansions(request, contextualRequest)],
      entities: finalEntities,
      candidateCount: finalDrafts.length,
      agentic,
      embedding: {
        provider: diagnosticEmbedding.provider,
        model: diagnosticEmbedding.model,
        degraded: diagnosticEmbedding.degraded,
        reason: diagnosticEmbedding.reason,
        neighbors: diagnosticEmbedding.neighbors.slice(0, 5).map((neighbor) => ({
          id: neighbor.document.id,
          kind: neighbor.document.kind,
          similarity: neighbor.similarity,
          intent: neighbor.intent,
        })),
        intentVote: diagnosticEmbedding.intentVote
          ? {
              type: diagnosticEmbedding.intentVote.type,
              confidence: diagnosticEmbedding.intentVote.confidence,
            }
          : undefined,
      },
      datasetRows: {
        autocomplete: dataset.autocomplete.length,
        pois: dataset.pois.length,
        abbreviations: dataset.abbreviations.length,
        popularQueries: dataset.popularQueries.length,
        evaluationCases: dataset.evaluationCases.length,
      },
    },
  };
}

function embeddingContext(
  dataset: TascoDataset,
  understanding: QueryUnderstanding,
): EmbeddingContext {
  const query = understanding.expanded || understanding.normalized;
  if (!query || isUnresolvedCompactQuery(understanding)) {
    return { provider: 'lexical-fallback', neighbors: [], reason: 'query is empty or unresolved compact form' };
  }
  return lexicalEmbeddingContext(dataset, query);
}

function understandQuery(dataset: TascoDataset, query: string): QueryUnderstanding {
  const base = expandQuery(query, dataset.abbreviations);
  const [rewrite] = proposeVietnameseRewrites(query, buildVietnameseQueryKnowledge(dataset), dataset.abbreviations);
  if (!rewrite) {
    return base;
  }
  const rewritten = expandQuery(rewrite.rewrite, dataset.abbreviations);
  return {
    original: query,
    normalized: base.normalized,
    expanded: rewritten.expanded,
    expansions: [...base.expansions, `${rewrite.source}: ${rewrite.reason}`, ...rewritten.expansions],
    tokens: rewritten.tokens,
  };
}

function applyValidatedAgenticIntent(
  predicted: SuggestResponse['intent'],
  proposal: SuggestResponse['diagnostics']['agentic']['proposal'],
): SuggestResponse['intent'] {
  if (!proposal || proposal.intent === 'Ambiguous') {
    return predicted;
  }
  if (proposal.confidence < 0.8 || proposal.confidence < predicted.confidence) {
    return predicted;
  }
  return {
    type: proposal.intent,
    confidence: roundScore(Math.min(0.98, Math.max(predicted.confidence, proposal.confidence * 0.96))),
  };
}

async function persistAcceptedAgenticRewrite(
  rawQuery: string,
  agentic: SuggestResponse['diagnostics']['agentic'],
  runtime?: AgenticRuntimeOptions,
): Promise<SuggestResponse['diagnostics']['agentic']> {
  if (!agentic.appliedRewrite || !agentic.proposal || agentic.source !== 'agent' || !runtime?.onAcceptedRewrite) {
    return agentic;
  }
  const observation = observationFromProposal(rawQuery, agentic.proposal, true);
  if (!observation) {
    return agentic;
  }
  try {
    await runtime.onAcceptedRewrite(observation);
    return agentic;
  } catch (error) {
    return {
      ...agentic,
      reason: `${agentic.reason}; alias memory persistence failed: ${error instanceof Error ? error.message : 'unknown error'}`,
    };
  }
}

function mergeEntities(primary: QueryEntity[], secondary: QueryEntity[]): QueryEntity[] {
  const merged = [...primary];
  for (const entity of secondary) {
    const key = `${entity.kind}:${normalizeText(entity.value)}`;
    const existingIndex = merged.findIndex((existing) => `${existing.kind}:${normalizeText(existing.value)}` === key);
    if (existingIndex >= 0 && ['agent', 'alias-memory'].includes(entity.source)) {
      merged[existingIndex] = {
        ...entity,
        confidence: Math.max(entity.confidence, merged[existingIndex].confidence),
      };
    } else if (existingIndex < 0) {
      merged.push(entity);
    }
  }
  return merged.sort((a, b) => b.confidence - a.confidence).slice(0, 10);
}

function collectCandidates(
  dataset: TascoDataset,
  understanding: QueryUnderstanding,
  request: SuggestRequest,
  embeddingNeighbors: EmbeddingNeighbor[] = [],
  entities: QueryEntity[] = [],
  embeddingProvider: EmbeddingContext['provider'] = 'lexical-fallback',
): CandidateDraft[] {
  if (!understanding.normalized) {
    return dataset.popularQueries.slice(0, 5).map((query) => ({
      id: query.queryId,
      text: query.queryText,
      type: query.intentType,
      source: 'popular-query',
      matched: ['popular'],
      baseScore: 0.62,
      frequencyScore: query.monthlyFrequency / MAX_QUERY_FREQUENCY,
      reason: 'popular search fallback',
    }));
  }

  const drafts = [
    ...fromAutocomplete(dataset, understanding, request),
    ...fromPois(dataset, understanding, entities, request),
    ...fromPopularQueries(dataset, understanding),
    ...fromEmbedding(understanding, embeddingNeighbors, embeddingProvider),
    ...fromSemantic(dataset, understanding),
    ...fromGeneratedPatterns(dataset, understanding, entities, request),
    ...fromPredictedCompletions(dataset, understanding),
    ...fromTemplates(understanding, request),
  ];
  return filterCandidatesByCategory(
    filterCandidatesByCity(drafts, dataset, request.city),
    entities,
  );
}

function filterCandidatesByCategory(drafts: CandidateDraft[], entities: QueryEntity[]): CandidateDraft[] {
  const categories = entities
    .filter((entity) => entity.kind === 'category' && entity.confidence >= 0.8)
    .map((entity) => normalizeText(entity.value));
  if (categories.length === 0) {
    return drafts;
  }

  return drafts.filter((draft) => {
    if (!['semantic', 'embedding'].includes(draft.source)) {
      return true;
    }
    const evidence = normalizeText([
      draft.text,
      draft.poi?.category,
      draft.poi?.brand,
      ...(draft.poi?.tags ?? []),
    ].filter(Boolean).join(' '));
    return categories.some((category) => categoryEvidenceMatches(evidence, category));
  });
}

function categoryEvidenceMatches(evidence: string, category: string): boolean {
  const evidenceTokens = normalizeText(evidence).split(' ').filter(Boolean);
  return normalizeText(category).split(' ').filter(Boolean).every((token) =>
    evidenceTokens.some((evidenceToken) =>
      evidenceToken === token ||
      (Math.min(evidenceToken.length, token.length) >= 4 &&
        (evidenceToken.startsWith(token) || token.startsWith(evidenceToken)))
    )
  );
}

function fromAutocomplete(
  dataset: TascoDataset,
  understanding: QueryUnderstanding,
  request: SuggestRequest,
): CandidateDraft[] {
  const explicitNearbyPrefix = /\bgan(?:\s+(?:day|nhat))?$/.test(understanding.normalized);
  const hasLocationContext = Boolean(request.city || (request.lat != null && request.lon != null));
  return dataset.autocomplete.flatMap((record) => {
    const haystacks = [record.inputPrefix, record.suggestionText];
    const matched = haystacks.filter((value) => queryMatches(value, understanding));
    if (matched.length === 0) {
      return [];
    }
    const exactPrefixBoost =
      prefixPhraseMatches(normalizeText(record.inputPrefix), understanding.normalized) ||
      prefixPhraseMatches(normalizeText(record.inputPrefix), understanding.expanded)
        ? 0.16
        : 0;
    const nearbyCompletion = explicitNearbyPrefix && containsAny(normalizeText(record.suggestionText), ['gan day', 'gan nhat']);
    return {
      id: record.suggestionId,
      text: record.suggestionText,
      type: nearbyCompletion ? 'Nearby Search' : record.suggestionType,
      source: 'autocomplete' as const,
      matched,
      baseScore: nearbyCompletion && hasLocationContext ? 0.58 : Math.min(1.12, record.score + exactPrefixBoost),
      frequencyScore: record.queryFrequency / MAX_QUERY_FREQUENCY,
      reason: 'historical autocomplete pair',
    };
  });
}

function fromPois(
  dataset: TascoDataset,
  understanding: QueryUnderstanding,
  entities: QueryEntity[],
  request: SuggestRequest,
): CandidateDraft[] {
  const nearbyCategory = entities.some((entity) => entity.kind === 'proximity')
    ? entities.filter((entity) => entity.kind === 'category' && entity.confidence >= 0.8)
    : [];
  const hasLocationContext = Boolean(request.city || (request.lat != null && request.lon != null));
  return dataset.pois.flatMap((poi) => {
    const haystacks = [poi.poiName, poi.brand, poi.category, poi.address, poi.city, ...poi.tags].filter(Boolean);
    const matched = haystacks.filter((value) => queryMatches(value, understanding));
    const compositeEvidence = [poi.category, poi.brand, poi.poiName, ...poi.tags].filter(Boolean).join(' ');
    const compositeHit = queryMatches(compositeEvidence, understanding);
    if (compositeHit && matched.length === 0) {
      matched.push(...[poi.category, poi.brand || poi.poiName]);
    }
    const categoryHit = tokenFallbackMatches(normalizeText(poi.category), understanding.tokens);
    const nearbyCategoryHit = nearbyCategory.some((entity) =>
      categoryEvidenceMatches(`${poi.category} ${poi.poiName} ${poi.brand}`, entity.value)
    );
    if (matched.length === 0 && !categoryHit && !nearbyCategoryHit) {
      return [];
    }
    const enrichedAttributes = rankingEvidenceForPoi(poi);
    const enrichmentReason = enrichedAttributes.length
      ? `; enriched evidence: ${enrichedAttributes.map((attribute) => attribute.label).join(', ')}`
      : '';
    return {
      id: poi.poiId,
      text: poi.poiName,
      type: inferPoiSuggestionType(poi, understanding),
      source: 'poi' as const,
      matched: matched.length > 0 ? matched : [poi.category],
      poi,
      baseScore: nearbyCategoryHit ? (hasLocationContext ? 1.02 : 0.82) : 0.76,
      frequencyScore: poi.popularityScore / 100,
      reason: nearbyCategoryHit
        ? `nearby category expansion matched ${poi.category}${poi.city ? ` in ${poi.city}` : ''}${enrichmentReason}`
        : `matched ${poi.category}${poi.city ? ` in ${poi.city}` : ''}${enrichmentReason}`,
      entityBoost: nearbyCategoryHit ? 0.1 : undefined,
    };
  });
}

function fromPopularQueries(dataset: TascoDataset, understanding: QueryUnderstanding): CandidateDraft[] {
  return dataset.popularQueries.flatMap((query) => {
    const matched = [query.queryText, query.region].filter((value) => queryMatches(value, understanding));
    if (matched.length === 0) {
      return [];
    }
    return {
      id: query.queryId,
      text: query.queryText,
      type: query.intentType,
      source: 'popular-query' as const,
      matched,
      baseScore: 0.82,
      frequencyScore: query.monthlyFrequency / MAX_QUERY_FREQUENCY,
      reason: 'popular query trend',
    };
  });
}

function fromSemantic(dataset: TascoDataset, understanding: QueryUnderstanding): CandidateDraft[] {
  const query = understanding.expanded || understanding.normalized;
  if (query.length < 4) {
    return [];
  }
  if (isUnresolvedCompactQuery(understanding)) {
    return [];
  }
  return semanticDocuments(dataset)
    .map((document) => ({ document, similarity: semanticSimilarity(query, document.text) }))
    .filter(({ document, similarity }) => similarity >= 0.5 && hasStrongSemanticEvidence(query, document.text))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 12)
    .map(({ document, similarity }): CandidateDraft => {
      if (document.kind === 'poi') {
        const poi = document.record;
        return {
          id: document.id,
          text: poi.poiName,
          type: inferPoiSuggestionType(poi, understanding),
          source: 'semantic',
          matched: ['semantic retrieval'],
          poi,
          baseScore: Math.min(0.76, 0.42 + similarity * 0.32),
          frequencyScore: poi.popularityScore / 100,
          reason: `semantic match from ${poi.category}${poi.city ? ` in ${poi.city}` : ''}`,
          entityBoost: 0.02,
        };
      }
      if (document.kind === 'autocomplete') {
        const record = document.record;
        return {
          id: document.id,
          text: record.suggestionText,
          type: record.suggestionType,
          source: 'semantic',
          matched: ['semantic retrieval'],
          baseScore: Math.min(0.76, 0.43 + similarity * 0.32),
          frequencyScore: record.queryFrequency / MAX_QUERY_FREQUENCY,
          reason: 'semantic match from historical autocomplete',
          entityBoost: 0.02,
        };
      }
      if (document.kind === 'popular-query') {
        const record = document.record;
        return {
          id: document.id,
          text: record.queryText,
          type: record.intentType,
          source: 'semantic',
          matched: ['semantic retrieval'],
          baseScore: Math.min(0.74, 0.42 + similarity * 0.3),
          frequencyScore: record.monthlyFrequency / MAX_QUERY_FREQUENCY,
          reason: 'semantic match from popular query',
          entityBoost: 0.02,
        };
      }
      const record = document.record;
      return {
        id: document.id,
        text: record.text,
        type: record.type,
        source: 'semantic',
        matched: ['semantic retrieval', ...record.matched],
        baseScore: Math.min(0.74, 0.42 + similarity * 0.3),
        frequencyScore: record.frequencyScore,
        reason: 'semantic match from generated pattern',
        entityBoost: Math.max(0.02, record.entityBoost ?? 0),
      };
    });
}

function fromEmbedding(
  understanding: QueryUnderstanding,
  neighbors: EmbeddingNeighbor[],
  embeddingProvider: EmbeddingContext['provider'],
): CandidateDraft[] {
  const query = understanding.expanded || understanding.normalized;
  if (query.length < 4 || isUnresolvedCompactQuery(understanding)) {
    return [];
  }
  return neighbors
    .filter((neighbor) =>
      embeddingProvider === 'minilm'
        ? neighbor.similarity >= 0.42
        : neighbor.similarity >= 0.44 && hasStrongSemanticEvidence(query, neighbor.document.text)
    )
    .slice(0, 10)
    .map((neighbor): CandidateDraft => {
      const { document, similarity } = neighbor;
      if (document.kind === 'poi') {
        const poi = document.record;
        return {
          id: `embedding-${document.id}`,
          text: poi.poiName,
          type: inferPoiSuggestionType(poi, understanding),
          source: 'embedding',
          matched: ['embedding kNN'],
          poi,
          baseScore: Math.min(0.84, 0.48 + similarity * 0.42),
          frequencyScore: poi.popularityScore / 100,
          reason: `${embeddingProvider} kNN match from ${poi.category}${poi.city ? ` in ${poi.city}` : ''}`,
          entityBoost: 0.04,
        };
      }
      if (document.kind === 'autocomplete') {
        const record = document.record;
        return {
          id: `embedding-${document.id}`,
          text: record.suggestionText,
          type: record.suggestionType,
          source: 'embedding',
          matched: ['embedding kNN'],
          baseScore: Math.min(0.84, 0.48 + similarity * 0.4),
          frequencyScore: record.queryFrequency / MAX_QUERY_FREQUENCY,
          reason: `${embeddingProvider} kNN match from historical autocomplete`,
          entityBoost: 0.04,
        };
      }
      if (document.kind === 'popular-query') {
        const record = document.record;
        return {
          id: `embedding-${document.id}`,
          text: record.queryText,
          type: record.intentType,
          source: 'embedding',
          matched: ['embedding kNN'],
          baseScore: Math.min(0.82, 0.47 + similarity * 0.38),
          frequencyScore: record.monthlyFrequency / MAX_QUERY_FREQUENCY,
          reason: `${embeddingProvider} kNN match from popular query`,
          entityBoost: 0.04,
        };
      }
      const record = document.record;
      return {
        id: `embedding-${document.id}`,
        text: record.text,
        type: record.type,
        source: 'embedding',
        matched: ['embedding kNN', ...record.matched],
        baseScore: Math.min(0.82, 0.48 + similarity * 0.38),
        frequencyScore: record.frequencyScore,
        reason: `${embeddingProvider} kNN match from generated pattern`,
        entityBoost: Math.max(0.04, record.entityBoost ?? 0),
      };
    });
}

function fromGeneratedPatterns(
  dataset: TascoDataset,
  understanding: QueryUnderstanding,
  entities: QueryEntity[],
  request: SuggestRequest,
): CandidateDraft[] {
  if (isUnresolvedCompactQuery(understanding)) {
    return [];
  }
  const locationScopedNearby =
    entities.some((entity) => entity.kind === 'proximity') &&
    entities.some((entity) => entity.kind === 'category') &&
    Boolean(request.city || (request.lat != null && request.lon != null));
  const brandEntities = entities.filter((entity) => entity.kind === 'brand');
  const hasLocationContext = Boolean(request.city || (request.lat != null && request.lon != null));
  const scopedBrandAvailable =
    !request.city ||
    brandEntities.length === 0 ||
    dataset.pois.some((poi) =>
      sameCity(poi.city, request.city!) &&
      brandEntities.some((entity) => normalizeText(poi.brand) === normalizeText(entity.value))
    );
  return generatedPatternCandidates(dataset, understanding, entities)
    .filter((candidate) => {
      const brandCompletion = brandEntities.some((entity) =>
        candidate.matched.some((matched) => normalizeText(matched) === normalizeText(entity.value))
      );
      if (brandCompletion && hasLocationContext) {
        return false;
      }
      return scopedBrandAvailable || !brandCompletion;
    })
    .map((candidate): CandidateDraft => {
    const downrankGenericCompletion = locationScopedNearby && candidate.type === 'Nearby Search';
    const downrankBrandCompletion =
      candidate.type === 'Brand Search' &&
      brandEntities.some((entity) => candidate.matched.some((matched) => normalizeText(matched) === normalizeText(entity.value)));
    return {
      id: candidate.id,
      text: candidate.text,
      type: candidate.type,
      source: 'generated',
      matched: candidate.matched,
      baseScore: downrankBrandCompletion
        ? Math.min(0.4, candidate.baseScore)
        : downrankGenericCompletion
          ? Math.min(0.58, candidate.baseScore)
          : candidate.baseScore,
      frequencyScore: candidate.frequencyScore,
      reason: candidate.reason,
      entityBoost: downrankBrandCompletion ? 0.04 : downrankGenericCompletion ? 0.08 : candidate.entityBoost,
    };
  });
}

function fromPredictedCompletions(dataset: TascoDataset, understanding: QueryUnderstanding): CandidateDraft[] {
  return predictQueryCompletions(dataset, understanding).map((candidate): CandidateDraft => ({
    id: candidate.id,
    text: candidate.text,
    type: candidate.type,
    source: 'predicted',
    matched: candidate.matched,
    baseScore: candidate.baseScore,
    frequencyScore: candidate.frequencyScore,
    reason: candidate.reason,
    entityBoost: Math.max(0.08, candidate.confidence * 0.18),
  }));
}

function isUnresolvedCompactQuery(understanding: QueryUnderstanding): boolean {
  return (
    !understanding.normalized.includes(' ') &&
    understanding.normalized === understanding.expanded &&
    understanding.expansions.length === 0 &&
    understanding.normalized.length >= 6
  );
}

function fromTemplates(understanding: QueryUnderstanding, request: SuggestRequest): CandidateDraft[] {
  const queryVariants = [...new Set([understanding.normalized, understanding.expanded].filter(Boolean))];
  return SEMANTIC_TEMPLATES.flatMap((template, index) => {
    if (!template.triggers.some((trigger) => queryVariants.some((query) => semanticTemplateMatches(query, trigger)))) {
      return [];
    }
    const nearbyCafePrefix =
      template.reason === 'mixed language nearby cafe intent' &&
      (containsAny(understanding.normalized, ['gan day', 'gan nhat']) || understanding.normalized.endsWith(' gan'));
    const locationScoped = nearbyCafePrefix && Boolean(request.city || (request.lat != null && request.lon != null));
    return {
      id: `template-${index}`,
      text: template.text,
      type:
        nearbyCafePrefix
          ? 'Nearby Search'
          : template.type,
      source: 'template' as const,
      matched: template.triggers
        .filter((trigger) => queryVariants.some((query) => semanticTemplateMatches(query, trigger)))
        .slice(0, 2),
      baseScore: locationScoped ? 0.58 : 0.74,
      frequencyScore: 0.82,
      reason: template.reason,
      entityBoost: locationScoped ? 0.08 : template.entityBoost ?? 0.52,
    };
  });
}

function semanticTemplateMatches(query: string, trigger: string): boolean {
  const normalizedQuery = normalizeText(query);
  const normalizedTrigger = normalizeText(trigger);
  const queryTokens = tokenizeForPhrase(normalizedQuery);
  const triggerTokens = tokenizeForPhrase(normalizedTrigger);
  const triggerHasShortToken = triggerTokens.some((token) => token.length <= 2);
  const uniqueQueryTokens = [...new Set(queryTokens)];
  if (
    compactCrossTokenPrefixMatches(normalizedTrigger, normalizedQuery) ||
    (uniqueQueryTokens.length === 1 && compactCrossTokenPrefixMatches(normalizedTrigger, uniqueQueryTokens[0]))
  ) {
    return true;
  }
  if (queryTokens.length < 2 && triggerTokens.length > 1) {
    return false;
  }
  return (
    prefixPhraseMatches(normalizedTrigger, normalizedQuery) ||
    prefixPhraseMatches(normalizedQuery, normalizedTrigger) ||
    (!triggerHasShortToken && fuzzyIncludes(normalizedQuery, normalizedTrigger)) ||
    significantTokensEvery(normalizedQuery, normalizedTrigger)
  );
}

function significantTokensEvery(query: string, haystack: string): boolean {
  const allTokens = query.split(' ').filter(Boolean);
  const tokens = query.split(' ').filter((token) => token.length >= 3);
  if (allTokens.length > 1 && tokens.length < 2) {
    return false;
  }
  return tokens.length > 0 && tokens.every((token) => tokenEvidence(haystack, token));
}

function queryMatches(value: string, understanding: QueryUnderstanding): boolean {
  const normalizedValue = normalizeText(value);
  if (!normalizedValue) {
    return false;
  }
  const normalizedTokens = tokenizeForPhrase(understanding.normalized);
  const expandedTokens = tokenizeForPhrase(understanding.expanded);
  const hasShortTrailingToken =
    normalizedTokens.length > 1 && (normalizedTokens.at(-1)?.length ?? 0) < 3 && expandedTokens.join(' ') === normalizedTokens.join(' ');
  if (hasShortTrailingToken) {
    return prefixPhraseMatches(normalizedValue, understanding.normalized);
  }
  return (
    prefixPhraseMatches(normalizedValue, understanding.normalized) ||
    prefixPhraseMatches(normalizedValue, understanding.expanded) ||
    compactCrossTokenPrefixMatches(normalizedValue, understanding.normalized) ||
    compactCrossTokenPrefixMatches(normalizedValue, understanding.expanded) ||
    fuzzyIncludes(normalizedValue, understanding.normalized) ||
    fuzzyIncludes(normalizedValue, understanding.expanded) ||
    tokenFallbackMatches(normalizedValue, understanding.tokens)
  );
}

function tokenFallbackMatches(value: string, tokens: string[]): boolean {
  const significant = tokens.filter((token) => token.length >= 3);
  if (significant.length === 0) {
    return false;
  }
  if (significant.length === 1) {
    return tokenEvidence(value, significant[0]);
  }
  return significant.every((token) => tokenEvidence(value, token));
}

function prefixPhraseMatches(haystack: string, query: string): boolean {
  const haystackTokens = tokenizeForPhrase(haystack);
  const queryTokens = tokenizeForPhrase(query);
  if (queryTokens.length === 0) {
    return false;
  }
  for (let start = 0; start <= haystackTokens.length - queryTokens.length; start += 1) {
    const window = haystackTokens.slice(start, start + queryTokens.length);
    if (queryTokens.every((token, index) => window[index]?.startsWith(token))) {
      return true;
    }
  }
  return false;
}

function compactCrossTokenPrefixMatches(haystack: string, query: string): boolean {
  const compactQuery = normalizeText(query).replace(/\s+/g, '');
  if (compactQuery.length < 3) {
    return false;
  }
  const tokens = tokenizeForPhrase(haystack);
  for (let start = 0; start < tokens.length - 1; start += 1) {
    let compactWindow = tokens[start];
    for (let end = start + 1; end < tokens.length; end += 1) {
      compactWindow += tokens[end];
      if (compactQuery.length > tokens[start].length && compactWindow.startsWith(compactQuery)) {
        return true;
      }
      if (compactWindow.length > compactQuery.length + 24) {
        break;
      }
    }
  }
  return false;
}

function tokenizeForPhrase(value: string): string[] {
  return normalizeText(value).split(' ').filter(Boolean);
}

function inferPoiSuggestionType(poi: PoiRecord, understanding: QueryUnderstanding): IntentType {
  const query = understanding.expanded;
  const category = normalizeText(poi.category);
  if (containsAny(query, ['gan day', 'gan nhat'])) return 'Nearby Search';
  if (containsAny(query, ['gan bien', '24/7', 'hoc bai', 'an dem'])) return 'Discovery Search';
  if (prefixPhraseMatches(normalizeText(`${poi.poiName} ${poi.address}`), understanding.normalized)) {
    return 'Address Suggestion';
  }
  if (containsAny(category, ['atm', 'cay xang', 'benh vien'])) return 'Nearby Search';
  if (poi.brand && normalizeText(poi.brand).split(' ').some((brandToken) =>
    understanding.tokens.some((queryToken) =>
      queryToken.length >= 3 && (brandToken === queryToken || brandToken.startsWith(queryToken))
    )
  )) {
    return 'Brand Search';
  }
  if (category.split(' ').some((token) => understanding.tokens.includes(token))) {
    return 'Category Search';
  }
  return 'POI Search';
}

function predictIntent(
  drafts: CandidateDraft[],
  understanding: QueryUnderstanding,
  entities: QueryEntity[],
  embeddingVote?: EmbeddingIntentVote,
  embeddingProvider: EmbeddingContext['provider'] = 'lexical-fallback',
): SuggestResponse['intent'] {
  const votes = new Map<IntentType, number>();
  for (const [term, type] of CATEGORY_TERMS) {
    if (understanding.expanded.includes(term) || understanding.normalized.includes(term)) {
      votes.set(type, (votes.get(type) ?? 0) + 1.4);
    }
  }
  for (const draft of drafts) {
    votes.set(draft.type, (votes.get(draft.type) ?? 0) + draft.baseScore);
  }
  for (const entity of entities) {
    const mapped = intentFromEntity(entity);
    if (mapped) {
      const weight = entity.kind === 'attribute' ? entity.confidence + 1.9 : entity.confidence;
      votes.set(mapped, (votes.get(mapped) ?? 0) + weight);
    }
  }
  if (embeddingVote && embeddingVote.confidence >= 0.46) {
    votes.set(embeddingVote.type, (votes.get(embeddingVote.type) ?? 0) + embeddingVote.confidence * 1.8);
  }
  if (entities.some((entity) => entity.kind === 'coordinate')) {
    return { type: 'Coordinate Search', confidence: 0.93 };
  }
  if (entities.some((entity) => entity.kind === 'navigation')) {
    return { type: 'Navigation', confidence: 0.9 };
  }
  const hasStreetAddressSignal =
    entities.some((entity) => entity.kind === 'address') ||
    (entities.some((entity) => entity.kind === 'street') && containsAny(understanding.normalized, ['nguyen hue', '12 ngu']));
  if (hasStreetAddressSignal) {
    return { type: 'Address Suggestion', confidence: 0.86 };
  }
  if (entities.some((entity) => entity.kind === 'attribute' && normalizeText(entity.value) === 'wi fi')) {
    return { type: 'Attribute Search', confidence: 0.88 };
  }
  if (entities.some((entity) => entity.kind === 'brand')) {
    return { type: 'Brand Search', confidence: 0.88 };
  }
  const categoryIntent = intentFromClearCategoryEntity(understanding, entities);
  if (categoryIntent) {
    return categoryIntent;
  }
  const directEvidenceIntent = intentFromDirectEvidence(drafts, understanding);
  if (directEvidenceIntent) {
    return directEvidenceIntent;
  }
  if (entities.some((entity) => entity.kind === 'attribute')) {
    votes.set('Attribute Search', (votes.get('Attribute Search') ?? 0) + 4.5);
  }
  if (embeddingProvider === 'minilm' && embeddingVote && embeddingVote.confidence >= 0.48) {
    return {
      type: embeddingVote.type,
      confidence: roundScore(Math.min(0.9, Math.max(0.62, embeddingVote.confidence + 0.08))),
    };
  }
  if (votes.size === 0) {
    return { type: 'Ambiguous', confidence: 0.35 };
  }
  const sorted = [...votes.entries()].sort((a, b) => b[1] - a[1]);
  const [topType, topScore] = sorted[0];
  const total = sorted.reduce((sum, [, score]) => sum + score, 0);
  const confidence = total ? Math.min(0.98, Math.max(0.45, topScore / total + 0.28)) : 0.35;
  return { type: topType, confidence: roundScore(confidence) };
}

function intentFromDirectEvidence(drafts: CandidateDraft[], understanding: QueryUnderstanding): SuggestResponse['intent'] | undefined {
  const directSources = new Set<CandidateDraft['source']>(['autocomplete', 'generated', 'predicted', 'template', 'popular-query']);
  const evidence = new Map<string, { type: IntentType; score: number; order: number }>();

  drafts.forEach((draft, order) => {
    if (!directSources.has(draft.source)) {
      return;
    }
    const precision = directMatchPrecision(draft, understanding);
    if (precision <= 0) {
      return;
    }
    const sourceBias =
      draft.source === 'template' ? 0.22 : draft.source === 'autocomplete' ? 0.18 : draft.source === 'generated' ? 0.12 : 0.06;
    const bestMatched = draft.matched.map(normalizeText).sort()[0] ?? draft.id;
    const key = `${draft.type}:${draft.source}:${bestMatched}`;
    const score = draft.baseScore + (draft.entityBoost ?? 0) + precision + sourceBias;
    const existing = evidence.get(key);
    if (!existing || score > existing.score) {
      evidence.set(key, { type: draft.type, score, order });
    }
  });

  const byType = new Map<IntentType, { score: number; order: number }>();
  for (const item of evidence.values()) {
    const existing = byType.get(item.type);
    if (!existing || item.score > existing.score || (item.score === existing.score && item.order < existing.order)) {
      byType.set(item.type, { score: item.score, order: item.order });
    }
  }
  const sorted = [...byType.entries()].sort((a, b) => b[1].score - a[1].score || a[1].order - b[1].order);
  const [top] = sorted;
  if (!top || top[1].score < 1.05) {
    return undefined;
  }
  const [, runnerUp] = sorted[1] ?? [];
  const margin = runnerUp ? top[1].score - runnerUp.score : 0.35;
  return {
    type: top[0],
    confidence: roundScore(Math.min(0.92, Math.max(0.72, 0.76 + margin * 0.18))),
  };
}

function directMatchPrecision(draft: CandidateDraft, understanding: QueryUnderstanding): number {
  const variants = [...new Set([understanding.normalized, understanding.expanded].map(normalizeText).filter(Boolean))];
  const matched = draft.matched.map(normalizeText).filter(Boolean);
  if (matched.some((match) => variants.includes(match))) {
    return 0.5;
  }
  if (matched.some((match) => variants.some((variant) => prefixPhraseMatches(match, variant) || prefixPhraseMatches(variant, match)))) {
    return 0.3;
  }
  if (draft.source === 'autocomplete' && matched.some((match) => variants.some((variant) => match.startsWith(variant)))) {
    return 0.22;
  }
  return 0;
}

function intentFromClearCategoryEntity(
  understanding: QueryUnderstanding,
  entities: QueryEntity[],
): SuggestResponse['intent'] | undefined {
  const category = entities.find((entity) => entity.kind === 'category');
  if (!category) {
    return undefined;
  }
  const normalizedCategory = normalizeText(category.value);
  if (understanding.normalized.includes(' ') || !compactCrossTokenPrefixMatches(normalizedCategory, understanding.normalized)) {
    return undefined;
  }
  const hasSpecificEntity = entities.some((entity) => {
    if (['street', 'address', 'coordinate', 'navigation'].includes(entity.kind)) {
      return true;
    }
    if (entity.kind !== 'brand') {
      return false;
    }
    const normalizedBrand = normalizeText(entity.value);
    return (
      prefixPhraseMatches(normalizedBrand, understanding.normalized) ||
      prefixPhraseMatches(normalizedBrand, understanding.expanded)
    );
  });
  if (hasSpecificEntity) {
    return undefined;
  }
  const query = `${understanding.normalized} ${understanding.expanded}`;
  if (containsAny(query, ['wifi', '24/7', 'gan bien', 'check in', 'lam viec', 'hoc tap', 'gan san bay'])) {
    return undefined;
  }
  const type: IntentType = containsAny(normalizedCategory, ['atm', 'benh vien', 'cay xang'])
    ? 'Nearby Search'
    : 'Category Search';
  return { type, confidence: 0.86 };
}

function rankAndMerge(
  drafts: CandidateDraft[],
  predictedIntent: IntentType,
  request: SuggestRequest,
  limit: number,
): Suggestion[] {
  const merged = new Map<string, Suggestion>();

  for (const draft of drafts) {
    const personalization = personalizationBoost(request.userId, draft, request.behaviorEvents, request.city);
    const context = rankingContext(draft, request);
    const factors = scoreFactors(draft, predictedIntent, personalization.boost, context);
    const score = weightedScore(factors, request);
    const normalizedText = normalizeText(draft.text);
    const existing = merged.get(normalizedText);
    const reason = context.reasons.length ? `${draft.reason}; ${context.reasons.join('; ')}` : draft.reason;
    const suggestion = withSuggestionExplanation({
      id: draft.id,
      text: draft.text,
      normalizedText,
      type: draft.type,
      score,
      source: draft.source,
      matched: [...new Set(draft.matched.map(normalizeText))],
      poiId: draft.poi?.poiId,
      metadata: {
        reason,
        city: draft.poi?.city,
        address: draft.poi?.address,
        brand: draft.poi?.brand,
        category: draft.poi?.category,
        personalizationReason: personalization.reason,
        enrichedAttributes: draft.poi ? rankingEvidenceForPoi(draft.poi) : undefined,
        factors,
      },
    });

    if (!existing || suggestion.score > existing.score) {
      merged.set(normalizedText, suggestion);
    }
  }

  return [...merged.values()]
    .sort((a, b) => b.score - a.score || sourcePriority(a.source) - sourcePriority(b.source))
    .slice(0, limit)
    .map((suggestion, index) => ({
      ...suggestion,
      score: roundScore(Math.max(0.01, suggestion.score - index * 0.005)),
    }));
}

function scoreFactors(
  draft: CandidateDraft,
  predictedIntent: IntentType,
  personalizationBoostValue: number,
  context: RankingContext,
): ScoreFactors {
  const poi = draft.poi;
  const factors: ScoreFactors = {
    lexical: draft.baseScore,
    intent: draft.type === predictedIntent ? 1 : 0.55,
    source:
      draft.source === 'autocomplete'
          ? 0.95
        : draft.source === 'generated'
          ? 0.94
        : draft.source === 'predicted'
          ? 0.9
        : draft.source === 'template'
          ? 0.92
        : draft.source === 'embedding'
          ? 0.88
          : draft.source === 'semantic'
            ? 0.82
            : draft.source === 'popular-query'
              ? 0.86
              : 0.8,
    popularity: clamp01(draft.frequencyScore),
    poiQuality: poi ? clamp01((poi.rating / 5) * 0.45 + (poi.reviewCount / MAX_REVIEWS) * 0.25 + (poi.popularityScore / 100) * 0.3) : 0.68,
    locality: context.locality,
    personalization: clamp01(personalizationBoostValue),
    diversity: ['generated', 'predicted', 'template'].includes(draft.source) ? 0.92 : ['semantic', 'embedding'].includes(draft.source) ? 0.6 : 0.66,
  };
  if (draft.entityBoost) {
    factors.lexical = Math.min(1.18, factors.lexical + draft.entityBoost);
  }
  return factors;
}

function weightedScore(factors: ScoreFactors, request: SuggestRequest): number {
  const weights = resolveRankingWeights(request.rankingWeights, request);
  return roundScore(
    factors.lexical * weights.lexical +
      factors.intent * weights.intent +
      factors.source * weights.source +
      factors.popularity * weights.popularity +
      factors.poiQuality * weights.poiQuality +
      factors.locality * weights.locality +
      factors.personalization * weights.personalization +
      factors.diversity * weights.diversity,
  );
}

function resolveRankingWeights(requestedWeights?: Partial<RankingWeights>, request?: SuggestRequest): RankingWeights {
  const defaultWeights = activeDefaultRankingWeights();
  const merged: RankingWeights = {
    ...defaultWeights,
    ...requestedWeights,
  };
  const sanitized = Object.fromEntries(
    Object.entries(merged).map(([key, value]) => [key, Number.isFinite(value) ? Math.max(0, value) : 0]),
  ) as RankingWeights;
  if (!requestedWeights && request) {
    const localityFloor = contextualLocalityWeightFloor(request);
    if (localityFloor > 0) {
      sanitized.locality = Math.max(sanitized.locality, localityFloor);
    }
  }
  const total = Object.values(sanitized).reduce((sum, value) => sum + value, 0);
  if (total <= 0) {
    return defaultWeights;
  }
  return Object.fromEntries(Object.entries(sanitized).map(([key, value]) => [key, value / total])) as RankingWeights;
}

function requestWithInferredCity(dataset: TascoDataset, request: SuggestRequest): SuggestRequest {
  if (request.city || request.lat == null || request.lon == null || !validCoordinates(request.lat, request.lon)) {
    return request;
  }
  const understanding = expandQuery(request.q, dataset.abbreviations);
  if (queryMentionsKnownCity(dataset, understanding)) {
    return request;
  }
  const inferredCity = inferCityFromCoordinates(dataset, request.lat, request.lon);
  return inferredCity ? { ...request, city: inferredCity } : request;
}

function contextExpansions(original: SuggestRequest, contextual: SuggestRequest): string[] {
  if (!original.city && contextual.city) {
    return [`coordinate-city-inference -> ${contextual.city}`];
  }
  return [];
}

function queryMentionsKnownCity(dataset: TascoDataset, understanding: QueryUnderstanding): boolean {
  const query = `${understanding.original} ${understanding.normalized} ${understanding.expanded}`;
  return knownCities(dataset).some((city) => cityMentioned(query, city));
}

function inferCityFromCoordinates(dataset: TascoDataset, lat: number, lon: number): string | undefined {
  const nearest = dataset.pois
    .filter((poi) => poi.city && validCoordinates(poi.latitude, poi.longitude))
    .map((poi) => ({
      city: poi.city,
      distanceMeters: distanceMeters(lat, lon, poi.latitude, poi.longitude),
    }))
    .sort((a, b) => a.distanceMeters - b.distanceMeters)[0];
  return nearest && nearest.distanceMeters <= CITY_INFERENCE_RADIUS_METERS ? nearest.city : undefined;
}

function rankingContext(draft: CandidateDraft, request: SuggestRequest): RankingContext {
  const reasons: string[] = [];
  let locality = baseLocalityFactor(draft, request);
  if (request.lat != null && request.lon != null && draft.poi && validCoordinates(request.lat, request.lon)) {
    const distance = distanceMeters(request.lat, request.lon, draft.poi.latitude, draft.poi.longitude);
    locality = distanceLocalityFactor(distance);
    reasons.push(`current-location distance ${formatDistance(distance)}`);
  }

  const temporal = temporalContext(draft, request);
  if (temporal && temporal.score > locality) {
    locality = temporal.score;
    reasons.push(temporal.reason);
  } else if (temporal) {
    reasons.push(temporal.reason);
  }

  return {
    locality: roundScore(clamp01(locality)),
    reasons,
  };
}

function baseLocalityFactor(draft: CandidateDraft, request: SuggestRequest): number {
  const hasCoordinates = request.lat != null && request.lon != null && validCoordinates(request.lat, request.lon);
  if (hasCoordinates && draft.poi) {
    return distanceLocalityFactor(distanceMeters(request.lat!, request.lon!, draft.poi.latitude, draft.poi.longitude));
  }
  if (request.city && draft.poi && sameCity(draft.poi.city, request.city)) {
    return 1;
  }
  if (hasCoordinates) {
    return 0.72;
  }
  return request.city ? 0.45 : 0.7;
}

function distanceLocalityFactor(distance: number): number {
  const bounded = Math.min(Math.max(distance, 0), LOCALITY_DISTANCE_RADIUS_METERS);
  return roundScore(0.25 + (1 - bounded / LOCALITY_DISTANCE_RADIUS_METERS) * 0.75);
}

function temporalContext(draft: CandidateDraft, request: SuggestRequest): { score: number; reason: string; priority: number } | undefined {
  const minutes = requestTimeMinutes(request.now);
  if (minutes == null) {
    return undefined;
  }
  const haystack = normalizeText(
    `${draft.text} ${draft.type} ${draft.poi?.category ?? ''} ${draft.poi?.brand ?? ''} ${(draft.poi?.tags ?? []).join(' ')}`,
  );
  let best: { score: number; reason: string; priority: number } | undefined;
  const accept = (candidate: { score: number; reason: string; priority: number }) => {
    if (!best || candidate.score > best.score || (candidate.score === best.score && candidate.priority > best.priority)) {
      best = candidate;
    }
  };

  if (draft.poi) {
    const openingHours = deriveOpeningHours(placeInputFromPoi(draft.poi));
    if (timeWithinOpeningHours(openingHours.value, minutes)) {
      accept({
        score: openingHours.value === '00:00-24:00' ? 1 : 0.88,
        reason: `open at request time from enrichment hours (${openingHours.value})`,
        priority: 1,
      });
    }
  }

  if (isNight(minutes) && containsAny(haystack, ['24/7', '24h', 'mo cua khuya', 'an dem', 'khuya'])) {
    accept({
      score: containsAny(haystack, ['24/7', '24h']) ? 1 : 0.96,
      reason: 'night context favors 24/7/open-late result',
      priority: 3,
    });
  }
  if (isMorning(minutes) && hasBreakfastPhoEvidence(haystack)) {
    accept({
      score: 0.96,
      reason: 'morning context favors breakfast/phở result',
      priority: 3,
    });
  }
  return best;
}

function hasBreakfastPhoEvidence(haystack: string): boolean {
  const tokens = new Set(haystack.split(/\s+/).filter(Boolean));
  return tokens.has('pho') || containsAny(haystack, ['bua sang', 'an sang', 'breakfast']);
}

function timeWithinOpeningHours(hours: string, minutes: number): boolean {
  const match = /^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/.exec(hours);
  if (!match) {
    return false;
  }
  const [, startHour, startMinute, endHour, endMinute] = match;
  const start = Number(startHour) * 60 + Number(startMinute);
  const end = Number(endHour) * 60 + Number(endMinute);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return false;
  }
  if (end >= 24 * 60) {
    return minutes >= start;
  }
  if (start <= end) {
    return minutes >= start && minutes < end;
  }
  return minutes >= start || minutes < end;
}

function isNight(minutes: number): boolean {
  return minutes >= 21 * 60 || minutes < 5 * 60;
}

function isMorning(minutes: number): boolean {
  return minutes >= 5 * 60 && minutes < 10 * 60;
}

function contextualLocalityWeightFloor(request: SuggestRequest): number {
  if (request.lat != null && request.lon != null && validCoordinates(request.lat, request.lon)) {
    return COORDINATE_LOCALITY_WEIGHT_FLOOR;
  }
  return requestTimeMinutes(request.now) == null ? 0 : TEMPORAL_LOCALITY_WEIGHT_FLOOR;
}

function requestTimeMinutes(now?: string): number | undefined {
  if (!now) {
    return undefined;
  }
  const trimmed = now.trim();
  const localTime = /T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?$/.exec(trimmed);
  if (localTime) {
    const [, hour, minute] = localTime;
    const minutes = Number(hour) * 60 + Number(minute);
    return Number.isFinite(minutes) && minutes >= 0 && minutes < 24 * 60 ? minutes : undefined;
  }
  const date = new Date(trimmed);
  return Number.isFinite(date.getTime()) ? date.getHours() * 60 + date.getMinutes() : undefined;
}

function validCoordinates(lat: number, lon: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

function knownCities(dataset: TascoDataset): string[] {
  return [...new Set([...dataset.pois.map((poi) => poi.city).filter(Boolean), ...KNOWN_CITY_VALUES])];
}

function distanceMeters(latA: number, lonA: number, latB: number, lonB: number): number {
  const earthRadiusMeters = 6371000;
  const dLat = toRadians(latB - latA);
  const dLon = toRadians(lonB - lonA);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(latA)) * Math.cos(toRadians(latB)) * Math.sin(dLon / 2) ** 2;
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function formatDistance(distance: number): string {
  if (distance < 1000) {
    return `${Math.round(distance)} m`;
  }
  const digits = distance < 10000 ? 1 : 0;
  return `${(distance / 1000).toFixed(digits)} km`;
}

export function activeDefaultRankingWeights(): RankingWeights {
  if (learnedRankerDisabled() || !CONFIG_RANKING_WEIGHTS) {
    return DEFAULT_RANKING_WEIGHTS;
  }
  return CONFIG_RANKING_WEIGHTS;
}

function parseRankingConfigWeights(value: unknown): RankingWeights | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const weights = (value as { weights?: unknown }).weights;
  if (!weights || typeof weights !== 'object') {
    return undefined;
  }
  const parsed = Object.fromEntries(
    RANKING_FACTOR_KEYS.map((key) => {
      const raw = (weights as Record<string, unknown>)[key];
      return [key, typeof raw === 'number' && Number.isFinite(raw) ? Math.max(0, raw) : 0];
    }),
  ) as RankingWeights;
  const total = Object.values(parsed).reduce((sum, item) => sum + item, 0);
  return total > 0
    ? (Object.fromEntries(Object.entries(parsed).map(([key, item]) => [key, item / total])) as RankingWeights)
    : undefined;
}

function learnedRankerDisabled(): boolean {
  const runtimeEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  const viteEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  const value = runtimeEnv?.TASCO_DISABLE_LEARNED_RANKER ?? viteEnv?.VITE_TASCO_DISABLE_LEARNED_RANKER;
  return ['1', 'true', 'yes'].includes((value ?? '').toLowerCase());
}

function personalizationBoost(
  userId: string | undefined,
  draft: CandidateDraft,
  behaviorEvents: BehaviorEvent[] = [],
  requestCity?: string,
): { boost: number; reason?: string } {
  if (!userId) {
    return { boost: 0 };
  }
  const haystack = normalizeText(
    `${draft.text} ${draft.type} ${draft.reason} ${draft.poi?.category ?? ''} ${draft.poi?.brand ?? ''} ${
      draft.poi?.city ?? ''
    } ${draft.poi?.address ?? ''} ${draft.poi?.tags.join(' ') ?? ''}`,
  );
  const reasons: string[] = [];
  let boost = 0;
  const profile = findSimulatedProfile(userId);
  const profileMatch = profile?.preferences.find((preference) => containsAny(haystack, preference.terms));
  if (profile && profileMatch && profileCompatibleWithCity(profile, requestCity)) {
    boost = Math.max(boost, profileMatch.boost);
    reasons.push(`${profile.label}: ${profileMatch.reason}`);
  }
  const behavior = behaviorBoostForHaystack({ userId, behaviorEvents, haystack, requestCity });
  if (behavior.boost > 0) {
    boost = Math.max(boost, behavior.boost);
    reasons.push(behavior.reason);
  }
  return {
    boost: clamp01(boost),
    reason: reasons.length ? reasons.join('; ') : undefined,
  };
}

function findSimulatedProfile(userId: string): SimulatedProfile | undefined {
  const normalizedUser = normalizeText(userId);
  return SIMULATED_PROFILES.find((profile) => normalizeText(profile.id) === normalizedUser);
}

function filterCandidatesByCity(
  drafts: CandidateDraft[],
  dataset: TascoDataset,
  requestCity?: string,
): CandidateDraft[] {
  if (!requestCity) {
    return drafts;
  }
  const knownCities = [...new Set([...dataset.pois.map((poi) => poi.city).filter(Boolean), ...KNOWN_CITY_VALUES])];
  return drafts.filter((draft) => candidateCompatibleWithCity(draft, requestCity, knownCities));
}

function candidateCompatibleWithCity(draft: CandidateDraft, requestCity: string, knownCities: string[]): boolean {
  if (draft.poi) {
    return sameCity(draft.poi.city, requestCity);
  }
  const haystack = [draft.text, draft.reason, ...draft.matched].join(' ');
  return !knownCities.some((city) => !sameCity(city, requestCity) && cityMentioned(haystack, city));
}

function profileCompatibleWithCity(profile: SimulatedProfile, requestCity?: string): boolean {
  return !profile.city || !requestCity || sameCity(profile.city, requestCity);
}

function sameCity(left: string, right: string): boolean {
  const leftAliases = cityAliases(left);
  const rightAliases = cityAliases(right);
  return leftAliases.some((leftAlias) => rightAliases.includes(leftAlias));
}

function cityMentioned(text: string, city: string): boolean {
  return cityAliases(city).some((alias) => alias.length >= 3 && containsTokenPhrase(text, alias));
}

function cityAliases(city: string): string[] {
  const normalized = normalizeText(city);
  const aliases = new Set([normalized]);
  if (['tp.hcm', 'tp hcm', 'hcm', 'ho chi minh', 'thanh pho ho chi minh', 'sai gon', 'sg'].includes(normalized)) {
    ['tp.hcm', 'tp hcm', 'hcm', 'ho chi minh', 'thanh pho ho chi minh', 'sai gon', 'sg'].forEach((alias) => aliases.add(alias));
  }
  if (['ha noi', 'hn'].includes(normalized)) {
    ['ha noi', 'hn'].forEach((alias) => aliases.add(alias));
  }
  if (['da nang', 'dn'].includes(normalized)) {
    ['da nang', 'dn'].forEach((alias) => aliases.add(alias));
  }
  if (['da lat', 'dl'].includes(normalized)) {
    ['da lat', 'dl'].forEach((alias) => aliases.add(alias));
  }
  if (['nha trang', 'nt'].includes(normalized)) {
    ['nha trang', 'nt'].forEach((alias) => aliases.add(alias));
  }
  if (['hai phong', 'hp'].includes(normalized)) {
    ['hai phong', 'hp'].forEach((alias) => aliases.add(alias));
  }
  return [...aliases];
}

function containsAny(text: string, needles: string[]): boolean {
  const normalized = normalizeText(text);
  return needles.some((needle) => normalized.includes(normalizeText(needle)));
}

function tokenEvidence(haystack: string, token: string): boolean {
  if (token.length < 3) {
    return false;
  }
  const haystackTokens = tokenizeForPhrase(haystack);
  if (token.length === 3) {
    return haystackTokens.some((haystackToken) => haystackToken.startsWith(token));
  }
  return haystack.includes(token);
}

function sourcePriority(source: Suggestion['source']): number {
  return { autocomplete: 0, 'popular-query': 1, poi: 2, generated: 3, predicted: 4, template: 5, embedding: 6, semantic: 7 }[source];
}

function clampLimit(limit: number | undefined): number {
  return Math.min(12, Math.max(1, Math.round(limit ?? 8)));
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function roundScore(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function topSuggestionTexts(dataset: TascoDataset, query: string, limit = 5): string[] {
  return suggest(dataset, { q: query, limit }).suggestions.map((suggestion) => suggestion.text);
}

export function extractEntities(dataset: TascoDataset, understanding: QueryUnderstanding): QueryEntity[] {
  const query = `${understanding.normalized} ${understanding.expanded}`;
  const entities: QueryEntity[] = [];
  const add = (entity: QueryEntity) => {
    const key = `${entity.kind}:${normalizeText(entity.value)}`;
    if (!entities.some((existing) => `${existing.kind}:${normalizeText(existing.value)}` === key)) {
      entities.push(entity);
    }
  };

  for (const expansion of understanding.expansions) {
    const [source, value] = expansion.split('->').map((part) => part.trim());
    if (source?.includes(':')) {
      continue;
    }
    if (value) add({ kind: inferEntityKind(value), value, source: 'abbreviation', confidence: 0.82 });
  }

  const cityValues = ['TP.HCM', 'Hà Nội', 'Đà Nẵng', 'Đà Lạt', 'Nha Trang', 'Hải Phòng'];
  for (const city of cityValues) {
    if (semanticTemplateMatches(query, city)) add({ kind: 'city', value: city, source: 'query', confidence: 0.88 });
  }

  const districts = ['Quận 1', 'Quận 7'];
  for (const district of districts) {
    if (semanticTemplateMatches(query, district)) add({ kind: 'district', value: district, source: 'query', confidence: 0.86 });
  }

  const entityTerms: Array<[QueryEntity['kind'], string, number, string[]?]> = [
    ['category', 'cà phê', 0.9],
    ['category', 'ATM', 0.94],
    ['category', 'khách sạn', 0.9],
    ['category', 'bệnh viện', 0.9],
    ['category', 'cây xăng', 0.9],
    ['category', 'nhà hàng', 0.82],
    ['category', 'trà sữa', 0.82],
    ['attribute', 'Wi-Fi', 0.8, ['wifi']],
    ['attribute', '24/7', 0.8],
    ['attribute', 'gần biển', 0.78],
    ['attribute', 'check-in', 0.78],
    ['attribute', 'yên tĩnh', 0.76],
    ['attribute', 'làm việc', 0.76],
    ['proximity', 'gần đây', 0.9],
    ['proximity', 'gần nhất', 0.9],
    ['navigation', 'chỉ đường', 0.96],
    ['navigation', 'đường đến', 0.94, ['duong den']],
  ];
  for (const [kind, value, confidence, aliases = []] of entityTerms) {
    if ([value, ...aliases].some((term) => semanticTemplateMatches(query, term))) {
      add({ kind, value, source: 'query', confidence });
    }
  }

  if (/^\d+(\.\d+)?$/.test(understanding.normalized)) {
    add({ kind: 'coordinate', value: understanding.normalized, source: 'query', confidence: 0.95 });
  }
  if (/^\d+\s+/.test(understanding.normalized)) {
    add({ kind: 'address', value: understanding.original, source: 'query', confidence: 0.84 });
  }

  for (const poi of dataset.pois) {
    for (const [kind, value] of [
      ['brand', poi.brand] as const,
      ['poi', poi.poiName] as const,
      ['street', streetFromAddress(poi.address)] as const,
    ]) {
      const brandPrefixHit =
        kind === 'brand' &&
        value &&
        normalizeText(value).split(' ').some((brandToken) =>
          understanding.tokens.some((queryToken) =>
            queryToken.length >= 3 && brandToken.length > queryToken.length && brandToken.startsWith(queryToken)
          )
        );
      if (value && (semanticTemplateMatches(query, value) || brandPrefixHit)) {
        add({ kind, value, source: 'poi-dataset', confidence: kind === 'poi' ? 0.9 : 0.78 });
      }
    }
  }

  return entities.sort((a, b) => b.confidence - a.confidence).slice(0, 10);
}

function inferEntityKind(value: string): QueryEntity['kind'] {
  const normalized = normalizeText(value);
  if (containsAny(normalized, ['gan day', 'gan nhat'])) return 'proximity';
  if (containsAny(normalized, ['quan 1', 'quan 7'])) return 'district';
  if (containsAny(normalized, ['ha noi', 'da nang', 'tp.hcm', 'ho chi minh'])) return 'city';
  if (containsAny(normalized, ['vietcombank', 'vincom', 'vinmec'])) return 'brand';
  return 'category';
}

function streetFromAddress(address: string): string {
  return address.split(',')[0]?.replace(/^\d+\s+/, '').trim() ?? '';
}

function intentFromEntity(entity: QueryEntity): IntentType | null {
  if (entity.kind === 'coordinate') return 'Coordinate Search';
  if (entity.kind === 'navigation') return 'Navigation';
  if (entity.kind === 'address' || entity.kind === 'street') return 'Address Suggestion';
  if (entity.kind === 'proximity') return 'Nearby Search';
  if (entity.kind === 'attribute') return 'Attribute Search';
  if (entity.kind === 'brand') return 'Brand Search';
  if (entity.kind === 'poi') return 'POI Search';
  if (entity.kind === 'category') return 'Category Search';
  return null;
}

function templateGroup(
  triggers: string[],
  texts: string[],
  type: IntentType,
  reason: string,
  entityBoost?: number,
): SemanticTemplate[] {
  return texts.map((text) => ({ triggers, text, type, reason, entityBoost }));
}
