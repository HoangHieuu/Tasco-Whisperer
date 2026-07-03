import { resolveAgenticCorrection } from './agentic';
import { expandQuery, fuzzyIncludes, normalizeText } from './normalize';
import { generatedPatternCandidates } from './generatedPatterns';
import {
  buildEmbeddingIndex,
  hasStrongSemanticEvidence,
  searchEmbeddingIndex,
  semanticDocuments,
  semanticSimilarity,
  voteIntentFromNeighbors,
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

interface SimulatedProfile {
  id: string;
  label: string;
  preferences: Array<{
    terms: string[];
    reason: string;
    boost: number;
  }>;
}

const MAX_QUERY_FREQUENCY = 15000;
const MAX_REVIEWS = 10000;

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
  ...templateGroup(['hotel near beach danang'], ['Khách sạn gần biển Đà Nẵng'], 'Discovery Search', 'English beach hotel location intent', 0.9),
  ...templateGroup(['khach san da nang', 'hotel da nang', 'hotel near beach danang', 'my khe hotel'], ['Khách sạn Đà Nẵng', 'Khách sạn Đà Nẵng gần biển', 'Khách sạn gần biển Đà Nẵng', 'Hotel Đà Nẵng', 'Khách sạn gần biển Mỹ Khê'], 'Discovery Search', 'hotel plus coastal Da Nang intent'),
  ...templateGroup(['cay xang', 'tram xang', 'xang tren duong'], ['Cây xăng gần đây', 'Trạm xăng gần đây', 'Cây xăng trên đường đi'], 'Nearby Search', 'gas station nearby or route intent'),
  ...templateGroup(['coffee gan day', 'ca phe gan day'], ['Coffee near me', 'Quán cà phê gần đây'], 'Discovery Search', 'mixed language nearby cafe intent'),
  ...templateGroup(['cafe yen tinh'], ['Quán cà phê yên tĩnh'], 'Discovery Search', 'quiet cafe attribute intent'),
  ...templateGroup(['cafe dep song ao'], ['Quán cà phê đẹp để check-in'], 'Discovery Search', 'photo-friendly cafe discovery intent'),
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
  ...templateGroup(['sieu thi gan'], ['Siêu thị gần đây'], 'Category Search', 'supermarket nearby category'),
  ...templateGroup(['quan nuong quan 7'], ['Quán nướng Quận 7'], 'Category Search', 'grill category plus district'),
  ...templateGroup(['hoc vien gan day'], ['Học viện gần đây', 'Trung tâm đào tạo gần đây'], 'Category Search', 'education synonym category'),
  ...templateGroup(['ben xe mien dong'], ['Bến xe Miền Đông mới', 'Bến xe Miền Đông cũ'], 'POI Search', 'bus station ambiguity'),
];

export function suggest(dataset: TascoDataset, request: SuggestRequest): SuggestResponse {
  const start = performance.now();
  const limit = clampLimit(request.limit);
  const understanding = understandQuery(dataset, request.q);
  const entities = extractEntities(dataset, understanding);
  const embedding = embeddingContext(dataset, understanding);
  const drafts = collectCandidates(dataset, understanding, request, embedding.neighbors, entities);
  const intent = predictIntent(drafts, understanding, entities, embedding.intentVote);
  const agentic = resolveAgenticCorrection({
    understanding,
    entities,
    intent,
    candidateCount: drafts.length,
    aliasMemory: request.aliasMemory,
    provider: request.agenticProvider,
    enabled: request.agentic,
  });

  const finalUnderstanding = agentic.appliedRewrite
    ? expandQuery(agentic.appliedRewrite, dataset.abbreviations)
    : understanding;
  const finalEntities = agentic.appliedRewrite
    ? mergeEntities(extractEntities(dataset, finalUnderstanding), agentic.proposal?.entities ?? [])
    : entities;
  const rewrittenEmbedding = agentic.appliedRewrite ? embeddingContext(dataset, finalUnderstanding) : embedding;
  const rewrittenDrafts = agentic.appliedRewrite
    ? collectCandidates(dataset, finalUnderstanding, request, rewrittenEmbedding.neighbors, finalEntities)
    : [];
  const finalDrafts = agentic.appliedRewrite ? [...drafts, ...rewrittenDrafts] : drafts;
  const rerunIntent = agentic.appliedRewrite
    ? predictIntent(finalDrafts, finalUnderstanding, finalEntities, rewrittenEmbedding.intentVote)
    : intent;
  const finalIntent = applyValidatedAgenticIntent(rerunIntent, agentic.proposal);
  const suggestions = rankAndMerge(finalDrafts, finalIntent.type, request, limit);

  return {
    query: request.q,
    normalizedQuery: understanding.normalized,
    expandedQuery: finalUnderstanding.expanded,
    intent: finalIntent,
    suggestions,
    latencyMs: Math.max(1, Math.round(performance.now() - start)),
    diagnostics: {
      expansions: finalUnderstanding.expansions,
      entities: finalEntities,
      candidateCount: finalDrafts.length,
      agentic,
      embedding: {
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

function embeddingContext(
  dataset: TascoDataset,
  understanding: QueryUnderstanding,
): { neighbors: EmbeddingNeighbor[]; intentVote?: EmbeddingIntentVote } {
  const query = understanding.expanded || understanding.normalized;
  if (!query || isUnresolvedCompactQuery(understanding)) {
    return { neighbors: [] };
  }
  const neighbors = searchEmbeddingIndex(query, buildEmbeddingIndex(dataset), 10).filter((neighbor) => neighbor.similarity >= 0.38);
  return {
    neighbors,
    intentVote: voteIntentFromNeighbors(neighbors),
  };
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

  return [
    ...fromAutocomplete(dataset, understanding),
    ...fromPois(dataset, understanding, request),
    ...fromPopularQueries(dataset, understanding),
    ...fromEmbedding(understanding, embeddingNeighbors),
    ...fromSemantic(dataset, understanding),
    ...fromGeneratedPatterns(dataset, understanding, entities),
    ...fromTemplates(understanding),
  ];
}

function fromAutocomplete(dataset: TascoDataset, understanding: QueryUnderstanding): CandidateDraft[] {
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
    return {
      id: record.suggestionId,
      text: record.suggestionText,
      type: record.suggestionType,
      source: 'autocomplete' as const,
      matched,
      baseScore: Math.min(1.12, record.score + exactPrefixBoost),
      frequencyScore: record.queryFrequency / MAX_QUERY_FREQUENCY,
      reason: 'historical autocomplete pair',
    };
  });
}

function fromPois(dataset: TascoDataset, understanding: QueryUnderstanding, request: SuggestRequest): CandidateDraft[] {
  const requestedCity = normalizeText(request.city ?? '');
  return dataset.pois.flatMap((poi) => {
    const haystacks = [poi.poiName, poi.brand, poi.category, poi.address, poi.city, ...poi.tags].filter(Boolean);
    const matched = haystacks.filter((value) => queryMatches(value, understanding));
    const categoryHit = tokenFallbackMatches(normalizeText(poi.category), understanding.tokens);
    const cityHit = requestedCity ? normalizeText(poi.city).includes(requestedCity) : true;
    if (matched.length === 0 && !categoryHit) {
      return [];
    }
    return {
      id: poi.poiId,
      text: poi.poiName,
      type: inferPoiSuggestionType(poi, understanding),
      source: 'poi' as const,
      matched: matched.length > 0 ? matched : [poi.category],
      poi,
      baseScore: cityHit ? 0.76 : 0.62,
      frequencyScore: poi.popularityScore / 100,
      reason: `matched ${poi.category}${poi.city ? ` in ${poi.city}` : ''}`,
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
    });
}

function fromEmbedding(understanding: QueryUnderstanding, neighbors: EmbeddingNeighbor[]): CandidateDraft[] {
  const query = understanding.expanded || understanding.normalized;
  if (query.length < 4 || isUnresolvedCompactQuery(understanding)) {
    return [];
  }
  return neighbors
    .filter((neighbor) => neighbor.similarity >= 0.44 && hasStrongSemanticEvidence(query, neighbor.document.text))
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
          reason: `embedding kNN match from ${poi.category}${poi.city ? ` in ${poi.city}` : ''}`,
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
          reason: 'embedding kNN match from historical autocomplete',
          entityBoost: 0.04,
        };
      }
      const record = document.record;
      return {
        id: `embedding-${document.id}`,
        text: record.queryText,
        type: record.intentType,
        source: 'embedding',
        matched: ['embedding kNN'],
        baseScore: Math.min(0.82, 0.47 + similarity * 0.38),
        frequencyScore: record.monthlyFrequency / MAX_QUERY_FREQUENCY,
        reason: 'embedding kNN match from popular query',
        entityBoost: 0.04,
      };
    });
}

function fromGeneratedPatterns(
  dataset: TascoDataset,
  understanding: QueryUnderstanding,
  entities: QueryEntity[],
): CandidateDraft[] {
  if (isUnresolvedCompactQuery(understanding)) {
    return [];
  }
  return generatedPatternCandidates(dataset, understanding, entities).map((candidate): CandidateDraft => ({
    id: candidate.id,
    text: candidate.text,
    type: candidate.type,
    source: 'generated',
    matched: candidate.matched,
    baseScore: candidate.baseScore,
    frequencyScore: candidate.frequencyScore,
    reason: candidate.reason,
    entityBoost: candidate.entityBoost,
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

function fromTemplates(understanding: QueryUnderstanding): CandidateDraft[] {
  const queryVariants = [...new Set([understanding.normalized, understanding.expanded].filter(Boolean))];
  return SEMANTIC_TEMPLATES.flatMap((template, index) => {
    if (!template.triggers.some((trigger) => queryVariants.some((query) => semanticTemplateMatches(query, trigger)))) {
      return [];
    }
    return {
      id: `template-${index}`,
      text: template.text,
      type: template.type,
      source: 'template' as const,
      matched: template.triggers
        .filter((trigger) => queryVariants.some((query) => semanticTemplateMatches(query, trigger)))
        .slice(0, 2),
      baseScore: 0.74,
      frequencyScore: 0.82,
      reason: template.reason,
      entityBoost: template.entityBoost ?? 0.52,
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
  if (poi.brand && normalizeText(poi.brand).split(' ').some((token) => understanding.tokens.includes(token))) {
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
  if (entities.some((entity) => entity.kind === 'attribute')) {
    votes.set('Attribute Search', (votes.get('Attribute Search') ?? 0) + 4.5);
  }
  const categoryIntent = intentFromClearCategoryEntity(understanding, entities);
  if (categoryIntent) {
    return categoryIntent;
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
    const personalization = personalizationBoost(request.userId, draft, request.behaviorEvents);
    const factors = scoreFactors(draft, predictedIntent, request, personalization.boost);
    const score = weightedScore(factors, request.rankingWeights);
    const normalizedText = normalizeText(draft.text);
    const existing = merged.get(normalizedText);
    const suggestion: Suggestion = {
      id: draft.id,
      text: draft.text,
      normalizedText,
      type: draft.type,
      score,
      source: draft.source,
      matched: [...new Set(draft.matched.map(normalizeText))],
      poiId: draft.poi?.poiId,
      metadata: {
        reason: draft.reason,
        city: draft.poi?.city,
        address: draft.poi?.address,
        brand: draft.poi?.brand,
        category: draft.poi?.category,
        personalizationReason: personalization.reason,
        factors,
      },
    };

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
  request: SuggestRequest,
  personalizationBoostValue: number,
): ScoreFactors {
  const poi = draft.poi;
  const cityMatch = request.city && poi ? normalizeText(poi.city).includes(normalizeText(request.city)) : false;
  const factors: ScoreFactors = {
    lexical: draft.baseScore,
    intent: draft.type === predictedIntent ? 1 : 0.55,
    source:
      draft.source === 'autocomplete'
        ? 0.95
        : draft.source === 'generated'
          ? 0.94
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
    locality: cityMatch ? 1 : request.city ? 0.45 : 0.7,
    personalization: clamp01(personalizationBoostValue),
    diversity: ['generated', 'template'].includes(draft.source) ? 0.92 : ['semantic', 'embedding'].includes(draft.source) ? 0.6 : 0.66,
  };
  if (draft.entityBoost) {
    factors.lexical = Math.min(1.18, factors.lexical + draft.entityBoost);
  }
  return factors;
}

function weightedScore(factors: ScoreFactors, requestedWeights?: Partial<RankingWeights>): number {
  const weights = resolveRankingWeights(requestedWeights);
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

function resolveRankingWeights(requestedWeights?: Partial<RankingWeights>): RankingWeights {
  const merged: RankingWeights = {
    ...DEFAULT_RANKING_WEIGHTS,
    ...requestedWeights,
  };
  const sanitized = Object.fromEntries(
    Object.entries(merged).map(([key, value]) => [key, Number.isFinite(value) ? Math.max(0, value) : 0]),
  ) as RankingWeights;
  const total = Object.values(sanitized).reduce((sum, value) => sum + value, 0);
  if (total <= 0) {
    return DEFAULT_RANKING_WEIGHTS;
  }
  return Object.fromEntries(Object.entries(sanitized).map(([key, value]) => [key, value / total])) as RankingWeights;
}

function personalizationBoost(
  userId: string | undefined,
  draft: CandidateDraft,
  behaviorEvents: BehaviorEvent[] = [],
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
  if (profile && profileMatch) {
    boost = Math.max(boost, profileMatch.boost);
    reasons.push(`${profile.label}: ${profileMatch.reason}`);
  }
  const behavior = behaviorBoost(userId, behaviorEvents, haystack);
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

function behaviorBoost(
  userId: string,
  behaviorEvents: BehaviorEvent[],
  haystack: string,
): { boost: number; reason: string } {
  const normalizedUser = normalizeText(userId);
  const matchingEvents = behaviorEvents
    .filter((event) => normalizeText(event.userId) === normalizedUser)
    .slice(-50)
    .reverse();
  const matchedTerms = new Set<string>();

  for (const event of matchingEvents) {
    for (const term of behaviorTerms(event)) {
      if (term.length >= 3 && haystack.includes(normalizeText(term))) {
        matchedTerms.add(term);
      }
    }
  }

  if (matchedTerms.size === 0) {
    return { boost: 0, reason: '' };
  }

  const terms = [...matchedTerms].slice(0, 3);
  return {
    boost: Math.min(1, 0.55 + terms.length * 0.12),
    reason: `Local learner: prior selections match ${terms.join(', ')}`,
  };
}

function behaviorTerms(event: BehaviorEvent): string[] {
  return [
    event.selectedText,
    event.brand ?? '',
    event.category ?? '',
    event.city ?? '',
  ].filter(Boolean);
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
  return { autocomplete: 0, 'popular-query': 1, poi: 2, generated: 3, template: 4, embedding: 5, semantic: 6 }[source];
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
    const [, value] = expansion.split('->').map((part) => part.trim());
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
      if (value && semanticTemplateMatches(query, value)) {
        add({ kind, value, source: 'poi-dataset', confidence: kind === 'poi' ? 0.9 : 0.78 });
      }
    }
  }

  return entities.sort((a, b) => b.confidence - a.confidence).slice(0, 10);
}

function inferEntityKind(value: string): QueryEntity['kind'] {
  const normalized = normalizeText(value);
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
