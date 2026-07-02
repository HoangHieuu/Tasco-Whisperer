import { describe, expect, it } from 'vitest';
import { buildDatasetFromCsvs, DATA_FILES } from './dataset';
import { testCsvs } from './testDataset';

describe('buildDatasetFromCsvs', () => {
  it('loads typed records from every required dataset', () => {
    const dataset = buildDatasetFromCsvs(testCsvs);

    expect(dataset.autocomplete).toHaveLength(10);
    expect(dataset.pois).toHaveLength(6);
    expect(dataset.abbreviations).toHaveLength(4);
    expect(dataset.popularQueries).toHaveLength(5);
    expect(dataset.evaluationCases).toHaveLength(2);
    expect(dataset.pois[0]).toMatchObject({
      poiId: 'POI001',
      poiName: 'Highlands Coffee Nguyễn Huệ',
      tags: ['wifi', 'yên tĩnh', 'làm việc', 'takeaway'],
    });
  });

  it('fails fast when a required column is missing', () => {
    const brokenCsvs = {
      ...testCsvs,
      [DATA_FILES.autocomplete]: 'suggestion_id,input_prefix,suggestion_text\nSUG001,vin,Vincom Center\n',
    };

    expect(() => buildDatasetFromCsvs(brokenCsvs)).toThrow(/missing required column.*suggestion_type/);
  });
});
