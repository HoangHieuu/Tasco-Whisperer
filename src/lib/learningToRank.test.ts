import { describe, expect, it } from 'vitest';
import { activeDefaultRankingWeights, DEFAULT_RANKING_WEIGHTS } from './engine';
import { buildLearningToRankRows, buildPublicEvaluationRankingRows, fitLinearRankingWeights } from './learningToRank';
import { testDataset } from './testDataset';

describe('learning-to-rank baseline', () => {
  it('exports supervised ranking rows from robustness perturbations while holding public eval out', () => {
    const rows = buildLearningToRankRows(testDataset);
    const heldOutRows = buildPublicEvaluationRankingRows(testDataset);

    expect(rows.length).toBeGreaterThan(testDataset.evaluationCases.length);
    expect(heldOutRows.length).toBeGreaterThan(testDataset.evaluationCases.length);
    expect(rows.every((row) => row.caseId.includes('-'))).toBe(true);
    expect(rows.some((row) => row.label === 3)).toBe(true);
    expect(rows[0].features).toEqual(
      expect.objectContaining({
        lexical: expect.any(Number),
        intent: expect.any(Number),
        source: expect.any(Number),
      }),
    );
  });

  it('fits normalized linear ranking weights with a held-out validation split', () => {
    const model = fitLinearRankingWeights(testDataset);
    const totalWeight = Object.values(model.weights).reduce((sum, value) => sum + value, 0);

    expect(model.rows).toBeGreaterThan(0);
    expect(totalWeight).toBeCloseTo(1, 5);
    expect(model.train.total).toBeGreaterThan(0);
    expect(model.validation.total).toBeGreaterThan(0);
    expect(model.validation.top3Recall).toBeGreaterThan(0.8);
  });

  it('loads learned ranking weights as runtime defaults', () => {
    expect(activeDefaultRankingWeights()).not.toEqual(DEFAULT_RANKING_WEIGHTS);
    expect(Object.values(activeDefaultRankingWeights()).reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 5);
  });
});
