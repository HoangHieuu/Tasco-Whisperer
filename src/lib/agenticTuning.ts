import { evaluateDataset, type EvaluationCaseResult, type EvaluationReport } from './evaluate';
import { normalizeText } from './normalize';
import { suggest } from './engine';
import type { IntentType, SuggestResponse, TascoDataset } from './types';

export type TuningProposalType =
  | 'intent-rule'
  | 'ranking-weight'
  | 'semantic-template'
  | 'alias'
  | 'evaluation-watch';

export interface TuningWeakCase {
  caseId: string;
  inputPrefix: string;
  difficulty: EvaluationCaseResult['difficulty'];
  expectedIntentType: IntentType;
  predictedIntentType: IntentType;
  expected: string[];
  actual: string[];
  failureReasons: string[];
  topSuggestion?: {
    text: string;
    type: IntentType;
    source: SuggestResponse['suggestions'][number]['source'];
    score: number;
    reason: string;
    factors: SuggestResponse['suggestions'][number]['metadata']['factors'];
  };
  diagnostics: {
    entities: SuggestResponse['diagnostics']['entities'];
    agentic: SuggestResponse['diagnostics']['agentic'];
    candidateCount: number;
    latencyMs: number;
  };
}

export interface TuningProposal {
  id: string;
  type: TuningProposalType;
  title: string;
  rationale: string;
  confidence: number;
  affectedCaseIds: string[];
  evidence: string[];
  proposedChange: Record<string, unknown>;
  requiresAcceptance: true;
}

export interface AgenticTuningReport {
  generatedAt: string;
  baseline: EvaluationReport['summary'];
  weakCases: TuningWeakCase[];
  proposals: TuningProposal[];
  notes: string[];
}

export function buildAgenticTuningReport(dataset: TascoDataset, generatedAt = new Date().toISOString()): AgenticTuningReport {
  const evaluation = evaluateDataset(dataset);
  const weakCases = evaluation.cases
    .filter((result) => !result.top1Hit || !result.intentHit || !result.top3Hit)
    .map((result) => enrichWeakCase(dataset, result));
  const proposals = buildTuningProposals(dataset, weakCases);

  return {
    generatedAt,
    baseline: evaluation.summary,
    weakCases,
    proposals,
    notes: [
      'This report is advisory. Proposals require developer acceptance before code or config changes.',
      'The deterministic autocomplete path remains the runtime source of truth.',
    ],
  };
}

function enrichWeakCase(dataset: TascoDataset, result: EvaluationCaseResult): TuningWeakCase {
  const response = suggest(dataset, { q: result.inputPrefix, limit: 8 });
  const top = response.suggestions[0];
  return {
    caseId: result.caseId,
    inputPrefix: result.inputPrefix,
    difficulty: result.difficulty,
    expectedIntentType: result.expectedIntentType,
    predictedIntentType: result.predictedIntentType,
    expected: result.expected,
    actual: result.actual,
    failureReasons: failureReasons(result),
    topSuggestion: top
      ? {
          text: top.text,
          type: top.type,
          source: top.source,
          score: top.score,
          reason: top.metadata.reason,
          factors: top.metadata.factors,
        }
      : undefined,
    diagnostics: {
      entities: response.diagnostics.entities,
      agentic: response.diagnostics.agentic,
      candidateCount: response.diagnostics.candidateCount,
      latencyMs: response.latencyMs,
    },
  };
}

function failureReasons(result: EvaluationCaseResult): string[] {
  const reasons: string[] = [];
  if (!result.intentHit) {
    reasons.push(`intent mismatch: expected ${result.expectedIntentType}, predicted ${result.predictedIntentType}`);
  }
  if (!result.top1Hit) {
    reasons.push('expected suggestion was not ranked first');
  }
  if (!result.top3Hit) {
    reasons.push('expected suggestion missed top 3');
  }
  return reasons;
}

function buildTuningProposals(dataset: TascoDataset, weakCases: TuningWeakCase[]): TuningProposal[] {
  return [
    ...intentMismatchProposal(weakCases),
    ...rankingWeightProposal(weakCases),
    ...semanticTemplateProposals(dataset, weakCases),
    ...aliasProposals(dataset, weakCases),
    ...evaluationWatchProposal(weakCases),
  ];
}

function intentMismatchProposal(weakCases: TuningWeakCase[]): TuningProposal[] {
  const intentMisses = weakCases.filter((weakCase) => weakCase.expectedIntentType !== weakCase.predictedIntentType);
  if (intentMisses.length === 0) {
    return [];
  }
  const grouped = groupBy(intentMisses, (weakCase) => `${weakCase.expectedIntentType}<- ${weakCase.predictedIntentType}`);
  const [key, cases] = [...grouped.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  const [expectedIntent, predictedIntent] = key.split('<-').map((part) => part.trim()) as [IntentType, IntentType];
  return [
    {
      id: 'intent-rebalance-highest-mismatch',
      type: 'intent-rule',
      title: `Review ${predictedIntent} cases that should be ${expectedIntent}`,
      rationale: `${cases.length} weak cases share the same intent mismatch pattern.`,
      confidence: Math.min(0.9, 0.48 + cases.length * 0.04),
      affectedCaseIds: cases.map((weakCase) => weakCase.caseId),
      evidence: cases.slice(0, 5).map((weakCase) => `${weakCase.caseId}: "${weakCase.inputPrefix}"`),
      proposedChange: {
        expectedIntent,
        currentPredictedIntent: predictedIntent,
        action: 'inspect entity and template votes before changing runtime intent rules',
      },
      requiresAcceptance: true,
    },
  ];
}

function rankingWeightProposal(weakCases: TuningWeakCase[]): TuningProposal[] {
  const rankingCases = weakCases.filter((weakCase) => weakCase.actual.some((actual) => containsAnyExpected(actual, weakCase.expected)));
  if (rankingCases.length === 0) {
    return [];
  }
  return [
    {
      id: 'ranking-promote-expected-present',
      type: 'ranking-weight',
      title: 'Review ranking weights where expected suggestions are present but not first',
      rationale: `${rankingCases.length} cases retrieved an expected suggestion but ranked another candidate first.`,
      confidence: Math.min(0.88, 0.5 + rankingCases.length * 0.025),
      affectedCaseIds: rankingCases.map((weakCase) => weakCase.caseId),
      evidence: rankingCases
        .slice(0, 5)
        .map((weakCase) => `${weakCase.caseId}: expected [${weakCase.expected.join(' | ')}], got [${weakCase.actual.slice(0, 3).join(' | ')}]`),
      proposedChange: {
        action: 'compare lexical, intent, source, popularity, and diversity factors for expected-present cases',
        guardrail: 'do not lower top3/top5 recall while improving top1',
      },
      requiresAcceptance: true,
    },
  ];
}

function semanticTemplateProposals(dataset: TascoDataset, weakCases: TuningWeakCase[]): TuningProposal[] {
  const top3Misses = weakCases.filter((weakCase) => weakCase.failureReasons.some((reason) => reason.includes('missed top 3')));
  const grounded = top3Misses.filter((weakCase) => hasDatasetEvidence(dataset, weakCase));
  if (grounded.length === 0) {
    return [];
  }
  return [
    {
      id: 'semantic-template-grounded-misses',
      type: 'semantic-template',
      title: 'Consider semantic templates for grounded top-3 misses',
      rationale: `${grounded.length} top-3 misses have expected terms that appear in provided datasets.`,
      confidence: Math.min(0.82, 0.45 + grounded.length * 0.05),
      affectedCaseIds: grounded.map((weakCase) => weakCase.caseId),
      evidence: grounded.slice(0, 5).map((weakCase) => groundedEvidence(dataset, weakCase)),
      proposedChange: {
        action: 'add or tune templates only for expected terms backed by POI, autocomplete, or popular-query rows',
        examples: grounded.slice(0, 3).map((weakCase) => ({ inputPrefix: weakCase.inputPrefix, expected: weakCase.expected })),
      },
      requiresAcceptance: true,
    },
  ];
}

function aliasProposals(dataset: TascoDataset, weakCases: TuningWeakCase[]): TuningProposal[] {
  const aliasCandidates = weakCases.filter((weakCase) => {
    const compactInput = compact(weakCase.inputPrefix);
    return compactInput.length >= 4 && weakCase.expected.some((expected) => compact(expected).startsWith(compactInput));
  });
  const grounded = aliasCandidates.filter((weakCase) => hasDatasetEvidence(dataset, weakCase));
  if (grounded.length === 0) {
    return [];
  }
  return [
    {
      id: 'alias-memory-candidates',
      type: 'alias',
      title: 'Promote repeated compact or typo forms into alias-memory candidates',
      rationale: `${grounded.length} weak cases look like compact prefixes or typo variants of expected dataset terms.`,
      confidence: Math.min(0.86, 0.5 + grounded.length * 0.05),
      affectedCaseIds: grounded.map((weakCase) => weakCase.caseId),
      evidence: grounded
        .slice(0, 5)
        .map((weakCase) => `${weakCase.caseId}: "${weakCase.inputPrefix}" can map toward "${weakCase.expected[0] ?? 'expected suggestion'}"`),
      proposedChange: {
        action: 'create candidate alias-memory records for developer review',
        candidates: grounded.slice(0, 5).map((weakCase) => ({
          rawQuery: weakCase.inputPrefix,
          rewrite: weakCase.expected[0],
          expectedIntent: weakCase.expectedIntentType,
        })),
      },
      requiresAcceptance: true,
    },
  ];
}

function evaluationWatchProposal(weakCases: TuningWeakCase[]): TuningProposal[] {
  const hardCases = weakCases.filter((weakCase) => weakCase.difficulty === 'Hard');
  if (hardCases.length === 0) {
    return [];
  }
  return [
    {
      id: 'watch-hard-cases',
      type: 'evaluation-watch',
      title: 'Track hard-case failures separately during tuning',
      rationale: `${hardCases.length} weak cases are marked Hard and should remain visible during ranking or alias changes.`,
      confidence: 0.72,
      affectedCaseIds: hardCases.map((weakCase) => weakCase.caseId),
      evidence: hardCases.slice(0, 5).map((weakCase) => `${weakCase.caseId}: ${weakCase.failureReasons.join('; ')}`),
      proposedChange: {
        action: 'preserve a hard-case watchlist in future before/after reports',
      },
      requiresAcceptance: true,
    },
  ];
}

function hasDatasetEvidence(dataset: TascoDataset, weakCase: TuningWeakCase): boolean {
  return weakCase.expected.some((expected) => datasetEvidenceRows(dataset, expected).length > 0);
}

function groundedEvidence(dataset: TascoDataset, weakCase: TuningWeakCase): string {
  const expected = weakCase.expected.find((item) => datasetEvidenceRows(dataset, item).length > 0) ?? weakCase.expected[0] ?? '';
  const rows = datasetEvidenceRows(dataset, expected).slice(0, 3);
  return `${weakCase.caseId}: "${expected}" appears in ${rows.join(', ')}`;
}

function datasetEvidenceRows(dataset: TascoDataset, term: string): string[] {
  const normalizedTerm = normalizeText(term);
  if (!normalizedTerm) return [];
  const rows: string[] = [];
  if (dataset.autocomplete.some((row) => includesEither(row.suggestionText, normalizedTerm) || includesEither(row.inputPrefix, normalizedTerm))) {
    rows.push('autocomplete');
  }
  if (
    dataset.pois.some((row) =>
      [row.poiName, row.category, row.brand, row.address, row.city, ...row.tags].some((value) => includesEither(value, normalizedTerm)),
    )
  ) {
    rows.push('poi');
  }
  if (dataset.popularQueries.some((row) => includesEither(row.queryText, normalizedTerm) || includesEither(row.region, normalizedTerm))) {
    rows.push('popular-query');
  }
  if (dataset.abbreviations.some((row) => includesEither(row.abbreviation, normalizedTerm) || includesEither(row.expandedForm, normalizedTerm))) {
    rows.push('abbreviation');
  }
  return rows;
}

function includesEither(value: string, normalizedTerm: string): boolean {
  const normalizedValue = normalizeText(value);
  if (!normalizedValue) return false;
  return normalizedValue.includes(normalizedTerm) || normalizedTerm.includes(normalizedValue);
}

function containsAnyExpected(actual: string, expected: string[]): boolean {
  const normalizedActual = normalizeText(actual);
  return expected.some((expectedText) => {
    const normalizedExpected = normalizeText(expectedText);
    return normalizedActual.includes(normalizedExpected) || normalizedExpected.includes(normalizedActual);
  });
}

function compact(value: string): string {
  return normalizeText(value).replace(/\s+/g, '');
}

function groupBy<T>(items: T[], keyFor: (item: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFor(item);
    grouped.set(key, [...(grouped.get(key) ?? []), item]);
  }
  return grouped;
}
