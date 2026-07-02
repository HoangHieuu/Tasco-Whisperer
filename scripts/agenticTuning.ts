import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildAgenticTuningReport, type AgenticTuningReport, type TuningProposal } from '../src/lib/agenticTuning';
import { loadDatasetFromDisk } from './loadDataset';

const root = process.cwd();
const dataset = loadDatasetFromDisk(root);
const report = buildAgenticTuningReport(dataset);
const outputDir = join(root, 'reports', 'agentic-tuning');
const jsonPath = join(outputDir, 'latest.json');
const markdownPath = join(outputDir, 'latest.md');

mkdirSync(outputDir, { recursive: true });
writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(markdownPath, renderMarkdown(report));

console.log('Tasco Whisperer agentic tuning report');
console.log(`generated_at: ${report.generatedAt}`);
console.log(`cases: ${report.baseline.total}`);
console.log(`weak_cases: ${report.weakCases.length}`);
console.log(`proposals: ${report.proposals.length}`);
console.log(`json: ${jsonPath}`);
console.log(`markdown: ${markdownPath}`);

function renderMarkdown(report: AgenticTuningReport): string {
  const lines = [
    '# Agentic Evaluation And Tuning Report',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    '## Baseline',
    '',
    `- Cases: ${report.baseline.total}`,
    `- Top-1 accuracy: ${formatPercent(report.baseline.top1Accuracy)}`,
    `- Top-3 recall: ${formatPercent(report.baseline.top3Recall)}`,
    `- Top-5 recall: ${formatPercent(report.baseline.top5Recall)}`,
    `- Intent accuracy: ${formatPercent(report.baseline.intentAccuracy)}`,
    `- MRR: ${report.baseline.mrr.toFixed(3)}`,
    `- P95 latency: ${report.baseline.p95LatencyMs} ms`,
    '',
    '## Weak Cases',
    '',
    ...renderWeakCases(report),
    '',
    '## Proposed Tuning Actions',
    '',
    ...renderProposals(report.proposals),
    '',
    '## Guardrails',
    '',
    ...report.notes.map((note) => `- ${note}`),
    '',
  ];

  return `${lines.join('\n')}\n`;
}

function renderWeakCases(report: AgenticTuningReport): string[] {
  if (report.weakCases.length === 0) {
    return ['No weak cases found for the current public evaluation baseline.'];
  }

  return report.weakCases.flatMap((weakCase) => [
    `### ${weakCase.caseId}: ${weakCase.inputPrefix}`,
    '',
    `- Difficulty: ${weakCase.difficulty}`,
    `- Expected intent: ${weakCase.expectedIntentType}`,
    `- Predicted intent: ${weakCase.predictedIntentType}`,
    `- Expected suggestions: ${weakCase.expected.join(' | ')}`,
    `- Returned suggestions: ${weakCase.actual.slice(0, 5).join(' | ') || 'none'}`,
    `- Failure reasons: ${weakCase.failureReasons.join('; ')}`,
    `- Agentic diagnosis: ${weakCase.diagnostics.agentic.reason}`,
    '',
  ]);
}

function renderProposals(proposals: TuningProposal[]): string[] {
  if (proposals.length === 0) {
    return ['No proposals were generated.'];
  }

  return proposals.flatMap((proposal) => [
    `### ${proposal.id}`,
    '',
    `- Type: ${proposal.type}`,
    `- Title: ${proposal.title}`,
    `- Confidence: ${proposal.confidence.toFixed(2)}`,
    `- Requires developer acceptance: ${proposal.requiresAcceptance ? 'yes' : 'no'}`,
    `- Affected cases: ${proposal.affectedCaseIds.join(', ')}`,
    `- Rationale: ${proposal.rationale}`,
    `- Evidence: ${proposal.evidence.join(' | ')}`,
    '',
    '```json',
    JSON.stringify(proposal.proposedChange, null, 2),
    '```',
    '',
  ]);
}

function formatPercent(value: number): string {
  return `${Math.round(value * 1000) / 10}%`;
}
