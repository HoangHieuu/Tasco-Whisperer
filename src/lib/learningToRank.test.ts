import { describe, expect, it } from 'vitest';
import { buildLearningToRankRows, fitLinearRankingWeights } from './learningToRank';
import { testDataset } from './testDataset';

describe('learning-to-rank baseline', () => {
  it('exports supervised ranking rows from existing public evaluation labels', () => {
    const rows = buildLearningToRankRows(testDataset);

    expect(rows.length).toBeGreaterThan(testDataset.evaluationCases.length);
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
});
