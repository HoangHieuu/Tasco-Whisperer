# Generalized Query Intelligence Roadmap

This roadmap replaces the earlier fixture-heavy interpretation of Tasco
Whisperer. The engine should not depend on adding one rule for every typo,
slang form, or public evaluation case.

## Target Architecture

```text
Every keystroke, synchronous:
  normalize
  abbreviation expansion
  Vietnamese syllable segmentation
  Telex/VNI cleanup
  lexical, fuzzy, semantic-lite retrieval
  local embedding kNN retrieval
  kNN intent voting
  transparent ranking

Hard cases only:
  optional LLM rewrite provider
  strict JSON validation
  deterministic rerank
  persistent alias memory
  behavior feedback
  measured ranking-weight tuning
```

Every tier must degrade cleanly to the tier below it.

## Implemented Now

- Algorithmic compact Vietnamese segmentation in `src/lib/vietnamese.ts`.
- Telex/VNI-style cleanup guarded by the dataset-derived lexicon.
- Stronger multi-token fallback matching to reduce accidental matches.
- Local embedding index and semantic retrieval source in `src/lib/semantic.ts`.
- Data-derived category/attribute/location phrase generation in
  `src/lib/generatedPatterns.ts`, used before legacy hand-authored semantic
  templates.
- Robustness evaluation from metamorphic variants of the provided public labels
  in `src/lib/robustness.ts` and `npm run eval:robust`.
- Training-ready learning-to-rank rows plus a dependency-free linear baseline
  in `src/lib/learningToRank.ts` and `npm run rank:train`.
- Persistent alias-memory record, promotion, parsing, and CLI helpers in
  `src/lib/aliasMemory.ts` and `scripts/aliasMemory.ts`.
- Optional hosted/local rewrite-provider adapter in
  `src/lib/rewriteProvider.ts` and `scripts/rewriteAgent.ts`.
- Browser-local behavior feedback from selected suggestions, passed into the
  personalization scorer through `behaviorEvents`.
- Configurable ranking weights plus `npm run rank:tune` for measured preset
  comparison against the public evaluation suite.

## Implemented Generalization Tiers

### Embedding Retrieval

The repo now includes a deterministic local embedding index based on weighted
tokens and character n-grams. It runs offline, works in Node and browser builds,
and exposes kNN neighbors plus intent voting in API diagnostics. A future
production upgrade can swap this vectorizer for a multilingual sentence model.

- index POIs, autocomplete rows, popular queries, tags, and categories
- embed the expanded query through the same local vectorizer
- kNN retrieve candidates and vote intent from labeled neighbors
- keep the deterministic lexical path available if a stronger model is missing

### Optional LLM Rewrite Provider

The current real-time API is synchronous. The repo now includes an async
provider adapter and CLI:

```bash
npm run rewrite:agent -- --q "bundau" --provider hosted-mini --endpoint <url>
npm run rewrite:agent -- --q "bundau" --provider local-hermes --endpoint http://localhost:11434/api/chat
```

The provider must return the existing structured rewrite schema and pass the
current validation rules before its rewrite can affect ranking. It remains
outside the per-keystroke path.

### Behavior Feedback

Simulated profiles remain useful for demos, and the demo now records local
selection events in browser storage:

- raw query
- selected suggestion
- selected type, brand, category, and city metadata when available
- profile context
- timestamp

Matching future suggestions receive a transparent `Local learner` boost in
metadata. Global promotion still requires evaluation proof or developer
approval; local events do not mutate the dataset or public evaluation baseline.

### Ranking Tuning

The transparent score factors remain in the response. The runtime accepts
optional ranking weights through `SuggestRequest.rankingWeights`, and
`npm run rank:tune` compares named presets against the public evaluation suite.
With only 60 public cases, this is a reproducible tuning assistant, not a
production ML claim.

`npm run rank:train` now trains a pairwise linear ranker from robustness
perturbations plus optional behavior logs, holds public labels out for
validation, and writes deployed runtime weights to `config/ranking-weights.json`.
This remains dependency-free and transparent while keeping a path toward a
larger LambdaMART/GBDT ranker when more judged logs exist.

### Robustness Evaluation

`npm run eval:robust` creates supplemental metamorphic cases from the provided
CSV labels only. It tests accentless, compact, uppercase, spacing,
truncated-prefix, and abbreviation variants so a high score on the 60 public
rows does not hide brittle query handling. These cases are not a replacement
for a larger judged corpus; they are a regression guard until more real labels
exist.

## Future Production Upgrades

- Swap the local vectorizer for a multilingual sentence model after a larger
  Vietnamese map-search corpus exists.
- Fit ranking weights from accepted selections, public labels, and generated
  counterexamples once enough feedback data is available.
- Promote repeated local corrections into shared alias memory only after
  evaluation confirms they do not regress other cases.

## Non-Goals For The Hackathon

- Training a full LLM.
- Calling an LLM on every keystroke.
- Claiming open-world POI coverage without a real POI data source.
- Treating synthetic data as proof of production search quality.
