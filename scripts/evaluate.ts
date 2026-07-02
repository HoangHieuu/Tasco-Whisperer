import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildDatasetFromCsvs, DATA_FILES, type DatasetCsvText } from '../src/lib/dataset';
import { evaluateDataset } from '../src/lib/evaluate';

const root = process.cwd();
const dataDir = join(root, 'data');

const csvs = Object.fromEntries(
  Object.values(DATA_FILES).map((fileName) => [fileName, readFileSync(join(dataDir, fileName), 'utf8')]),
) as DatasetCsvText;

const dataset = buildDatasetFromCsvs(csvs);
const report = evaluateDataset(dataset);

console.log('Tasco Whisperer public evaluation');
console.log(`cases: ${report.summary.total}`);
console.log(`top1_accuracy: ${formatPercent(report.summary.top1Accuracy)}`);
console.log(`top3_recall: ${formatPercent(report.summary.top3Recall)}`);
console.log(`top5_recall: ${formatPercent(report.summary.top5Recall)}`);
console.log(`intent_accuracy: ${formatPercent(report.summary.intentAccuracy)}`);
console.log(`mrr: ${report.summary.mrr.toFixed(3)}`);
console.log(`avg_latency_ms: ${report.summary.averageLatencyMs.toFixed(1)}`);
console.log(`p95_latency_ms: ${report.summary.p95LatencyMs}`);
console.log(`max_latency_ms: ${report.summary.maxLatencyMs}`);

console.log('\nby difficulty');
for (const [difficulty, stats] of Object.entries(report.summary.byDifficulty)) {
  console.log(`${difficulty}: ${stats.total} cases, top3 ${formatPercent(stats.top3Recall)}`);
}

console.log('\nby expected type');
for (const [type, stats] of Object.entries(report.summary.byExpectedType).sort(([a], [b]) => a.localeCompare(b))) {
  console.log(
    `${type}: ${stats.total} cases, intent ${formatPercent(stats.intentAccuracy)}, top3 ${formatPercent(stats.top3Recall)}`,
  );
}

const failures = report.cases.filter((result) => !result.top3Hit).slice(0, 10);
if (failures.length > 0) {
  console.log('\nfirst top3 misses');
  for (const failure of failures) {
    console.log(
      `${failure.caseId} "${failure.inputPrefix}" expected [${failure.expected.join(' | ')}] got [${failure.actual
        .slice(0, 5)
        .join(' | ')}]`,
    );
  }
}

function formatPercent(value: number): string {
  return `${Math.round(value * 1000) / 10}%`;
}
