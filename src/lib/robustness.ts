import { normalizeText, stripVietnameseAccents } from './normalize';
import { suggest } from './engine';
import type { EvaluationCase, TascoDataset } from './types';

export interface RobustnessCase {
  caseId: string;
  sourceCaseId: string;
  inputPrefix: string;
  expectedTopSuggestions: string[];
  expectedSuggestionType: string;
  transform: 'accentless' | 'compact' | 'uppercase' | 'spaced' | 'truncated' | 'abbreviation';
}

export interface RobustnessCaseResult {
  caseId: string;
  sourceCaseId: string;
  transform: RobustnessCase['transform'];
  inputPrefix: string;
  expected: string[];
  actual: string[];
  top3Hit: boolean;
  top5Hit: boolean;
  latencyMs: number;
}

export interface RobustnessReport {
  cases: RobustnessCaseResult[];
  summary: {
    total: number;
    top3Recall: number;
    top5Recall: number;
    p95LatencyMs: number;
    byTransform: Record<string, { total: number; top3Recall: number; top5Recall: number }>;
  };
}

export function buildRobustnessCases(dataset: TascoDataset): RobustnessCase[] {
  const cases: RobustnessCase[] = [];
  const seen = new Set<string>();
  for (const evaluationCase of dataset.evaluationCases) {
    const variants = variantsForCase(dataset, evaluationCase);
    for (const variant of variants) {
      const key = `${evaluationCase.caseId}:${variant.transform}:${variant.inputPrefix}`;
      if (seen.has(key) || variant.inputPrefix === evaluationCase.inputPrefix) {
        continue;
      }
      seen.add(key);
      cases.push({
        caseId: `${evaluationCase.caseId}-${variant.transform}`,
        sourceCaseId: evaluationCase.caseId,
        inputPrefix: variant.inputPrefix,
        expectedTopSuggestions: evaluationCase.expectedTopSuggestions,
        expectedSuggestionType: evaluationCase.expectedSuggestionType,
        transform: variant.transform,
      });
    }
  }
  return cases;
}

export function evaluateRobustness(dataset: TascoDataset): RobustnessReport {
  const cases = buildRobustnessCases(dataset).map((robustnessCase): RobustnessCaseResult => {
    const response = suggest(dataset, { q: robustnessCase.inputPrefix, limit: 8, agentic: false });
    const actual = response.suggestions.map((suggestion) => suggestion.text);
    const ranks = robustnessCase.expectedTopSuggestions
      .map((expectedText) => actual.findIndex((actualText) => isExpectedMatch(actualText, expectedText)))
      .filter((index) => index >= 0)
      .map((index) => index + 1);
    const bestRank = ranks.length ? Math.min(...ranks) : 0;
    return {
      caseId: robustnessCase.caseId,
      sourceCaseId: robustnessCase.sourceCaseId,
      transform: robustnessCase.transform,
      inputPrefix: robustnessCase.inputPrefix,
      expected: robustnessCase.expectedTopSuggestions,
      actual,
      top3Hit: bestRank > 0 && bestRank <= 3,
      top5Hit: bestRank > 0 && bestRank <= 5,
      latencyMs: response.latencyMs,
    };
  });
  return {
    cases,
    summary: {
      total: cases.length,
      top3Recall: ratio(cases.filter((item) => item.top3Hit).length, cases.length),
      top5Recall: ratio(cases.filter((item) => item.top5Hit).length, cases.length),
      p95LatencyMs: percentile(cases.map((item) => item.latencyMs), 0.95),
      byTransform: byTransform(cases),
    },
  };
}

function variantsForCase(
  dataset: TascoDataset,
  evaluationCase: EvaluationCase,
): Array<{ inputPrefix: string; transform: RobustnessCase['transform'] }> {
  const input = evaluationCase.inputPrefix;
  const normalized = normalizeText(input);
  const variants: Array<{ inputPrefix: string; transform: RobustnessCase['transform'] }> = [
    { inputPrefix: stripVietnameseAccents(input), transform: 'accentless' },
    { inputPrefix: normalized.replace(/\s+/g, ''), transform: 'compact' },
    { inputPrefix: input.toUpperCase(), transform: 'uppercase' },
    { inputPrefix: input.replace(/\s+/g, '  '), transform: 'spaced' },
  ];
  const truncated = truncateLastToken(normalized);
  if (truncated) {
    variants.push({ inputPrefix: truncated, transform: 'truncated' });
  }
  const abbreviated = abbreviateKnownPhrase(dataset, normalized);
  if (abbreviated) {
    variants.push({ inputPrefix: abbreviated, transform: 'abbreviation' });
  }
  return variants.filter((variant) => normalizeText(variant.inputPrefix).length >= 2);
}

function abbreviateKnownPhrase(dataset: TascoDataset, query: string): string | undefined {
  let current = ` ${query} `;
  let changed = false;
  for (const abbreviation of dataset.abbreviations) {
    const expanded = normalizeText(abbreviation.expandedForm);
    const short = normalizeText(abbreviation.abbreviation);
    if (!expanded || !short || !current.includes(` ${expanded} `)) {
      continue;
    }
    current = current.replace(` ${expanded} `, ` ${short} `);
    changed = true;
  }
  return changed ? current.trim() : undefined;
}

function truncateLastToken(query: string): string | undefined {
  const tokens = query.split(' ').filter(Boolean);
  const last = tokens.at(-1);
  if (!last || last.length <= 3) {
    return undefined;
  }
  return [...tokens.slice(0, -1), last.slice(0, Math.max(2, Math.floor(last.length * 0.65)))].join(' ');
}

function isExpectedMatch(actual: string, expected: string): boolean {
  const normalizedActual = normalizeText(actual);
  const normalizedExpected = normalizeText(expected);
  return normalizedActual.includes(normalizedExpected) || normalizedExpected.includes(normalizedActual);
}

function byTransform(cases: RobustnessCaseResult[]): Record<string, { total: number; top3Recall: number; top5Recall: number }> {
  return cases.reduce<Record<string, { total: number; top3: number; top5: number; top3Recall: number; top5Recall: number }>>(
    (acc, result) => {
      const bucket = acc[result.transform] ?? { total: 0, top3: 0, top5: 0, top3Recall: 0, top5Recall: 0 };
      bucket.total += 1;
      bucket.top3 += result.top3Hit ? 1 : 0;
      bucket.top5 += result.top5Hit ? 1 : 0;
      bucket.top3Recall = ratio(bucket.top3, bucket.total);
      bucket.top5Recall = ratio(bucket.top5, bucket.total);
      acc[result.transform] = bucket;
      return acc;
    },
    {},
  );
}

function percentile(values: number[], quantile: number): number {
  if (!values.length) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1);
  return sorted[index];
}

function ratio(numerator: number, denominator: number): number {
  return denominator ? round(numerator / denominator) : 0;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
