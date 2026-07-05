import { DEFAULT_RANKING_WEIGHTS, suggest } from './engine';
import { normalizeText } from './normalize';
import { buildRobustnessCases } from './robustness';
import type { BehaviorEvent, EvaluationCase, RankingWeights, ScoreFactors, Suggestion, TascoDataset } from './types';

export interface RankingTrainingRow {
  caseId: string;
  query: string;
  suggestionId: string;
  text: string;
  source: Suggestion['source'];
  type: Suggestion['type'];
  label: 0 | 1 | 3;
  features: ScoreFactors;
}

export interface RankingMetricSummary {
  total: number;
  top1Accuracy: number;
  top3Recall: number;
  mrr: number;
  ndcgAt5: number;
}

export interface LearnedRankingModel {
  weights: RankingWeights;
  train: RankingMetricSummary;
  validation: RankingMetricSummary;
  rows: number;
  note: string;
}

const FEATURE_KEYS = Object.keys(DEFAULT_RANKING_WEIGHTS) as Array<keyof RankingWeights>;

export function buildLearningToRankRows(dataset: TascoDataset, limit = 12, behaviorEvents: BehaviorEvent[] = []): RankingTrainingRow[] {
  const robustnessRows = buildRobustnessCases(dataset).flatMap((robustnessCase) =>
    rowsForTarget(
      dataset,
      {
        caseId: robustnessCase.caseId,
        inputPrefix: robustnessCase.inputPrefix,
        expectedSuggestionType: robustnessCase.expectedSuggestionType,
        expectedTopSuggestions: robustnessCase.expectedTopSuggestions,
      },
      limit,
    ),
  );
  return [...robustnessRows, ...buildBehaviorRankingRows(dataset, behaviorEvents, limit)];
}

export function buildPublicEvaluationRankingRows(dataset: TascoDataset, limit = 12): RankingTrainingRow[] {
  return dataset.evaluationCases.flatMap((evaluationCase) => rowsForTarget(dataset, evaluationCase, limit));
}

export function buildBehaviorRankingRows(dataset: TascoDataset, behaviorEvents: BehaviorEvent[], limit = 12): RankingTrainingRow[] {
  return behaviorEvents.flatMap((event, index) => rowsForBehaviorEvent(dataset, event, index, limit));
}

export function fitLinearRankingWeights(dataset: TascoDataset, behaviorEvents: BehaviorEvent[] = []): LearnedRankingModel {
  const trainRows = buildLearningToRankRows(dataset, 12, behaviorEvents);
  const validationRows = buildPublicEvaluationRankingRows(dataset);
  const weights = pairwiseLogisticWeights(trainRows);
  return {
    weights,
    train: evaluateRankingRows(trainRows, weights),
    validation: evaluateRankingRows(validationRows, weights),
    rows: trainRows.length,
    note:
      'Pairwise logistic linear ranker trained on robustness perturbations plus optional behavior selections; public evaluation rows are held out for validation.',
  };
}

export function evaluateRankingRows(rows: RankingTrainingRow[], weights: RankingWeights): RankingMetricSummary {
  const groups = groupByCase(rows);
  const rankedGroups = [...groups.values()].map((group) =>
    [...group].sort((a, b) => scoreRow(b, weights) - scoreRow(a, weights)),
  );
  const total = rankedGroups.length;
  const top1 = rankedGroups.filter((group) => group[0]?.label === 3).length;
  const top3 = rankedGroups.filter((group) => group.slice(0, 3).some((row) => row.label === 3)).length;
  const reciprocalRanks = rankedGroups.map((group) => {
    const index = group.findIndex((row) => row.label === 3);
    return index >= 0 ? 1 / (index + 1) : 0;
  });
  const ndcg = rankedGroups.map((group) => ndcgAt(group, 5));
  return {
    total,
    top1Accuracy: ratio(top1, total),
    top3Recall: ratio(top3, total),
    mrr: average(reciprocalRanks),
    ndcgAt5: average(ndcg),
  };
}

function rowsForTarget(
  dataset: TascoDataset,
  target: Pick<EvaluationCase, 'caseId' | 'inputPrefix' | 'expectedSuggestionType' | 'expectedTopSuggestions'>,
  limit: number,
): RankingTrainingRow[] {
  const response = suggest(dataset, { q: target.inputPrefix, limit, rankingWeights: DEFAULT_RANKING_WEIGHTS });
  const expectedIntent = normalizeExpectedIntent(target.expectedSuggestionType);
  return response.suggestions.map((suggestion): RankingTrainingRow => ({
    caseId: target.caseId,
    query: target.inputPrefix,
    suggestionId: suggestion.id,
    text: suggestion.text,
    source: suggestion.source,
    type: suggestion.type,
    label: relevanceLabel(suggestion, target, expectedIntent),
    features: suggestion.metadata.factors,
  }));
}

function rowsForBehaviorEvent(dataset: TascoDataset, event: BehaviorEvent, index: number, limit: number): RankingTrainingRow[] {
  const response = suggest(dataset, {
    q: event.query,
    userId: event.userId,
    city: event.city,
    limit,
    rankingWeights: DEFAULT_RANKING_WEIGHTS,
    behaviorEvents: [event],
  });
  return response.suggestions.map((suggestion): RankingTrainingRow => ({
    caseId: `behavior-${index}`,
    query: event.query,
    suggestionId: suggestion.id,
    text: suggestion.text,
    source: suggestion.source,
    type: suggestion.type,
    label: behaviorLabel(suggestion, event),
    features: suggestion.metadata.factors,
  }));
}

function relevanceLabel(
  suggestion: Suggestion,
  target: Pick<EvaluationCase, 'expectedTopSuggestions'>,
  expectedIntent: Suggestion['type'],
): RankingTrainingRow['label'] {
  if (target.expectedTopSuggestions.some((expected) => isExpectedMatch(suggestion.text, expected))) {
    return 3;
  }
  if (suggestion.type === expectedIntent) {
    return 1;
  }
  return 0;
}

function behaviorLabel(suggestion: Suggestion, event: BehaviorEvent): RankingTrainingRow['label'] {
  if (isExpectedMatch(suggestion.text, event.selectedText)) {
    return 3;
  }
  if (suggestion.type === event.selectedType) {
    return 1;
  }
  return 0;
}

function pairwiseLogisticWeights(rows: RankingTrainingRow[]): RankingWeights {
  const pairs = pairwiseDeltas(rows);
  if (!pairs.length) {
    return DEFAULT_RANKING_WEIGHTS;
  }

  let current = { ...DEFAULT_RANKING_WEIGHTS };
  let learningRate = 0.16;
  const l2 = 0.025;

  for (let iteration = 0; iteration < 360; iteration += 1) {
    const gradient = Object.fromEntries(FEATURE_KEYS.map((key) => [key, 0])) as RankingWeights;
    for (const pair of pairs) {
      const margin = FEATURE_KEYS.reduce((sum, key) => sum + current[key] * pair.delta[key], 0);
      const probability = sigmoid(margin);
      const scale = (probability - 1) * pair.weight;
      for (const key of FEATURE_KEYS) {
        gradient[key] += scale * pair.delta[key];
      }
    }
    for (const key of FEATURE_KEYS) {
      const regularized = gradient[key] / pairs.length + l2 * (current[key] - DEFAULT_RANKING_WEIGHTS[key]);
      current[key] = Math.max(0, current[key] - learningRate * regularized);
    }
    current = normalizeWeights(current);
    learningRate *= 0.993;
  }

  return current;
}

function pairwiseDeltas(rows: RankingTrainingRow[]): Array<{ delta: RankingWeights; weight: number }> {
  const pairs: Array<{ delta: RankingWeights; weight: number }> = [];
  for (const group of groupByCase(rows).values()) {
    for (const higher of group) {
      for (const lower of group) {
        if (higher.label <= lower.label) {
          continue;
        }
        pairs.push({
          delta: Object.fromEntries(FEATURE_KEYS.map((key) => [key, higher.features[key] - lower.features[key]])) as RankingWeights,
          weight: (higher.label - lower.label) / 3,
        });
      }
    }
  }
  return pairs;
}

function scoreRow(row: RankingTrainingRow, weights: RankingWeights): number {
  return FEATURE_KEYS.reduce((sum, key) => sum + row.features[key] * weights[key], 0);
}

function groupByCase(rows: RankingTrainingRow[]): Map<string, RankingTrainingRow[]> {
  const groups = new Map<string, RankingTrainingRow[]>();
  for (const row of rows) {
    groups.set(row.caseId, [...(groups.get(row.caseId) ?? []), row]);
  }
  return groups;
}

function ndcgAt(group: RankingTrainingRow[], limit: number): number {
  const gains = group.slice(0, limit).map((row, index) => gain(row.label) / Math.log2(index + 2));
  const ideal = [...group]
    .sort((a, b) => b.label - a.label)
    .slice(0, limit)
    .map((row, index) => gain(row.label) / Math.log2(index + 2));
  const idealTotal = ideal.reduce((sum, value) => sum + value, 0);
  return idealTotal ? round(gains.reduce((sum, value) => sum + value, 0) / idealTotal) : 0;
}

function gain(label: RankingTrainingRow['label']): number {
  return 2 ** label - 1;
}

function normalizeWeights(weights: RankingWeights): RankingWeights {
  const total = FEATURE_KEYS.reduce((sum, key) => sum + Math.max(0, weights[key]), 0);
  if (!total) {
    return DEFAULT_RANKING_WEIGHTS;
  }
  return Object.fromEntries(FEATURE_KEYS.map((key) => [key, Math.max(0, weights[key]) / total])) as RankingWeights;
}

function sigmoid(value: number): number {
  if (value >= 30) return 1;
  if (value <= -30) return 0;
  return 1 / (1 + Math.exp(-value));
}

function normalizeExpectedIntent(value: string): Suggestion['type'] {
  const normalized = normalizeText(value);
  if (normalized.includes('brand')) return 'Brand Search';
  if (normalized.includes('category')) return 'Category Search';
  if (normalized.includes('nearby')) return 'Nearby Search';
  if (normalized.includes('poi')) return 'POI Search';
  if (normalized.includes('address')) return 'Address Suggestion';
  if (normalized.includes('location')) return 'Location Search';
  if (normalized.includes('discovery')) return 'Discovery Search';
  if (normalized.includes('navigation')) return 'Navigation';
  if (normalized.includes('attribute')) return 'Attribute Search';
  if (normalized.includes('coordinate')) return 'Coordinate Search';
  return 'Ambiguous';
}

function isExpectedMatch(actual: string, expected: string): boolean {
  const normalizedActual = normalizeText(actual);
  const normalizedExpected = normalizeText(expected);
  return normalizedActual.includes(normalizedExpected) || normalizedExpected.includes(normalizedActual);
}

function ratio(numerator: number, denominator: number): number {
  return denominator ? round(numerator / denominator) : 0;
}

function average(values: number[]): number {
  return values.length ? round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
