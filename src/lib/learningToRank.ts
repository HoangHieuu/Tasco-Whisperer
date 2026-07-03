import { DEFAULT_RANKING_WEIGHTS, suggest } from './engine';
import { normalizeText } from './normalize';
import type { EvaluationCase, RankingWeights, ScoreFactors, Suggestion, TascoDataset } from './types';

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

export function buildLearningToRankRows(dataset: TascoDataset, limit = 12): RankingTrainingRow[] {
  return dataset.evaluationCases.flatMap((evaluationCase) => rowsForCase(dataset, evaluationCase, limit));
}

export function fitLinearRankingWeights(dataset: TascoDataset): LearnedRankingModel {
  const rows = buildLearningToRankRows(dataset);
  const validationCaseIds = new Set(
    dataset.evaluationCases
      .filter((_, index) => index % 5 === 0)
      .map((evaluationCase) => evaluationCase.caseId),
  );
  const trainRows = rows.filter((row) => !validationCaseIds.has(row.caseId));
  const validationRows = rows.filter((row) => validationCaseIds.has(row.caseId));
  const weights = coordinateSearchWeights(trainRows);
  return {
    weights,
    train: evaluateRankingRows(trainRows, weights),
    validation: evaluateRankingRows(validationRows, weights),
    rows: rows.length,
    note: 'Dependency-free linear LTR baseline over existing score factors; use larger judged logs before claiming production ML ranking.',
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

function rowsForCase(dataset: TascoDataset, evaluationCase: EvaluationCase, limit: number): RankingTrainingRow[] {
  const response = suggest(dataset, { q: evaluationCase.inputPrefix, limit });
  const expectedIntent = normalizeExpectedIntent(evaluationCase.expectedSuggestionType);
  return response.suggestions.map((suggestion): RankingTrainingRow => ({
    caseId: evaluationCase.caseId,
    query: evaluationCase.inputPrefix,
    suggestionId: suggestion.id,
    text: suggestion.text,
    source: suggestion.source,
    type: suggestion.type,
    label: relevanceLabel(suggestion, evaluationCase, expectedIntent),
    features: suggestion.metadata.factors,
  }));
}

function relevanceLabel(suggestion: Suggestion, evaluationCase: EvaluationCase, expectedIntent: Suggestion['type']): RankingTrainingRow['label'] {
  if (evaluationCase.expectedTopSuggestions.some((expected) => isExpectedMatch(suggestion.text, expected))) {
    return 3;
  }
  if (suggestion.type === expectedIntent) {
    return 1;
  }
  return 0;
}

function coordinateSearchWeights(rows: RankingTrainingRow[]): RankingWeights {
  let current = { ...DEFAULT_RANKING_WEIGHTS };
  let currentScore = objective(rows, current);
  for (const step of [0.12, 0.08, 0.05, 0.03, 0.015]) {
    let improved = true;
    while (improved) {
      improved = false;
      for (const key of FEATURE_KEYS) {
        for (const direction of [1, -1]) {
          const candidate = normalizeWeights({
            ...current,
            [key]: Math.max(0, current[key] + direction * step),
          });
          const candidateScore = objective(rows, candidate);
          if (candidateScore > currentScore + 0.0001) {
            current = candidate;
            currentScore = candidateScore;
            improved = true;
          }
        }
      }
    }
  }
  return current;
}

function objective(rows: RankingTrainingRow[], weights: RankingWeights): number {
  const metrics = evaluateRankingRows(rows, weights);
  const regularization = FEATURE_KEYS.reduce((sum, key) => sum + Math.abs(weights[key] - DEFAULT_RANKING_WEIGHTS[key]), 0);
  return metrics.ndcgAt5 * 0.45 + metrics.mrr * 0.35 + metrics.top3Recall * 0.2 - regularization * 0.015;
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
