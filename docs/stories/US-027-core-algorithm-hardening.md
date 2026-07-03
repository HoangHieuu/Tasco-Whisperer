# US-027 Core Algorithm Hardening

## Status

implemented

## Lane

normal

## Product Contract

Reduce the risk that Tasco Whisperer only solves known hackathon examples by
adding algorithmic proof around candidate generation, robustness evaluation,
and training-ready ranking features. This story must not import outside POI
datasets; it uses only the provided CSVs and local deterministic logic.

## Relevant Product Docs

- `SPEC.md`
- `docs/product/generalization-roadmap.md`
- `docs/product/agentic-learning.md`
- `docs/TEST_MATRIX.md`

## Acceptance Criteria

- Data-derived category/attribute/location candidate generation exists beside
  the legacy hand-authored semantic templates.
- Robustness evaluation generates metamorphic variants from the provided public
  evaluation rows, including accentless, compact, uppercase, spacing,
  truncation, and abbreviation variants.
- Learning-to-rank code can export labeled feature rows and fit a deterministic
  baseline over existing transparent score factors.
- Documentation states that the ranking baseline is training-ready scaffolding,
  not a production ML claim while labels remain small.
- Existing public evaluation, API smoke, and build validation remain green.

## Design Notes

- Commands:
  - `npm run eval:robust`
  - `npm run rank:train`
- Domain rules:
  - No outside dataset dependency in this slice.
  - Generated robustness rows are supplemental proof; the 60 public cases remain
    the official benchmark.
  - The LTR baseline uses regularized linear weights over current score factors.
    A future production model can replace this with LambdaMART/GBDT once enough
    judged data or behavior logs exist.

## Validation

| Layer | Expected proof |
| --- | --- |
| Unit | Generated-pattern, robustness, and LTR tests. |
| Integration | `npm run eval`, `npm run eval:robust`, `npm run rank:train`, `npm run api:smoke`. |
| E2E | Existing UI smoke remains future/unchanged. |
| Platform | None. |
| Release | `npm run build`. |

## Harness Delta

No Harness policy changes expected.

## Evidence

- `npm test -- --run src/lib/engine.test.ts src/lib/robustness.test.ts src/lib/learningToRank.test.ts`: 3 files, 22 tests passed.
- `npm run eval`: 60 cases, top-1 93.3%, top-3 100%, top-5 100%, MRR 0.964, p95 33 ms.
- `npm run eval:robust`: 192 generated cases, top-3 97.4%, top-5 97.4%, p95 72 ms.
- `npm run rank:train`: 501 supervised rows, validation top-3 100%, validation NDCG@5 0.866.
