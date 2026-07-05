import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  serializePredictionLanguageModel,
  trainPredictionLanguageModel,
} from '../src/lib/predictionLm';
import { loadDatasetFromDisk } from './loadDataset';

const args = new Map(
  process.argv.slice(2).flatMap((arg, index, allArgs) => {
    if (!arg.startsWith('--')) return [];
    const key = arg.slice(2);
    const next = allArgs[index + 1];
    return [[key, next && !next.startsWith('--') ? next : 'true']];
  }),
);

const output = args.get('out') ?? 'data/prediction-lm.json';
const dataset = loadDatasetFromDisk();
const model = trainPredictionLanguageModel(dataset);
const artifact = serializePredictionLanguageModel(model);

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(artifact, null, 2)}\n`);

console.log(`prediction_lm_artifact: ${output}`);
console.log(`phrases: ${model.phrases.length}`);
