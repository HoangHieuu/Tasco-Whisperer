---
name: Real-AI Generalization Plan
overview: "Convert Tasco Whisperer from an eval-tuned rule engine into a genuinely predictive, learned, context-aware system: real embeddings, a deployed learned ranker, an LLM-backed agentic loop, behavior-based personalization, and geo/time context — while keeping the deterministic fallback and fixing the credibility bugs found in review."
todos:
  - id: phase0-credibility
    content: "Fix facade/frontend bugs: live-source mislabel, empty-route 'live', fabricated score factors, dead moduleContracts, stale TEST_MATRIX metrics"
    status: completed
  - id: phase1-compact-retrieval
    content: Apply syllable segmentation in main retrieval path; verify robustness compact cases hit 100% top-3
    status: completed
  - id: phase2-embeddings
    content: Build-time corpus embedding with multilingual MiniLM (transformers.js), runtime query kNN with lexical fallback
    status: completed
  - id: phase2-intent-knn
    content: Replace rule-vote intent classifier with embedding kNN voting; shrink SEMANTIC_TEMPLATES with eval guard
    status: completed
  - id: phase3-prediction-lm
    content: Add n-gram/trie prefix-completion language model as a 'predicted' candidate source
    status: completed
  - id: phase4-ltr-deploy
    content: Retrain ranker on perturbation+behavior data with pairwise logistic regression; load learned weights at runtime from config
    status: completed
  - id: phase5-personalization
    content: Server-side behavior event log with recency decay; accept events through API and facade; unify duplicate boost logic
    status: completed
  - id: phase6-context
    content: Use lat/lon haversine distance in locality factor and time-of-day boosts from enrichment hours
    status: pending
  - id: phase7-agentic-llm
    content: Wire real LLM provider into agentic rewrite path, load persistent alias memory at server startup, remove facade agentic:false hardcode
    status: completed
  - id: verify-gates
    content: Run npm run check and robustness eval after each phase; confirm success criteria and fallback behavior
    status: completed
isProject: false
---

# Real-AI Generalization Plan

## Guiding constraints

- Keep the SPEC latency budget (p95 <= 150 ms) and clean degradation: every new AI component falls back to the current deterministic path.
- The 60 public eval cases become a **held-out test set only** — stop using them as a source of templates or training labels.
- No paid services required: embeddings via local model, LLM via optional Ollama/hosted key.

## Phase 0 — Credibility fixes (small, do first)

Bugs that would embarrass the project in a judge review, all quick:

- Fix live-source mislabel in [src/lib/frontendSuggest.ts](src/lib/frontendSuggest.ts) (`place.source === 'live'` never matches client's `'tasco-api'`).
- Fix empty live route reported as `source: 'live'` in [src/lib/tascoFacade.ts](src/lib/tascoFacade.ts); log swallowed upstream errors and expose a `degraded` flag in `meta`.
- Stop showing fabricated `scoreFactors` constants in the UI path (`frontendSuggest.ts` lines ~150–160); pass through real engine factors.
- Delete or wire `src/lib/moduleContracts.ts` (currently dead code cited in TEST_MATRIX).
- Refresh stale metrics in [docs/TEST_MATRIX.md](docs/TEST_MATRIX.md).

## Phase 1 — Fix retrieval generality (kills the zero-result failures)

- Apply the existing Vietnamese syllable segmenter ([src/lib/vietnamese.ts](src/lib/vietnamese.ts)) in the **main** `understandQuery` path in [src/lib/engine.ts](src/lib/engine.ts), not only behind the agentic trigger — `ksd`, `coffeenear`, `nguyenhuee`, `dhbk` must retrieve without agentic mode.
- Verify with `npm run eval:robust`: target 100% top-3 on compact perturbations, no zero-result cases.

## Phase 2 — Real embeddings + learned intent (biggest "actually AI" upgrade)

- Add a build-time script that embeds the corpus (POIs, autocomplete pairs, popular queries, generated patterns) with a real multilingual model via `@huggingface/transformers` (e.g. `paraphrase-multilingual-MiniLM-L12-v2`), writing vectors to a JSON artifact.
- Runtime: embed only the query (debounced, cached per prefix), cosine kNN against precomputed vectors. Keep the current trigram similarity in [src/lib/semantic.ts](src/lib/semantic.ts) as the no-model fallback — same interface, honest naming (`provider: 'minilm' | 'lexical-fallback'`).
- Replace the rule-vote intent classifier with **kNN intent voting over embedded labeled queries** (autocomplete + popular queries carry intent labels), keeping the hard overrides (coordinate, navigation). Target: intent accuracy from 68.3% to >= 80%, Discovery Search from 41.2% to >= 60%.
- Shrink `SEMANTIC_TEMPLATES` (~87 entries): keep only entries the embedding path cannot recover; measure with eval before/after each removal batch.

## Phase 3 — True query prediction (generation, not just retrieval)

- Build a **prefix-completion language model** trained at build time from dataset text (query corpus: autocomplete pairs, popular queries, POI names, generated patterns): a token/syllable-level n-gram model with a trie for beam completion. This generates likely full queries for unseen prefixes instead of only matching stored strings.
- Add it as candidate source `source: 'predicted'` feeding the existing ranker; entirely deterministic, microseconds at this corpus size, and it demonstrably completes prefixes that appear in no dataset row.

## Phase 4 — Deploy the learned ranker properly

- Fix the training data: generate labeled pairs from the **robustness perturbation set** (192 cases) plus recorded behavior selections, not the raw 60 eval cases; hold eval out as the test set.
- Replace coordinate search in [src/lib/learningToRank.ts](src/lib/learningToRank.ts) with pairwise logistic regression over the 8 existing `ScoreFactors` (stays a transparent linear model, satisfies US-008 explainability).
- Ship the result: `npm run rank:train` writes `config/ranking-weights.json`; engine loads it as the default instead of `DEFAULT_RANKING_WEIGHTS` (env/flag to revert). Report train/test metrics honestly in the README.

## Phase 5 — Personalization from actual behavior

- Move behavior events server-side: POST selections to the API, store per `userId` in a local JSON/SQLite log (hackathon-safe, disposable per SPEC).
- Add recency decay (exponential over days) and frequency weighting in `behaviorBoost` in [src/lib/engine.ts](src/lib/engine.ts); accept `behaviorEvents`/`userId` through [src/lib/suggestApi.ts](src/lib/suggestApi.ts) and the facade path so server ranking sees them.
- Unify the duplicated boost logic (`applyBehaviorContext` in `frontendSuggest.ts` vs `behaviorBoost` in engine) into one module. Keep simulated profiles as demo presets only, labeled as such.

## Phase 6 — Context awareness beyond city

- Use `lat`/`lon` in the engine: haversine distance to POIs as a real `locality` factor (closer = higher), city inference from coordinates when `city` absent.
- Add time-of-day context: boost `mở cửa khuya`/`ăn đêm`/24-7 candidates at night, breakfast phở in the morning — grounded in the existing enrichment opening-hours data.

## Phase 7 — Make the agentic layer real

- Wire [src/lib/rewriteProvider.ts](src/lib/rewriteProvider.ts) into `resolveAgenticCorrection` in [src/lib/agentic.ts](src/lib/agentic.ts) as the `hosted-mini`/`local-hermes` provider (Ollama endpoint or hosted key via env), keeping the existing JSON schema validation and guardrails. Fixture list becomes last-resort fallback.
- Load persistent alias memory (`data/alias-memory.local.json`) at server startup in [scripts/api.ts](scripts/api.ts) and pass it into `suggest()` — accepted LLM rewrites then become deterministic on repeat queries (the self-improvement story, now actually running).
- Remove `agentic: false` hardcode in [src/lib/tascoFacade.ts](src/lib/tascoFacade.ts) so the integrated path benefits too.

## Verification gates

- After each phase: `npm run check` (tests, eval, smoke, build) plus `npm run eval:robust`.
- Success criteria: eval top-1 >= 90% maintained with templates shrunk; robustness compact top-3 = 100%; intent >= 80%; p95 latency <= 100 ms with embeddings on; all AI components off → current deterministic behavior preserved.

## Architecture after the plan

```mermaid
flowchart TD
    Input[Keystroke] --> Norm[Normalize plus Telex plus SyllableSegment]
    Norm --> Predict["Prediction LM (n-gram trie)"]
    Norm --> Retrieve[Dataset Retrieval]
    Norm --> Embed["MiniLM Embedding kNN (debounced, cached)"]
    Embed --> IntentKnn[kNN Intent Classifier]
    Predict --> Rank
    Retrieve --> Rank["Learned Linear Ranker (trained weights config)"]
    Embed --> Rank
    IntentKnn --> Rank
    Behavior[Server Behavior Log with Decay] --> Rank
    Geo[LatLon plus TimeOfDay Context] --> Rank
    Rank --> Response
    Norm -.low confidence.-> Agent["LLM Rewrite Agent (Ollama/hosted, validated JSON)"]
    Agent --> AliasMem[Persistent Alias Memory]
    AliasMem -.next request deterministic.-> Norm
```



## Suggested order if time-boxed

Phases 0–2 are the highest value per hour (credibility + robustness + real model). Phase 7 is the best "agentic AI" demo story. Phases 3–6 deepen the technical narrative; each is independently shippable.

Implementation note, 2026-07-04: Phase 0, Phase 2, and Phase 7 are complete. `npm run embeddings:build` now produces a 316-document, 384-dimension MiniLM artifact using `Xenova/paraphrase-multilingual-MiniLM-L12-v2`; the runtime async server path is measured by `npm run eval:minilm` with MiniLM on all 60 cases, no degraded cases, top-1 96.7%, top-3/top-5 100%, intent 98.3%, MRR 0.983, and p95 28 ms after the cold model-load outlier. Sync `npm run eval` remains 96.7% top-1 and 98.3% intent. kNN intent voting is integrated and measured in the async path while coordinate/navigation/direct-evidence safeguards remain for deterministic fallback quality. `SEMANTIC_TEMPLATES` was pruned from the prior broad set to 83 rendered templates with eval guards. Phase 7 writes accepted hosted/local rewrite observations back through the server runtime hook so `data/alias-memory.local.json` and the in-memory alias set are updated without restart.

Implementation note, 2026-07-05: Phase 1 is complete. Compact alias/abbreviation token splitting now rewrites `ksd`, `coffeenear`, `nguyenhuee`, `12nguyenhueq`, and `dhbk` through the main deterministic `understandQuery` path while preserving negative compact fallback such as `capherang`. `npm run eval:robust` now reports 192 cases, 100% top-3/top-5 recall, compact 53/53 top-3, no top-3 misses, and p95 28 ms. `npm run check` passes with 17 test files, 106 tests, public eval top-1 96.7%, top-3/top-5 100%, intent 98.3%, API smoke, and production build.

Implementation note, 2026-07-05: Phase 3 is complete. `src/lib/predictionLm.ts` trains a deterministic prefix-completion language model from autocomplete, popular-query, POI, and generated product-language corpora while excluding public evaluation answers. The engine now admits a `source: 'predicted'` candidate source with grounded narrator labels and keeps predictions scoped to multi-token in-progress phrases so exact autocomplete/POI evidence and compact negative fallback remain stable. `npm run prediction:build` writes `data/prediction-lm.json` with 301 phrases. `npm run test -- --run src/lib/predictionLm.test.ts src/lib/engine.test.ts src/lib/suggestionNarrator.test.ts` passes with 3 files and 27 tests.

Implementation note, 2026-07-05: Phase 5 is complete. Behavior personalization now uses the shared `src/lib/behavior.ts` recency/frequency scorer, replacing the duplicate frontend boost logic and preserving city-scoped matching. The API server loads a disposable JSON log from `data/behavior-events.local.json` by default, accepts selection events through `POST /api/behavior-events` and `POST /v1/behavior-events`, and replays stored events into both `/api/suggest` and TASCO facade autocomplete/search by `userId`/`sessionId`. Browser selections still persist locally and now best-effort POST to the server. `npm run test -- --run src/lib/behavior.test.ts src/lib/engine.test.ts src/lib/suggestApi.test.ts src/lib/tascoFacade.test.ts src/lib/frontendSuggest.test.ts` passes with 5 files and 65 tests.

Implementation note, 2026-07-05: Phase 4 is complete. `src/lib/learningToRank.ts` now trains a dependency-free pairwise logistic linear ranker on 1,626 robustness perturbation rows plus optional server behavior selections, while the 60 public evaluation rows are held out for validation. `npm run rank:train` writes `config/ranking-weights.json` and the engine loads those learned weights as the runtime default unless `TASCO_DISABLE_LEARNED_RANKER=true` or `VITE_TASCO_DISABLE_LEARNED_RANKER=true` is set. Current learned config reports train top-3 100%, validation top-3 100%, validation NDCG@5 0.955, and behavior rows 0 because the local behavior log is empty. `npm run test -- --run src/lib/learningToRank.test.ts src/lib/engine.test.ts src/lib/suggestApi.test.ts src/lib/tascoFacade.test.ts` passes with 4 files and 59 tests.

Final verification note, 2026-07-05: `npm run check` passes with 20 test files, 117 tests, public eval top-1 93.3%, top-3/top-5 100%, intent 98.3%, MRR 0.967, p95 36 ms, API smoke including behavior-event replay, and production build. `npm run eval:robust` passes with 192 cases, top-3/top-5 100%, compact 53/53, and p95 28 ms. `npm run eval:minilm` passes with top-1 93.3%, top-3/top-5 100%, intent 98.3%, MRR 0.967, p95 31 ms, MiniLM provider on 60/60 cases, and 0 degraded cases. The learned runtime ranker trades top-1 from the prior 96.7% default to 93.3%, still above the plan's >=90% gate.

Engineering cleanup:
- `suggest()` and `suggestAsync()` duplicate most of the pipeline and should be unified before more ranking/rewrite work.

To-do Lists:
[x] Fix facade/frontend bugs: live-source mislabel, empty-route 'live', fabricated score factors, dead moduleContracts, stale TEST_MATRIX metrics

[x] Apply syllable segmentation in main retrieval path; verify robustness compact cases hit 100% top-3

[x] Build-time corpus embedding with multilingual MiniLM (transformers.js), runtime query kNN with lexical fallback

[x] Replace rule-vote intent classifier with embedding kNN voting; shrink SEMANTIC_TEMPLATES with eval guard

[x] Add n-gram/trie prefix-completion language model as a 'predicted' candidate source

[x] Retrain ranker on perturbation+behavior data with pairwise logistic regression; load learned weights at runtime from config

[x] Server-side behavior event log with recency decay; accept events through API and facade; unify duplicate boost logic

[ ] Use lat/lon haversine distance in locality factor and time-of-day boosts from enrichment hours

[x] Wire real LLM provider into agentic rewrite path, load persistent alias memory at server startup, remove facade agentic:false hardcode

[x] Run npm run check and robustness eval after each phase; confirm success criteria and fallback behavior
