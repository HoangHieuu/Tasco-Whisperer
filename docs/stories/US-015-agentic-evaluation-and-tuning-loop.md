# US-015 Agentic Evaluation And Tuning Loop

Status: implemented

## Goal

Export an offline agent-readable report that inspects public evaluation weak
cases and proposes targeted tuning actions without changing runtime behavior
automatically.

## Implementation

- `src/lib/agenticTuning.ts` builds a tuning report from `evaluateDataset`.
- `scripts/agenticTuning.ts` writes JSON and Markdown reports to
  `reports/agentic-tuning/`.
- Proposals are advisory and include `requiresAcceptance: true`.
- Proposal categories cover intent-rule review, ranking-weight review,
  semantic templates, alias candidates, and hard-case watchlists.
- Evidence is grounded in POI, autocomplete, popular-query, or abbreviation
  rows before suggesting dataset-backed templates or aliases.

## Validation

```bash
npm test -- --run src/lib/agenticTuning.test.ts
npm run tune:agentic
npm run check
```

Expected report outputs:

- `reports/agentic-tuning/latest.json`
- `reports/agentic-tuning/latest.md`

Latest public report output:

- 60 cases.
- 30 weak cases, primarily intent mismatches or expected-present ranking cases.
- 4 advisory proposals.

## Acceptance Notes

The tuning loop does not auto-apply dictionary, template, or weight changes.
Accepted changes must still be committed as explicit config or code edits, then
measured with a before/after evaluation run.
