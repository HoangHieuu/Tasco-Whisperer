# Story Backlog

The accepted product contract is `SPEC.md`. This backlog lists candidate epics
and planned user stories without creating full story packets for every item up
front. Create a detailed story file only when a slice enters implementation.

## Candidate Epics

| Epic | Story Range | Description | Status |
| --- | --- | --- | --- |
| E00 Project Contract | US-001 to US-002 | Harness wiring, dataset contract, and product truth. | implemented |
| E01 Autocomplete MVP | US-003 to US-005 | Dataset loaders, Vietnamese normalization, abbreviation expansion, and deterministic candidate retrieval. | implemented |
| E02 Query Understanding | US-006 to US-007 | Intent classification and entity/context extraction. | implemented |
| E03 Ranking And Evaluation | US-008 to US-010 | Transparent ranking, personalization, and public evaluation harness. | implemented |
| E04 API And Demo | US-011 to US-013 | Autocomplete API, T Maps-style demo UI, and iPhone Mirroring presentation script. | implemented |
| E05 Agentic AI Layer | US-014 to US-016 | Optional agents for hard-case understanding, validated rewrite memory, failure analysis, tuning, and explanations. | in_progress |
| E06 Submission | US-017 to US-018 | README, example gallery, deployment, and final smoke proof. | planned |
| E07 Generalization | US-019 to US-025 | Move beyond fixture-heavy rules with Vietnamese segmentation, semantic retrieval, alias memory, embeddings, optional LLM provider, behavior feedback, and measured ranking tuning. | implemented |

## Planned Stories

| Story | Title | Phase | Lane | First Proof |
| --- | --- | --- | --- | --- |
| US-001 | Project contract is defined | Phase 0 | normal | Docs and Harness intake/matrix. |
| US-002 | Dataset contract is inspectable | Phase 0 | normal | Dataset inventory and schema checks. |
| US-003 | Dataset loader and index builder | Phase 1 | normal | Loader unit tests. |
| US-004 | Vietnamese normalization and abbreviation expansion | Phase 1 | normal | Normalization unit tests. |
| US-005 | Candidate generation MVP | Phase 1 | normal | Top suggestions for seed examples. |
| US-006 | Intent classifier | Phase 2 | normal | Intent evaluation against public labels. |
| US-007 | Entity and context extraction | Phase 2 | normal | Entity extraction tests for benchmark examples. |
| US-008 | Transparent ranking engine | Phase 3 | normal | Ranking tests and score metadata. |
| US-009 | Hackathon-safe personalization | Phase 3 | normal | implemented: profile boost tests with deterministic fallback and explanation metadata. |
| US-010 | Public evaluation harness | Phase 3 | normal | Evaluation report over all 60 public cases. |
| US-011 | Autocomplete API service | Phase 4 | normal | API integration tests. |
| US-012 | T Maps-style demo UI | Phase 4 | normal | Browser smoke test. |
| US-013 | iPhone Mirroring demo script | Phase 4 | normal | Repeatable demo script and screenshots/recording steps. |
| US-014 | Agentic query understanding pipeline | Phase 5 | normal | implemented: `caphe -> cà phê`, deterministic fallback, parsed agent output, alias-memory fixtures. |
| US-015 | Agentic evaluation and tuning loop | Phase 5 | normal | implemented: offline report exports weak cases and advisory tuning proposals requiring developer acceptance. |
| US-016 | Explainable suggestion narrator | Phase 5 | normal | Explanation grounding tests. |
| US-017 | Submission README and example gallery | Phase 6 | normal | README review and example outputs. |
| US-018 | Deployable demo | Phase 6 | normal | Local or deployed smoke proof. |
| US-019 | Generalized Vietnamese query intelligence | Phase 7 | normal | implemented: compact syllable segmentation and guarded Telex/VNI cleanup tests. |
| US-020 | Semantic retrieval source | Phase 7 | normal | implemented: semantic-lite candidates feed existing ranker with tests. |
| US-021 | Persistent alias memory | Phase 7 | normal | implemented: alias memory upsert/promotion/serialization and CLI proof. |
| US-022 | Local embedding retrieval and kNN intent | Phase 7 | normal | implemented: local vector index, kNN retrieval, and intent voting with deterministic fallback. |
| US-023 | Optional async LLM rewrite provider | Phase 7 | normal | implemented: endpoint-configured hosted/local provider adapter validates structured rewrites before use. |
| US-024 | Behavior feedback personalization | Phase 7 | normal | implemented: local selected-suggestion events boost future matching suggestions with explainable metadata. |
| US-025 | Ranking weight tuning scaffold | Phase 7 | normal | implemented: optional ranking weights and `npm run rank:tune` preset comparison report. |
