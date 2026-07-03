import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { loadDatasetFromDisk } from './loadDataset';
import { evaluateRobustness } from '../src/lib/robustness';

const report = evaluateRobustness(loadDatasetFromDisk());
const jsonPath = 'reports/robustness/latest.json';
const markdownPath = 'reports/robustness/latest.md';

mkdirSync(dirname(jsonPath), { recursive: true });
writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(markdownPath, markdownReport(report));

console.log('Tasco Whisperer robustness evaluation');
console.log(`cases: ${report.summary.total}`);
console.log(`top3_recall: ${percent(report.summary.top3Recall)}`);
console.log(`top5_recall: ${percent(report.summary.top5Recall)}`);
console.log(`p95_latency_ms: ${report.summary.p95LatencyMs}`);
console.log(`reports: ${jsonPath}, ${markdownPath}`);

function markdownReport(currentReport: typeof report): string {
  const rows = Object.entries(currentReport.summary.byTransform)
    .map(
      ([transform, value]) =>
        `| ${transform} | ${value.total} | ${percent(value.top3Recall)} | ${percent(value.top5Recall)} |`,
    )
    .join('\n');
  const misses = currentReport.cases
    .filter((result) => !result.top3Hit)
    .slice(0, 20)
    .map(
      (result) =>
        `- ${result.caseId} (${result.transform}, \`${result.inputPrefix}\`): expected ${result.expected.join(' | ')}, got ${result.actual.slice(0, 5).join(' | ')}`,
    )
    .join('\n');

  return `# Robustness Evaluation Report

Generated: ${new Date().toISOString()}

This report is generated only from the provided hackathon CSVs. It adds
metamorphic variants such as accentless, compact, uppercase, spacing,
truncated-prefix, and abbreviation forms to reduce overfitting to the 60 public
rows without importing any outside dataset.

## Summary

- Cases: ${currentReport.summary.total}
- Top-3 recall: ${percent(currentReport.summary.top3Recall)}
- Top-5 recall: ${percent(currentReport.summary.top5Recall)}
- P95 latency: ${currentReport.summary.p95LatencyMs} ms

| Transform | Cases | Top-3 | Top-5 |
| --- | ---: | ---: | ---: |
${rows}

## Top-3 Misses

${misses || '- none'}
`;
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1).replace(/\.0$/, '')}%`;
}
