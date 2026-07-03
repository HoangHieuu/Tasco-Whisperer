import { describe, expect, it } from 'vitest';
import { buildRobustnessCases, evaluateRobustness } from './robustness';
import { testDataset } from './testDataset';

describe('robustness evaluation', () => {
  it('generates metamorphic cases from the provided public evaluation rows', () => {
    const cases = buildRobustnessCases(testDataset);

    expect(cases.length).toBeGreaterThan(0);
    expect(cases).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourceCaseId: 'PUB002', inputPrefix: 'CAFE', transform: 'uppercase' }),
        expect.objectContaining({ sourceCaseId: 'PUB002', inputPrefix: 'ca', transform: 'truncated' }),
      ]),
    );
  });

  it('runs an offline robustness report without requiring outside data', () => {
    const report = evaluateRobustness(testDataset);

    expect(report.summary.total).toBeGreaterThan(0);
    expect(report.summary.top5Recall).toBeGreaterThan(0.6);
    expect(report.summary.byTransform).toHaveProperty('uppercase');
    expect(report.summary.byTransform).toHaveProperty('truncated');
  });
});
