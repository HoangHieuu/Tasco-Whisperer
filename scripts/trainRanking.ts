import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { loadDatasetFromDisk } from './loadDataset';
import { fitLinearRankingWeights } from '../src/lib/learningToRank';

const model = fitLinearRankingWeights(loadDatasetFromDisk());
const jsonPath = 'reports/learning-to-rank/latest.json';
const markdownPath = 'reports/learning-to-rank/latest.md';

mkdirSync(dirname(jsonPath), { recursive: true });
writeFileSync(jsonPath, `${JSON.stringify(model, null, 2)}\n`);
writeFileSync(markdownPath, markdownReport(model));

console.log('Tasco Whisperer learning-to-rank baseline');
console.log(`rows: ${model.rows}`);
console.log(`train_top3: ${percent(model.train.top3Recall)}`);
console.log(`validation_top3: ${percent(model.validation.top3Recall)}`);
console.log(`validation_ndcg_at_5: ${model.validation.ndcgAt5}`);
console.log(`reports: ${jsonPath}, ${markdownPath}`);

function markdownReport(currentModel: typeof model): string {
  return `# Learning-To-Rank Baseline Report

Generated: ${new Date().toISOString()}

This is a dependency-free linear learning-to-rank baseline over the existing
transparent score factors. It is useful as a training-ready path and regression
guard, not as a production ML-ranker claim while labels are limited to the
provided hackathon evaluation rows.

## Metrics

| Split | Cases | Top-1 | Top-3 | MRR | NDCG@5 |
| --- | ---: | ---: | ---: | ---: | ---: |
| train | ${currentModel.train.total} | ${percent(currentModel.train.top1Accuracy)} | ${percent(currentModel.train.top3Recall)} | ${currentModel.train.mrr} | ${currentModel.train.ndcgAt5} |
| validation | ${currentModel.validation.total} | ${percent(currentModel.validation.top1Accuracy)} | ${percent(currentModel.validation.top3Recall)} | ${currentModel.validation.mrr} | ${currentModel.validation.ndcgAt5} |

## Learned Weights

\`\`\`json
${JSON.stringify(currentModel.weights, null, 2)}
\`\`\`

## Note

${currentModel.note}
`;
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1).replace(/\.0$/, '')}%`;
}
