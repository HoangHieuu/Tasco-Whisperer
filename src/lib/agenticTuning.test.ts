import { describe, expect, it } from 'vitest';
import { buildAgenticTuningReport } from './agenticTuning';
import { testDataset } from './testDataset';
import type { TascoDataset } from './types';

describe('agentic evaluation and tuning report', () => {
  it('summarizes the evaluation baseline and weak cases', () => {
    const report = buildAgenticTuningReport(datasetWithWeakCases(), '2026-07-03T00:00:00.000Z');

    expect(report.generatedAt).toBe('2026-07-03T00:00:00.000Z');
    expect(report.baseline.total).toBe(4);
    expect(report.weakCases.length).toBeGreaterThan(0);
    expect(report.notes.join(' ')).toContain('require developer acceptance');

    expect(report.weakCases[0]).toEqual(
      expect.objectContaining({
        caseId: expect.any(String),
        inputPrefix: expect.any(String),
        expectedIntentType: expect.any(String),
        predictedIntentType: expect.any(String),
        failureReasons: expect.arrayContaining([expect.any(String)]),
        diagnostics: expect.objectContaining({
          candidateCount: expect.any(Number),
          latencyMs: expect.any(Number),
          agentic: expect.objectContaining({ reason: expect.any(String) }),
        }),
      }),
    );
  });

  it('generates advisory proposals grounded in dataset evidence', () => {
    const report = buildAgenticTuningReport(datasetWithWeakCases(), '2026-07-03T00:00:00.000Z');

    expect(report.proposals.length).toBeGreaterThan(0);
    for (const proposal of report.proposals) {
      expect(proposal.requiresAcceptance).toBe(true);
      expect(proposal.affectedCaseIds.length).toBeGreaterThan(0);
      expect(proposal.evidence.length).toBeGreaterThan(0);
      expect(proposal.proposedChange).toEqual(expect.any(Object));
      expect(proposal.confidence).toBeGreaterThanOrEqual(0);
      expect(proposal.confidence).toBeLessThanOrEqual(1);
    }

    expect(report.proposals.map((proposal) => proposal.type)).toEqual(
      expect.arrayContaining(['ranking-weight', 'semantic-template']),
    );
    expect(report.proposals.flatMap((proposal) => proposal.evidence).join(' ')).toContain('autocomplete');
  });
});

function datasetWithWeakCases(): TascoDataset {
  return {
    ...testDataset,
    evaluationCases: [
      ...testDataset.evaluationCases,
      {
        caseId: 'WEAK001',
        inputPrefix: 'capherang',
        expectedSuggestionType: 'Category Suggestions',
        expectedTopSuggestions: ['Quán cà phê gần đây'],
        difficulty: 'Hard',
        skillsTested: 'Agentic Failure Analysis; Semantic Template',
      },
      {
        caseId: 'WEAK002',
        inputPrefix: 'vin',
        expectedSuggestionType: 'POI Suggestions',
        expectedTopSuggestions: ['Vinmec'],
        difficulty: 'Medium',
        skillsTested: 'Ranking; Intent Analysis',
      },
    ],
  };
}
