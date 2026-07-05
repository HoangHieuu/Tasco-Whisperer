import { describe, expect, it } from 'vitest';
import { predictQueryCompletions, serializePredictionLanguageModel, trainPredictionLanguageModel } from './predictionLm';
import { expandQuery } from './normalize';
import { testDataset } from './testDataset';
import type { TascoDataset } from './types';

describe('prediction language model', () => {
  it('trains from product corpora without learning public evaluation answers', () => {
    const dataset: TascoDataset = {
      abbreviations: [],
      autocomplete: [],
      pois: [],
      popularQueries: [],
      evaluationCases: [
        {
          caseId: 'PUB999',
          inputPrefix: 'sec',
          expectedSuggestionType: 'POI Suggestions',
          expectedTopSuggestions: ['Secret Eval Only'],
          difficulty: 'Hard',
          skillsTested: 'Leak guard',
        },
      ],
    };

    const model = trainPredictionLanguageModel(dataset);
    const artifact = serializePredictionLanguageModel(model);

    expect(model.phrases.length).toBeGreaterThan(0);
    expect(JSON.stringify(artifact)).not.toContain('Secret Eval Only');
    expect(predictQueryCompletions(dataset, expandQuery('sec', dataset.abbreviations))).toEqual([]);
  });

  it('predicts prefix completions from generated product-language patterns', () => {
    const completions = predictQueryCompletions(testDataset, expandQuery('phong gym m c 2', testDataset.abbreviations));

    expect(completions[0]).toEqual(
      expect.objectContaining({
        text: 'Phòng gym mở cửa 24/7',
        type: 'Discovery Search',
        reason: expect.stringContaining('prefix-completion language model'),
      }),
    );
    expect(completions[0].confidence).toBeGreaterThan(0.5);
  });
});
