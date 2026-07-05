import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildDatasetFromCsvs, DATA_FILES, type DatasetCsvText } from '../src/lib/dataset';
import { evaluateDatasetAsync } from '../src/lib/evaluate';
import { createSemanticRuntimeProvider, defaultSemanticArtifactPath } from '../src/lib/semanticRuntime';

const root = process.cwd();
const dataDir = join(root, 'data');
const artifactPath = process.env.TASCO_SEMANTIC_ARTIFACT ?? defaultSemanticArtifactPath(root);

const csvs = Object.fromEntries(
  Object.values(DATA_FILES).map((fileName) => [fileName, readFileSync(join(dataDir, fileName), 'utf8')]),
) as DatasetCsvText;

const dataset = buildDatasetFromCsvs(csvs);
const semanticProvider = createSemanticRuntimeProvider(dataset, {
  artifactPath,
  model: process.env.TASCO_EMBEDDING_MODEL,
});
const report = await evaluateDatasetAsync(dataset, {
  request: { agentic: false },
  runtime: { embeddingProvider: semanticProvider },
});

console.log('Tasco Whisperer MiniLM evaluation');
console.log(`artifact: ${artifactPath}`);
console.log(`cases: ${report.summary.total}`);
console.log(`top1_accuracy: ${formatPercent(report.summary.top1Accuracy)}`);
console.log(`top3_recall: ${formatPercent(report.summary.top3Recall)}`);
console.log(`top5_recall: ${formatPercent(report.summary.top5Recall)}`);
console.log(`intent_accuracy: ${formatPercent(report.summary.intentAccuracy)}`);
console.log(`mrr: ${report.summary.mrr.toFixed(3)}`);
console.log(`avg_latency_ms: ${report.summary.averageLatencyMs.toFixed(1)}`);
console.log(`p95_latency_ms: ${report.summary.p95LatencyMs}`);
console.log(`max_latency_ms: ${report.summary.maxLatencyMs}`);
console.log(`embedding_provider: ${providerSummary()}`);
console.log(`embedding_degraded_cases: ${report.cases.filter((result) => result.embeddingDegraded).length}`);

console.log('\nby expected type');
for (const [type, stats] of Object.entries(report.summary.byExpectedType).sort(([a], [b]) => a.localeCompare(b))) {
  console.log(
    `${type}: ${stats.total} cases, intent ${formatPercent(stats.intentAccuracy)}, top3 ${formatPercent(stats.top3Recall)}`,
  );
}

const failures = report.cases.filter((result) => !result.top3Hit || !result.intentHit).slice(0, 10);
if (failures.length > 0) {
  console.log('\nfirst misses');
  for (const failure of failures) {
    console.log(
      `${failure.caseId} "${failure.inputPrefix}" expected ${failure.expectedIntentType} [${failure.expected.join(
        ' | ',
      )}] got ${failure.predictedIntentType} [${failure.actual.slice(0, 5).join(' | ')}]`,
    );
  }
}

function providerSummary(): string {
  const counts = new Map<string, number>();
  for (const result of report.cases) {
    counts.set(result.embeddingProvider ?? 'none', (counts.get(result.embeddingProvider ?? 'none') ?? 0) + 1);
  }
  return [...counts.entries()].map(([provider, count]) => `${provider}:${count}`).join(', ');
}

function formatPercent(value: number): string {
  return `${Math.round(value * 1000) / 10}%`;
}
