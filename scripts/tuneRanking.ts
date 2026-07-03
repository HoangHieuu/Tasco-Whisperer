import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_RANKING_WEIGHTS } from '../src/lib/engine';
import { buildDatasetFromCsvs, DATA_FILES, type DatasetCsvText } from '../src/lib/dataset';
import { evaluateDataset, type EvaluationReport } from '../src/lib/evaluate';
import type { RankingWeights } from '../src/lib/types';

interface RankingPreset {
  name: string;
  description: string;
  weights: Partial<RankingWeights>;
}

interface RankingRun {
  name: string;
  description: string;
  weights: RankingWeights;
  summary: EvaluationReport['summary'];
}

const presets: RankingPreset[] = [
  {
    name: 'default-v1',
    description: 'Current transparent scoring formula from SPEC.md.',
    weights: DEFAULT_RANKING_WEIGHTS,
  },
  {
    name: 'lexical-intent-heavy',
    description: 'Prioritizes prefix fit and predicted intent for short typeahead prefixes.',
    weights: {
      lexical: 0.38,
      intent: 0.24,
      source: 0.12,
      popularity: 0.08,
      poiQuality: 0.06,
      locality: 0.04,
      personalization: 0.03,
      diversity: 0.05,
    },
  },
  {
    name: 'semantic-diverse',
    description: 'Gives more room to semantic and embedding sources through source and diversity factors.',
    weights: {
      lexical: 0.24,
      intent: 0.18,
      source: 0.2,
      popularity: 0.08,
      poiQuality: 0.08,
      locality: 0.04,
      personalization: 0.04,
      diversity: 0.14,
    },
  },
  {
    name: 'popularity-quality',
    description: 'Favors popular queries and higher quality POIs for broad ambiguous inputs.',
    weights: {
      lexical: 0.24,
      intent: 0.18,
      source: 0.12,
      popularity: 0.18,
      poiQuality: 0.14,
      locality: 0.05,
      personalization: 0.04,
      diversity: 0.05,
    },
  },
];

const root = process.cwd();
const dataDir = join(root, 'data');
const reportsDir = join(root, 'reports', 'ranking-tuning');

const csvs = Object.fromEntries(
  Object.values(DATA_FILES).map((fileName) => [fileName, readFileSync(join(dataDir, fileName), 'utf8')]),
) as DatasetCsvText;

const dataset = buildDatasetFromCsvs(csvs);
const runs: RankingRun[] = presets.map((preset) => ({
  name: preset.name,
  description: preset.description,
  weights: { ...DEFAULT_RANKING_WEIGHTS, ...preset.weights },
  summary: evaluateDataset(dataset, { request: { rankingWeights: preset.weights } }).summary,
}));

const best = [...runs].sort(compareRuns)[0];

mkdirSync(reportsDir, { recursive: true });
writeFileSync(join(reportsDir, 'latest.json'), JSON.stringify({ generatedAt: new Date().toISOString(), best: best.name, runs }, null, 2));
writeFileSync(join(reportsDir, 'latest.md'), renderMarkdown(runs, best));

console.log('Tasco Whisperer ranking tuning');
for (const run of runs) {
  console.log(
    `${run.name}: top1 ${formatPercent(run.summary.top1Accuracy)}, top3 ${formatPercent(run.summary.top3Recall)}, mrr ${run.summary.mrr.toFixed(
      3,
    )}, intent ${formatPercent(run.summary.intentAccuracy)}, p95 ${run.summary.p95LatencyMs}ms`,
  );
}
console.log(`best_preset: ${best.name}`);
console.log(`report: ${join(reportsDir, 'latest.md')}`);

function compareRuns(a: RankingRun, b: RankingRun): number {
  return (
    b.summary.top3Recall - a.summary.top3Recall ||
    b.summary.top1Accuracy - a.summary.top1Accuracy ||
    b.summary.mrr - a.summary.mrr ||
    b.summary.intentAccuracy - a.summary.intentAccuracy ||
    a.summary.p95LatencyMs - b.summary.p95LatencyMs
  );
}

function renderMarkdown(runs: RankingRun[], best: RankingRun): string {
  const lines = [
    '# Ranking Tuning Report',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    `Best preset by top-3, top-1, MRR, intent, and latency tie-breakers: \`${best.name}\`.`,
    '',
    '| Preset | Top-1 | Top-3 | Top-5 | MRR | Intent | p95 ms | Notes |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |',
    ...runs.map(
      (run) =>
        `| ${run.name} | ${formatPercent(run.summary.top1Accuracy)} | ${formatPercent(run.summary.top3Recall)} | ${formatPercent(
          run.summary.top5Recall,
        )} | ${run.summary.mrr.toFixed(3)} | ${formatPercent(run.summary.intentAccuracy)} | ${run.summary.p95LatencyMs} | ${
          run.description
        } |`,
    ),
    '',
    '## Weights',
    '',
    ...runs.flatMap((run) => [
      `### ${run.name}`,
      '',
      '```json',
      JSON.stringify(run.weights, null, 2),
      '```',
      '',
    ]),
  ];
  return `${lines.join('\n')}\n`;
}

function formatPercent(value: number): string {
  return `${Math.round(value * 1000) / 10}%`;
}
