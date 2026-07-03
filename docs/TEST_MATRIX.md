# Test Matrix

This file maps Tasco Whisperer product behavior to proof.

The accepted product contract is `SPEC.md`. Do not mark a row implemented until
tests or validation evidence exist.

## Status Values

| Status | Meaning |
| --- | --- |
| planned | Accepted as intended behavior, not implemented |
| in_progress | Actively being built |
| implemented | Implemented and proof exists |
| changed | Contract changed after earlier implementation |
| retired | No longer part of the product contract |

## Matrix

| Story | Contract | Unit | Integration | E2E | Platform | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| US-001 | Product contract and Harness wiring are defined. | no | no | no | no | implemented | `SPEC.md`, `docs/product/overview.md`, Harness intake #1, story matrix seeded. |
| US-002 | Dataset contract is inspectable and references all provided CSVs. | no | no | no | no | implemented | Dataset inventory in `SPEC.md` from CSV inspection. |
| US-003 | Dataset loader validates all required files and columns. | yes | no | no | no | implemented | `npm run test` covers typed CSV loading and missing-column failure. |
| US-004 | Vietnamese normalization handles accents, compact forms, Telex/VNI remnants, abbreviations, and aliases. | yes | no | no | no | implemented | `npm run test` covers accent stripping, abbreviation expansion, compact syllable segmentation, guarded Telex/VNI cleanup, and alias typo handling. |
| US-005 | Candidate generation returns relevant suggestions from merged lexical, semantic, POI, popular-query, and template sources. | yes | yes | no | no | implemented | `npm run test` covers `vin`, `cafe`, `atm`, `ks d`, `nguyen h`, semantic candidates, and negative compact cases; browser QA covers live `atm` suggestions. |
| US-006 | Intent classifier predicts suggestion/search type for incomplete prefixes. | yes | yes | no | no | implemented | `npm run test` covers category/attribute/coordinate intent; `npm run eval` reports 51.7% intent accuracy across public labels. |
| US-007 | Entity/context extraction detects brands, categories, POIs, streets, districts, cities, and nearby terms. | yes | yes | no | no | implemented | `npm run test` covers category, city, brand, attribute, and coordinate entities; UI displays entity chips with source/confidence. |
| US-008 | Ranking engine produces transparent scores and source/reason metadata. | yes | yes | no | no | implemented | `npm run check`: top1 90%, top3 100%, top5 100%, MRR 0.933; UI score-factor panel shows ranking factors; `npm run rank:tune` compares explicit weight presets. |
| US-009 | Local/simulated personalization boosts relevant suggestions with fallback. | yes | yes | yes | no | implemented | `npm run test` covers baseline fallback, known profile boosts, local behavior-event boosts, unknown profile fallback, `agentic=false`, and API metadata with `personalizationReason`; UI records local selections. |
| US-010 | Public evaluation harness reports accuracy, recall, MRR, difficulty/type metrics, and latency. | yes | yes | no | no | implemented | `npm run check`: 60 cases, top1 90%, top3 100%, top5 100%, intent 66.7%, MRR 0.933, p95 latency 26 ms. |
| US-011 | Autocomplete API returns schema-compliant suggestions with errors and latency. | yes | yes | no | no | implemented | `npm run test` covers API parser/response/error cases; `npm run api:smoke` starts the HTTP server, calls `/api/suggest`, and verifies invalid limit handling. |
| US-012 | T Maps-style demo UI supports real-time suggestions and debug metadata. | no | yes | yes | yes | implemented | Playwright QA at `http://127.0.0.1:5173/`; desktop/mobile screenshots in `/tmp/tasco-whisperer-qa/`. |
| US-013 | iPhone Mirroring demo script ties the solution to the observed T Maps UX without overclaiming integration. | no | no | no | yes | implemented | `docs/demo/iphone-mirroring-demo.md`; Computer Use observation verified T Maps first screen in iPhone Mirroring with search field, category chips, and bottom tabs. |
| US-014 | Agentic query understanding adds validated hard-case analysis with deterministic fallback. | yes | yes | yes | no | implemented | `npm run check` passes with tests covering structured parser validation, algorithmic compact-prefix segmentation, `caphe -> ca phe`, guarded Telex/VNI cleanup, negative rewrite fixtures, semantic retrieval, API diagnostics, provider validation, and alias-memory reuse. |
| US-015 | Agentic evaluation loop proposes accepted, measurable tuning changes. | yes | yes | no | no | implemented | `npm test -- --run src/lib/agenticTuning.test.ts` covers weak-case analysis and advisory proposals; `npm run tune:agentic` exports JSON/Markdown reports with 22 weak cases, 4 proposals, and acceptance guardrails. |
| US-016 | Suggestion narrator explains results using grounded metadata only. | yes | yes | no | no | planned | Future explanation grounding tests. |
| US-017 | Submission README and example gallery explain setup, methods, examples, and limitations. | no | no | no | no | planned | Future README review. |
| US-018 | Demo is locally runnable or deployed with smoke proof and graceful optional-provider degradation. | no | yes | yes | yes | planned | Future smoke/deploy proof. |
| US-019 | Generalized Vietnamese query intelligence reduces fixture dependence. | yes | yes | no | no | implemented | `src/lib/vietnamese.test.ts` covers syllable segmentation and Telex/VNI cleanup; engine tests prove deterministic compact handling without agent calls; `npm run eval:robust` adds compact/accent/spacing regression proof. |
| US-020 | Semantic retrieval source adds dataset-grounded candidates beyond exact rules. | yes | yes | no | no | implemented | `src/lib/semantic.test.ts` covers similarity scoring and dataset-grounded vector candidate generation; `src/lib/generatedPatterns.ts` adds data-derived category/attribute/location candidates before legacy templates. |
| US-021 | Persistent alias memory records accepted corrections and promotes repeated aliases. | yes | yes | no | no | implemented | `src/lib/aliasMemory.test.ts` covers upsert, promotion, parse/serialize; `npm run alias:memory` writes local JSON records. |
| US-022 | Local embedding retrieval and kNN intent voting replace semantic-lite-only fallback. | yes | yes | no | no | implemented | `src/lib/semantic.test.ts` covers embedding index construction, kNN retrieval, and intent voting; API diagnostics expose embedding neighbors and intent vote. |
| US-023 | Optional async LLM rewrite provider handles hard cases behind validation. | yes | yes | no | no | implemented | `src/lib/rewriteProvider.test.ts` validates hosted/local provider output and rejects unsafe rewrites; `npm run rewrite:agent` exposes endpoint-configured CLI usage. |
| US-024 | Behavior feedback personalization learns from local selected suggestions. | yes | yes | yes | no | implemented | `src/lib/engine.test.ts` covers local behavior-event boosts; `src/App.tsx` stores selected suggestions in browser local storage and passes them through `behaviorEvents`. |
| US-025 | Ranking weight tuning is explicit, measurable, and reproducible. | yes | yes | no | no | implemented | `src/lib/engine.test.ts` covers `rankingWeights`; `npm run rank:tune` writes preset comparisons; `npm run rank:train` exports supervised LTR rows and a regularized linear baseline. |
| US-026 | TASCO Maps API facade can use live upstream data with local fallback. | yes | yes | no | no | implemented | `src/lib/tascoFacade.test.ts` covers autocomplete, filtered search, POI, reverse geocoding, nearby search, geocoding, route, aliases, validation, live-client use, and local fallback; `src/lib/tascoApiClient.test.ts` covers upstream URL/header/DTO mapping for all endpoint families, auth headers, request IDs, `/v1` base normalization, search filter forwarding, and live route result normalization; `npm run api:smoke` verifies HTTP facade routes; `integrations/flutter/tasco_whisperer_adapter.dart` provides the thin Flutter adapter with typed route DTOs; `docs/TASCO_API_CONFORMANCE.md` maps the TASCO doc line items. |
| US-027 | Core algorithm hardening reduces demo overfitting without outside datasets. | yes | yes | no | no | implemented | `src/lib/generatedPatterns.ts`, `src/lib/robustness.ts`, and `src/lib/learningToRank.ts`; `npm run test`, `npm run eval`, `npm run eval:robust`, `npm run rank:train`, `npm run api:smoke`, and `npm run build` validate generated candidates, metamorphic robustness, and LTR scaffolding. |

## Evidence Rules

- Unit proof covers pure domain and application rules.
- Integration proof covers backend enforcement, data integrity, provider
  behavior, jobs, or service contracts.
- E2E proof covers user-visible browser flows.
- Platform proof covers only shell, deployment, mobile, desktop, or runtime
  behavior that cannot be proven in lower layers.
- A story can be implemented without every proof column if the story packet
  explains why.
