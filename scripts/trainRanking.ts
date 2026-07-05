import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseBehaviorEvents } from './behaviorStore';
import { loadDatasetFromDisk } from './loadDataset';
import { buildBehaviorRankingRows, buildLearningToRankRows, fitLinearRankingWeights } from '../src/lib/learningToRank';

const args = new Map(
  process.argv.slice(2).flatMap((arg, index, allArgs) => {
    if (!arg.startsWith('--')) return [];
    const key = arg.slice(2);
    const next = allArgs[index + 1];
    return [[key, next && !next.startsWith('--') ? next : 'true']];
  }),
);

const dataset = loadDatasetFromDisk();
const behaviorPath = args.get('behaviorLogPath') ?? process.env.TASCO_BEHAVIOR_LOG_PATH ?? 'data/behavior-events.local.json';
const behaviorEvents = existsSync(behaviorPath) ? parseBehaviorEvents(readFileSync(behaviorPath, 'utf8')) : [];
const model = fitLinearRankingWeights(dataset, behaviorEvents);
const robustnessRows = buildLearningToRankRows(dataset, 12, []).length;
const behaviorRows = buildBehaviorRankingRows(dataset, behaviorEvents).length;
const configPath = args.get('config') ?? 'config/ranking-weights.json';
const jsonPath = 'reports/learning-to-rank/latest.json';
const markdownPath = 'reports/learning-to-rank/latest.md';
const config = {
  version: 1,
  model: 'pairwise-logistic-linear',
  weights: model.weights,
  train: model.train,
  validation: model.validation,
  rows: model.rows,
  trainingRows: {
    robustness: robustnessRows,
    behavior: behaviorRows,
  },
  behaviorLogPath: behaviorPath,
  note: model.note,
};

mkdirSync(dirname(jsonPath), { recursive: true });
mkdirSync(dirname(configPath), { recursive: true });
writeFileSync(jsonPath, `${JSON.stringify(model, null, 2)}\n`);
writeFileSync(markdownPath, markdownReport(model));
writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

console.log('Tasco Whisperer pairwise learning-to-rank');
console.log(`rows: ${model.rows}`);
console.log(`robustness_rows: ${robustnessRows}`);
console.log(`behavior_rows: ${behaviorRows}`);
console.log(`train_top3: ${percent(model.train.top3Recall)}`);
console.log(`validation_top3: ${percent(model.validation.top3Recall)}`);
console.log(`validation_ndcg_at_5: ${model.validation.ndcgAt5}`);
console.log(`runtime_config: ${configPath}`);
console.log(`reports: ${jsonPath}, ${markdownPath}`);

function markdownReport(currentModel: typeof model): string {
  return `# Pairwise Learning-To-Rank Report

Generated: ${new Date().toISOString()}

This is a dependency-free pairwise logistic learning-to-rank model over the
existing transparent score factors. It trains on metamorphic robustness
perturbations plus optional server-side behavior selections, while the public
evaluation rows are held out for validation.

- Runtime config: \`${configPath}\`
- Robustness rows: ${robustnessRows}
- Behavior rows: ${behaviorRows}
- Behavior log: \`${behaviorPath}\`

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
