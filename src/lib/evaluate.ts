import { normalizeText } from './normalize';
import { suggest } from './engine';
import type { EvaluationCase, IntentType, SuggestRequest, TascoDataset } from './types';

export interface EvaluationCaseResult {
  caseId: string;
  inputPrefix: string;
  difficulty: EvaluationCase['difficulty'];
  expectedIntentType: IntentType;
  predictedIntentType: IntentType;
  expected: string[];
  actual: string[];
  reciprocalRank: number;
  intentHit: boolean;
  top1Hit: boolean;
  top3Hit: boolean;
  top5Hit: boolean;
  latencyMs: number;
}

export interface EvaluationReport {
  cases: EvaluationCaseResult[];
  summary: {
    total: number;
    top1Accuracy: number;
    top3Recall: number;
    top5Recall: number;
    intentAccuracy: number;
    mrr: number;
    averageLatencyMs: number;
    p95LatencyMs: number;
    maxLatencyMs: number;
    byDifficulty: Record<string, { total: number; top3Recall: number }>;
    byExpectedType: Record<string, { total: number; intentAccuracy: number; top3Recall: number }>;
  };
}

export interface EvaluationOptions {
  limit?: number;
  request?: Omit<Partial<SuggestRequest>, 'q' | 'limit'>;
}

export function evaluateDataset(dataset: TascoDataset, options: EvaluationOptions = {}): EvaluationReport {
  const cases = dataset.evaluationCases.map((evaluationCase) => evaluateCase(dataset, evaluationCase, options));
  return {
    cases,
    summary: {
      total: cases.length,
      top1Accuracy: ratio(cases.filter((result) => result.top1Hit).length, cases.length),
      top3Recall: ratio(cases.filter((result) => result.top3Hit).length, cases.length),
      top5Recall: ratio(cases.filter((result) => result.top5Hit).length, cases.length),
      intentAccuracy: ratio(cases.filter((result) => result.intentHit).length, cases.length),
      mrr: average(cases.map((result) => result.reciprocalRank)),
      averageLatencyMs: average(cases.map((result) => result.latencyMs)),
      p95LatencyMs: percentile(cases.map((result) => result.latencyMs), 0.95),
      maxLatencyMs: Math.max(...cases.map((result) => result.latencyMs)),
      byDifficulty: byDifficulty(cases),
      byExpectedType: byExpectedType(cases),
    },
  };
}

function evaluateCase(dataset: TascoDataset, evaluationCase: EvaluationCase, options: EvaluationOptions): EvaluationCaseResult {
  const response = suggest(dataset, { ...options.request, q: evaluationCase.inputPrefix, limit: options.limit ?? 8 });
  const actual = response.suggestions.map((suggestion) => suggestion.text);
  const expected = evaluationCase.expectedTopSuggestions;
  const expectedIntentType = normalizeExpectedIntent(evaluationCase.expectedSuggestionType);
  const ranks = expected
    .map((expectedText) => actual.findIndex((actualText) => isExpectedMatch(actualText, expectedText)))
    .filter((index) => index >= 0)
    .map((index) => index + 1);
  const bestRank = ranks.length ? Math.min(...ranks) : 0;

  return {
    caseId: evaluationCase.caseId,
    inputPrefix: evaluationCase.inputPrefix,
    difficulty: evaluationCase.difficulty,
    expectedIntentType,
    predictedIntentType: response.intent.type,
    expected,
    actual,
    reciprocalRank: bestRank ? 1 / bestRank : 0,
    intentHit: response.intent.type === expectedIntentType,
    top1Hit: bestRank === 1,
    top3Hit: bestRank > 0 && bestRank <= 3,
    top5Hit: bestRank > 0 && bestRank <= 5,
    latencyMs: response.latencyMs,
  };
}

function normalizeExpectedIntent(value: string): IntentType {
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

function byExpectedType(cases: EvaluationCaseResult[]): Record<string, { total: number; intentAccuracy: number; top3Recall: number }> {
  return cases.reduce<Record<string, { total: number; intentHits: number; top3: number; intentAccuracy: number; top3Recall: number }>>(
    (acc, result) => {
      const bucket = acc[result.expectedIntentType] ?? { total: 0, intentHits: 0, top3: 0, intentAccuracy: 0, top3Recall: 0 };
      bucket.total += 1;
      bucket.intentHits += result.intentHit ? 1 : 0;
      bucket.top3 += result.top3Hit ? 1 : 0;
      bucket.intentAccuracy = ratio(bucket.intentHits, bucket.total);
      bucket.top3Recall = ratio(bucket.top3, bucket.total);
      acc[result.expectedIntentType] = bucket;
      return acc;
    },
    {},
  );
}

function byDifficulty(cases: EvaluationCaseResult[]): Record<string, { total: number; top3Recall: number }> {
  return cases.reduce<Record<string, { total: number; top3: number; top3Recall: number }>>((acc, result) => {
    const bucket = acc[result.difficulty] ?? { total: 0, top3: 0, top3Recall: 0 };
    bucket.total += 1;
    bucket.top3 += result.top3Hit ? 1 : 0;
    bucket.top3Recall = ratio(bucket.top3, bucket.total);
    acc[result.difficulty] = bucket;
    return acc;
  }, {});
}

function percentile(values: number[], quantile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1);
  return sorted[index];
}

function average(values: number[]): number {
  return values.length ? round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
}

function ratio(numerator: number, denominator: number): number {
  return denominator ? round(numerator / denominator) : 0;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
