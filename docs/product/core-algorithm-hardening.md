# Core Algorithm Hardening

This note records the research-backed decisions for reducing demo overfitting
without importing outside datasets.

## Decisions

| Weakness | Proven production pattern | Decision for this repo |
| --- | --- | --- |
| Hand-authored semantic templates | Large autocomplete systems use retrieve-and-rank pipelines: search-as-you-type indexes, query-suggestion indexes, catalog-grounded retrieval, and feature ranking. | Keep legacy templates as fallback, but add data-derived category/attribute/location phrase generation from the provided CSV entity inventory. |
| Only 60 public evaluation rows | IR systems use test collections plus query-level failure analysis; robustness testing uses metamorphic variants when a full oracle is unavailable. | Add `npm run eval:robust` to generate accentless, compact, uppercase, spacing, truncated-prefix, and abbreviation variants from the supplied labels. |
| No large POI corpus yet | Production map search depends on a much larger catalog and phased retrieval, but importing outside data changes provenance and license scope. | Do not add outside POIs in this slice. Strengthen corpus-ready retrieval and generated candidates against the current CSV schema. |
| No production ML ranker | Mature search stacks use learning-to-rank, commonly LambdaMART/GBDT, after enough judged data or behavior logs exist. | Add a dependency-free linear LTR baseline over current score factors via `npm run rank:train`; treat it as training-ready scaffolding, not a production ML claim. |
| Vietnamese patterns are incomplete | Vietnamese NLP commonly uses word segmentation, guarded diacritic/keyboard cleanup, and dictionary-backed entity evidence. | Keep deterministic Vietnamese segmentation first, and use robustness evaluation to expose compact/spacing/accent regressions before adding model dependencies. |

## Implemented In This Slice

- `src/lib/generatedPatterns.ts`: data-derived candidate phrases from category,
  attribute, city, brand, and abbreviation evidence in the provided CSVs.
- `src/lib/robustness.ts`: metamorphic evaluation cases generated from public
  labels only.
- `src/lib/learningToRank.ts`: supervised ranking rows and a regularized
  linear weight search over transparent score factors.
- `scripts/evaluateRobustness.ts`: writes
  `reports/robustness/latest.json` and `.md`.
- `scripts/trainRanking.ts`: writes
  `reports/learning-to-rank/latest.json` and `.md`.

## Current Proof

- Public evaluation: 60 cases, top-1 93.3%, top-3 100%, top-5 100%, MRR 0.964, p95 33 ms.
- Robustness evaluation: 192 generated cases, top-3 97.4%, top-5 97.4%, p95 72 ms.
- LTR baseline: 501 training rows, validation top-3 100%, validation NDCG@5 0.866.

## Research Basis

- Elasticsearch `search_as_you_type` documents prefix and infix autocomplete
  indexing for typeahead retrieval.
- Algolia Query Suggestions describes building suggestions from popular
  searches and using them in autocomplete UI.
- Apple and Amazon query auto-completion research describe retrieval/generation
  tradeoffs and catalog-grounded QAC, including hallucination risks of purely
  generative suggestions.
- NIST TREC is the standard model for IR test collections and controlled
  relevance evaluation.
- VnCoreNLP and RDRSegmenter are established Vietnamese NLP references for
  word segmentation and entity-oriented language processing.
- Microsoft LambdaMART and XGBoost ranking documentation support learning to
  rank as the production direction once enough labels/logs exist.

## Deferred

- Importing OpenStreetMap, Foursquare OS Places, or any other external POI
  source. That is a data provenance and license decision, not a core-algorithm
  change.
- Training a full LambdaMART/GBDT ranker. The current labels are too small for
  a credible production model.
- Calling an LLM on every keystroke. The deterministic path remains the
  real-time source of truth.
