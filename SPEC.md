# Tasco Whisperer SPEC

## 1. Product Summary

Tasco Whisperer is an agentic Vietnamese autocomplete and query suggestion
engine for T Maps. It predicts what a user is trying to search while they type,
normalizes Vietnamese variants, retrieves candidate places and queries from the
provided hackathon datasets, ranks suggestions in real time, and exposes a demo
API/UI that can be shown alongside the T Maps iOS app through iPhone Mirroring.

The product is built for Agentic AI Build Week in Vietnam. The first goal is a
credible hackathon demo: fast, measurable, integration-ready autocomplete for
Vietnamese map search. The long-term goal is a search intelligence layer that
T Maps could embed in its own search box.

## 2. Source Inputs

### Problem Statement

The supplied `Problem.md` defines Mobility Track P9: AI-Powered Autocomplete &
Query Suggestions. The required capabilities are:

- Query prediction.
- Intent prediction before the full query is typed.
- Vietnamese language handling for accents, typos, abbreviations, and slang.
- Smart context-aware suggestions.
- Personalized suggestions from behavior.
- Ranking by likelihood and relevance.
- Low-latency real-time response.
- Search API/service and live autocomplete demo.

### Current T Maps UI Context

Observed through iPhone Mirroring:

- T Maps opens to a map-first iOS interface.
- The first viewport includes a search box labeled `Tim kiem`.
- The app exposes category chips such as `Nha hang`, `Khach san`, `Ca phe`,
  and `Tap hoa`.
- The bottom navigation includes `Kham pha`, `Chi duong`, `Thoi tiet`, and
  `Dong gop`.

This SPEC assumes the hackathon deliverable integrates with the T Maps search
experience conceptually and visually, but does not require modifying the
closed-source iOS app. The demo may be a companion web/mobile UI and API that
is shown side-by-side with T Maps unless a real integration hook is provided.

### Dataset Inventory

The repository includes synthetic hackathon data in `data/`:

| Dataset | Rows | Purpose |
| --- | ---: | --- |
| `README.csv` | 5 | Dataset description and constraints. |
| `Public Evaluation.csv` | 60 | Evaluation cases with prefixes, expected suggestion types, expected top suggestions, difficulty, and skills tested. |
| `POI Dataset.csv` | 62 | Places, categories, brands, addresses, city, coordinates, ratings, reviews, popularity, and tags. |
| `Autocomplete Dataset.csv` | 24 | Historical prefix-to-suggestion examples with scores and frequencies. |
| `Abbreviation Dictionary.csv` | 15 | Vietnamese abbreviations and expansions such as `q1`, `tp hcm`, `hn`, `dn`, `ks`, `bv`, and brand/category aliases. |
| `Popular Queries.csv` | 10 | Trending or frequent search queries with intent type, monthly frequency, and region. |

Important distribution notes:

- Public evaluation difficulty: 16 easy, 25 medium, 19 hard.
- Public evaluation suggestion coverage includes brand, category, nearby, POI,
  address, discovery, ambiguous, navigation, attribute, and coordinate cases.
- POI cities include TP.HCM, Ha Noi, Da Nang, Hai Phong, Nha Trang, and Da Lat.
- POI categories include cafe, restaurant, shopping mall, hospital, ATM, hotel,
  gas station, market, airport, cinema, bus station, and university.

## 3. Product Goals

1. Return useful ranked autocomplete suggestions for Vietnamese map queries in
   under real-time interaction latency.
2. Handle Vietnamese input without requiring perfect accents or spelling.
3. Expand abbreviations and aliases common in Vietnamese map search.
4. Predict intent and suggestion type before the user completes the query.
5. Rank candidates using frequency, popularity, POI quality, lexical match,
   locality, intent confidence, and personalization signals.
6. Provide a clean API and live demo that can be presented in a hackathon.
7. Use an agentic layer where it helps: query interpretation, evaluation,
   tuning, explanation, and demo narration, without making every keystroke
   depend on slow LLM calls.

## 4. Non-Goals

- Replacing T Maps or building a full map platform.
- Scraping private or production T Maps data.
- Collecting real user history during the hackathon demo.
- Requiring a production iOS SDK integration before a demo can work.
- Calling a remote LLM on every keystroke when a deterministic local path can
  satisfy latency.
- Treating synthetic hackathon data as production-grade truth.

## 5. Core Personas

### Vietnamese Map User

Wants to type quickly, often without accents, with abbreviations or typos, and
still find a place, category, address, brand, or nearby service.

### T Maps Product Stakeholder

Wants a search layer that increases successful searches, reduces typing effort,
and can be integrated into the existing map search experience.

### Hackathon Judge

Wants to see a working demo, clear technical architecture, measurable accuracy,
agentic AI contribution, and credible deployment path.

### Developer/Agent Maintainer

Wants a Harness-backed repo where each feature slice has a contract, proof
expectation, and validation command.

## 6. Functional Requirements

### FR-001 Query Normalization

The engine must normalize Vietnamese user input before retrieval:

- Lowercase and trim whitespace.
- Support accent-insensitive matching.
- Preserve original query for display and analytics.
- Normalize common punctuation and repeated spaces.
- Correct small typo variants for known POIs/categories where possible.
- Expand abbreviation dictionary entries and aliases.
- Segment compact Vietnamese syllable forms algorithmically where dictionary
  evidence supports the split, such as `caphe`, `khachsan`, or `benhvien`.
- Decode common Telex/VNI leftovers only when the decoded token is supported by
  dataset or domain lexicon evidence.

### FR-002 Candidate Generation

The engine must retrieve candidates from multiple sources:

- Historical autocomplete pairs.
- POI names, categories, brands, addresses, cities, tags, and aliases.
- Popular queries and regional trends.
- Abbreviation expansions.
- Semantic evidence from POI names, categories, tags, historical suggestions,
  and popular queries.
- Generated phrase templates for nearby and discovery searches, such as
  `gan day`, `mo cua 24/7`, `gan bien`, or `gan san bay`.

### FR-003 Intent Prediction

The engine must infer likely intent types while the query is incomplete:

- Brand search.
- Category search.
- Nearby search.
- POI search.
- Address/location search.
- Discovery search.
- Navigation or route intent.
- Attribute search.
- Ambiguous intent when confidence is low.

### FR-004 Ranking

The engine must rank suggestions using a transparent score composed from:

- Prefix/lexical match quality.
- Accent-insensitive and typo-tolerant match quality.
- Historical suggestion score and query frequency.
- Popular query monthly frequency.
- POI popularity, rating, and review count.
- Category/brand/entity match.
- Region or current-location context when available.
- Personalization boosts from simulated or local user behavior.
- Diversity rules so the top list is not only one source or one type.

### FR-005 API

The service must expose the internal debug autocomplete endpoint:

```http
GET /api/suggest?q=<prefix>&lat=<optional>&lng=<optional>&city=<optional>&userId=<optional>&limit=<optional>
```

Response shape:

```json
{
  "query": "cafe",
  "normalizedQuery": "cafe",
  "intent": {
    "type": "Category Search",
    "confidence": 0.91
  },
  "suggestions": [
    {
      "text": "Quan ca phe gan day",
      "type": "Category Search",
      "score": 0.97,
      "source": "autocomplete",
      "matched": ["cafe"],
      "poiId": null,
      "metadata": {
        "reason": "historical high-frequency category query"
      }
    }
  ],
  "latencyMs": 42
}
```

Internal display strings should support Vietnamese accents. ASCII-only forms in
examples are acceptable only when documenting normalized values.

The service should also expose TASCO Maps hackathon-compatible facade routes
from the supplied API documentation:

- `GET /v1/autocomplete`, alias `/autocomplete`
- `GET /v1/search`, aliases `/search` and `/v1/geocode-search`
- `GET /v1/poi/{id}`, alias `/poi/{id}`
- `GET /v1/reverse-geocoding`, aliases `/reverse-geocoding` and `/v1/reverse`
- `GET /v1/nearby-search`, alias `/nearby-search`
- `GET /v1/geocoding`, alias `/geocoding`
- `POST /v1/route`, alias `/route`
- `GET /health`

The facade should return TASCO `PlaceResult` style DTOs with stable IDs,
labels, categories, optional coordinates, scores, and source. When
`TASCO_API_BASE_URL` or equivalent configuration is present, the facade may call
the live TASCO-compatible upstream after local query understanding. If the live
upstream is unavailable or empty, it must fall back to local deterministic
suggestions.

### FR-006 Demo UI

The demo must provide a user-visible autocomplete experience:

- A search input modeled after T Maps' search-first flow.
- Suggestions update as the user types.
- Suggestion rows show text, type, and score/confidence.
- Optional badges show why the suggestion appears, such as `abbreviation`,
  `popular`, `nearby`, `POI`, or `personalized`.
- At least 10 curated demo inputs are available from the UI or README.

### FR-007 Personalization

The product must support hackathon-safe personalization:

- Use simulated or local-only history, not real private T Maps data.
- Boost repeated categories, brands, cities, and selected suggestions.
- Record local accepted suggestion events for profile-specific behavior boosts.
- Keep a non-personalized fallback.
- Make personalization explainable in ranking metadata.

### FR-008 Evaluation

The project must provide an evaluation command or script that measures:

- Top-1 accuracy where exact expected top suggestion is known.
- Top-3 recall against `expected_top_suggestions`.
- Top-5 recall.
- Mean reciprocal rank.
- Per-difficulty performance.
- Per-skill or per-suggestion-type performance.
- Latency percentiles.
- Ranking-weight preset comparisons for explicit, measured tuning.

### FR-009 Agentic AI Behavior

The agentic layer must add visible value beyond a static autocomplete lookup:

- Query-understanding agent proposes normalization, expansions, and intent.
- Retrieval agent gathers candidates from dataset-specific sources.
- Ranking/evaluation agent explains score contributions and detects weak cases.
- Demo agent can produce a short natural-language explanation for selected
  suggestions without blocking real-time autocomplete.
- Offline tuning agent can review failed public evaluation cases and propose
  ranking or dictionary improvements.

## 7. Non-Functional Requirements

| Area | Requirement |
| --- | --- |
| Latency | Local demo p95 autocomplete response <= 150 ms for dataset scale; target p50 <= 50 ms. |
| Availability | Demo should run locally without external paid services. Optional LLM features must degrade cleanly. |
| Language quality | Accentless Vietnamese, accented Vietnamese, common abbreviations, mixed English/Vietnamese, and small typos must be handled. |
| Explainability | Every suggestion should expose source and ranking reason in debug mode. |
| Privacy | No real personal data collection is required. Simulated `userId` data must be local and disposable. |
| Portability | README must include macOS, Linux, and Windows commands when implementation exists. |
| Testability | Public evaluation dataset is the baseline regression suite. |

## 8. Phased Delivery Plan

### Phase 0: Harness And Data Contract

Goal: convert the generic Harness repo into a Tasco Whisperer project with
clear product truth, dataset contracts, and validation expectations.

#### US-001: Project Contract Is Defined

As a developer/agent maintainer, I want the Tasco Whisperer product contract to
be recorded in the repo so that future work does not treat the generic Harness
scaffold as the product.

Acceptance criteria:

- `SPEC.md` describes goals, non-goals, personas, requirements, phases, stories,
  validation gates, and tool strategy.
- `docs/product/README.md` points to Tasco Whisperer product truth.
- `docs/stories/backlog.md` lists candidate epics and story IDs.
- `docs/TEST_MATRIX.md` maps planned stories to proof expectations.
- Harness database is initialized and contains a `new spec` intake row.

#### US-002: Dataset Contract Is Inspectable

As a developer, I want the provided CSV datasets documented so that ingestion,
normalization, and evaluation use the correct columns and row counts.

Acceptance criteria:

- Dataset files, row counts, and primary columns are listed in the spec.
- The spec identifies the public evaluation dataset as the baseline regression
  suite.
- The spec records that the dataset is synthetic and hackathon-only.
- Future ingestion work can fail fast if a required file or column is missing.

### Phase 1: Offline Autocomplete MVP

Goal: ship a local deterministic engine that returns ranked suggestions from
the provided datasets before adding complex AI behavior.

#### US-003: Dataset Loader And Index Builder

As a developer, I want typed loaders and searchable indexes for all provided
datasets so the engine can retrieve candidates from stable sources.

Acceptance criteria:

- Loader reads all six CSV files from `data/`.
- Required columns are validated with clear errors.
- POI, autocomplete, popular query, abbreviation, and evaluation records have
  typed internal representations.
- Indexes support prefix lookup on normalized query text, POI name, category,
  brand, city, address, and tags.
- Unit tests cover at least one valid row and one missing-column failure per
  required dataset.

#### US-004: Vietnamese Normalization And Abbreviation Expansion

As a T Maps user, I want prefixes like `ks d`, `bv bach`, `q1`, `tp hcm`, and
`nguyen huee` to resolve to likely Vietnamese map intents so I do not need to
type perfectly.

Acceptance criteria:

- Accent-insensitive matching works for accented and unaccented query variants.
- Abbreviation dictionary entries expand during candidate generation.
- Known typo cases from public evaluation can retrieve the intended candidate.
- Original display text keeps Vietnamese accents where available.
- Unit tests cover abbreviations, missing accents, mixed case, repeated spaces,
  and typo examples.

#### US-005: Candidate Generation MVP

As a user, I want useful suggestions while typing common prefixes so that I can
select a result before completing the query.

Acceptance criteria:

- For `vin`, top candidates include Vincom Center, Vinmec, and Vinpearl.
- For `cafe`, top candidates include `Quan ca phe gan day`, Highlands Coffee,
  and a 24/7 cafe style suggestion when available.
- For `atm`, nearby ATM suggestions are generated.
- For `nguyen h`, address and POI candidates from Nguyen Hue are retrieved.
- For `ben th`, Cho Ben Thanh candidates are retrieved.
- Candidate generation merges sources without duplicate display texts.

### Phase 2: Intent Prediction And Query Understanding

Goal: predict what kind of search the user is performing before the query is
complete.

#### US-006: Intent Classifier

As a T Maps product stakeholder, I want each prefix classified by likely intent
so the UI and ranking system can choose relevant suggestion types.

Acceptance criteria:

- Classifier returns intent type and confidence.
- Supported types include brand, category, nearby, POI, address/location,
  discovery, navigation, attribute, coordinate, and ambiguous.
- Rules use dataset evidence first: suggestion type, expected suggestion type,
  category terms, POI entities, nearby terms, and abbreviations.
- Ambiguous cases return multiple candidate intents or an `Ambiguous` type with
  lower confidence.
- Evaluation reports intent accuracy against public evaluation labels where
  labels can be mapped.

#### US-007: Entity And Context Extraction

As a user, I want prefixes containing brands, streets, districts, cities, or
nearby terms to influence suggestions correctly.

Acceptance criteria:

- Extracted entities can include brand, category, POI, street/address, city,
  district, attribute, and proximity terms.
- `ks da nang` recognizes hotel plus Da Nang.
- `atm vcb` recognizes ATM category plus Vietcombank alias/brand intent.
- `nguyen hue` recognizes address/street and relevant POIs.
- Current city or coordinate context can be passed but is optional.
- Extracted entities are included in debug metadata.

### Phase 3: Ranking, Personalization, And Evaluation

Goal: make suggestions high-quality, explainable, and measurable.

#### US-008: Transparent Ranking Engine

As a user, I want the most likely suggestion first so I can complete a search
with minimal typing.

Acceptance criteria:

- Ranker combines lexical score, source score, frequency, POI popularity,
  rating/review quality, intent match, locality, personalization, and diversity.
- Each returned suggestion includes final score and score contribution metadata
  in debug mode.
- Top suggestions for the easy public evaluation cases match expected examples
  in the correct general order.
- Duplicate candidates are merged with retained source evidence.
- Ranking weights are configurable without changing application code.

#### US-009: Hackathon-Safe Personalization

As a returning user, I want suggestions to adapt to my repeated interests
without using private production data.

Acceptance criteria:

- Local or simulated user profile stores selected categories, brands, cities,
  and recent suggestions.
- Passing `userId` can boost matching candidates.
- Personalization can be disabled for deterministic evaluation.
- Suggestion metadata explains when a personalization boost was applied.
- Tests prove personalized ranking changes only the intended candidates.

#### US-010: Public Evaluation Harness

As a hackathon judge, I want objective proof that the engine handles the
provided evaluation cases.

Acceptance criteria:

- Evaluation command runs all 60 public cases.
- Report includes top-1, top-3, top-5, MRR, per-difficulty, per-type, and
  latency metrics.
- Failed cases list input prefix, expected suggestions, returned suggestions,
  and likely failure reason.
- Evaluation can run in CI or from README commands.
- Baseline metrics are saved as artifacts or documented in a validation report.

### Phase 4: API And Live Demo Experience

Goal: expose the engine through a clean API and a demo interface that can be
shown next to T Maps on iPhone Mirroring.

#### US-011: Autocomplete API Service

As an integrator, I want an HTTP autocomplete API so T Maps or a companion demo
can request ranked suggestions in real time.

Acceptance criteria:

- `GET /api/suggest` accepts query prefix, optional location/city/user context,
  and limit.
- Response follows the schema in FR-005.
- Empty query returns safe defaults or no suggestions based on configuration.
- Invalid parameters return clear 4xx errors.
- API latency is included in the response and server logs.
- Integration tests cover happy path, no-result path, invalid input, and
  personalized request path.

#### US-012: T Maps-Style Demo UI

As a hackathon judge, I want to type into a T Maps-inspired search UI and see
suggestions appear instantly.

Acceptance criteria:

- Demo UI has a map/search feel consistent with the observed T Maps iOS search
  surface.
- Suggestions update while typing without page reload.
- At least 10 curated demo inputs are available in README or demo controls.
- Each suggestion displays text and type; debug mode can show score and reason.
- UI remains usable on desktop and mobile viewport sizes.
- Browser smoke test verifies the demo loads and returns suggestions.

#### US-013: iPhone Mirroring Demo Script

As a presenter, I want a repeatable demo script using T Maps on iPhone
Mirroring so the solution clearly connects to the real app context.

Acceptance criteria:

- Demo script explains how to open T Maps, show the native search entry point,
  and then show Tasco Whisperer suggestions.
- Script includes at least five problem-statement examples and five harder
  dataset examples.
- Script avoids claiming production integration unless a real integration is
  implemented.
- Screenshots or recording steps are documented for the final presentation.

### Phase 5: Agentic AI Layer

Goal: use agents where they create clear value for query understanding,
failure analysis, and explanation without violating real-time constraints.

#### US-014: Agentic Query Understanding Pipeline

As a user, I want hard prefixes and ambiguous searches to be interpreted more
intelligently than simple prefix matching.

Acceptance criteria:

- Pipeline separates deterministic real-time autocomplete from optional agentic
  analysis.
- Agentic analysis can propose expansions, intent hypotheses, and ranking
  adjustments for hard cases.
- Agent outputs are parsed and validated before affecting rankings.
- If the agent or LLM is unavailable, deterministic suggestions still work.
- Agent decisions are logged with enough evidence for debugging.

#### US-015: Agentic Evaluation And Tuning Loop

As a developer, I want an agent to inspect failed evaluation cases and suggest
targeted improvements so iteration is faster during the hackathon.

Acceptance criteria:

- Evaluation failures can be exported to an agent-readable report.
- Agent proposes dictionary additions, ranking weight changes, or retrieval
  rules with evidence from the datasets.
- Proposed changes require developer acceptance before becoming active.
- Accepted changes are reproducible in config or code.
- The evaluation report compares before/after metrics.

#### US-016: Explainable Suggestion Narrator

As a judge or product stakeholder, I want to understand why a suggestion was
returned so I can trust the system.

Acceptance criteria:

- Demo can show a short explanation for a selected suggestion.
- Explanation references source evidence such as POI match, abbreviation,
  popularity, location, or user preference.
- Explanation never invents facts not present in candidate metadata.
- Explanation generation is optional and does not block real-time suggestions.

### Phase 6: Hackathon Packaging And Deployment

Goal: make the project easy to run, judge, demo, and deploy.

#### US-017: Submission README And Example Gallery

As a judge, I want clear setup and usage instructions so I can run or understand
the project quickly.

Acceptance criteria:

- README explains the problem, architecture, setup, run commands, demo flow,
  technologies, and methodology.
- README includes at least 10 example inputs and generated suggestions.
- README documents personalization and intent prediction approach.
- README documents known limitations and synthetic-data assumptions.
- Commands are provided for macOS/Linux and Windows where applicable.

#### US-018: Deployable Demo

As a presenter, I want a public or locally shareable demo so the solution can be
shown reliably during Agentic AI Build Week.

Acceptance criteria:

- Demo can run locally from one documented command after setup.
- If deployed, environment variables and deployment steps are documented.
- Health check or smoke test confirms API and UI are live.
- Demo degrades cleanly if optional LLM/provider keys are missing.
- Final validation evidence includes evaluation metrics and smoke test output.

### Phase 7: Generalized Query Intelligence

Goal: move beyond fixture-heavy rules while keeping the real-time autocomplete
path deterministic, low-latency, and explainable.

#### US-019: Generalized Vietnamese Query Intelligence

As a Vietnamese map user, I want compact, accentless, or keyboard-artifact
prefixes to be interpreted without one hard-coded rule per typo.

Acceptance criteria:

- Compact Vietnamese prefixes such as `cap`, `caphe`, `cayx`, and `benhv`
  can resolve through algorithmic segmentation.
- Telex/VNI cleanup is guarded by dataset-derived evidence.
- Negative compact cases are not overcorrected without evidence.
- Agentic rewrite is skipped when deterministic segmentation is strong.

#### US-020: Semantic Retrieval Source

As a user, I want related phrases and out-of-order terms to retrieve useful
map suggestions even when exact prefix matching is weak.

Acceptance criteria:

- Semantic candidates are derived from dataset text, tags, categories, and
  popular queries.
- Semantic candidates flow through the same ranking and explanation metadata.
- Deterministic lexical retrieval remains available.

#### US-021: Persistent Alias Memory

As a developer, I want accepted corrections to be stored as inspectable alias
records so repeated fixes can be reused without retraining a model.

Acceptance criteria:

- Alias records include raw query, rewrite, intent, entities, scope, source,
  acceptance counts, status, and timestamp.
- Local/session aliases can be reused immediately.
- Global promotion requires developer acceptance or evaluation proof.

#### US-022: Local Embedding Retrieval And kNN Intent

As a user, I want semantically nearby POIs and queries to be considered before
the optional LLM layer runs.

Acceptance criteria:

- A local embedding index covers autocomplete, POI, and popular-query records.
- kNN neighbors can retrieve candidates and vote for likely intent.
- Diagnostics expose neighbors and intent vote.
- The implementation runs locally without paid services.

#### US-023: Optional Async LLM Rewrite Provider

As a developer, I want hard-case model help available behind validation without
putting a model on every keystroke.

Acceptance criteria:

- Hosted and local provider adapters return structured rewrite proposals.
- Provider output is parsed and validated before use.
- Unsafe or unrelated rewrites are rejected.
- Deterministic suggestions still work when no provider is configured.

#### US-024: Behavior Feedback Personalization

As a returning demo user, I want selected suggestions to influence future
ranking without collecting private production data.

Acceptance criteria:

- The demo records local selected-suggestion events.
- Behavior events can boost future matching brands, categories, cities, or
  selected texts for the same profile.
- The boost reason is exposed in suggestion metadata.
- Public evaluation remains deterministic without behavior events.

#### US-025: Ranking Weight Tuning Scaffold

As a developer, I want ranking changes to be explicit and measurable instead of
hidden inside ad hoc scoring code.

Acceptance criteria:

- Runtime requests can pass configurable ranking weights.
- A tuning command compares named weight presets against public evaluation.
- Reports include before/after metrics and the exact weights used.
- The docs state that this is a tuning scaffold, not a production-trained
  ranker.

### Phase 8: TASCO Maps API Integration

Goal: use the official TASCO hackathon API contract as the service boundary so
the autocomplete intelligence can sit in front of real map data instead of only
synthetic CSVs.

#### US-026: TASCO Maps API Facade

As an integrator, I want Tasco Whisperer to expose the full TASCO-compatible
hackathon API surface while still using the local engine as a stable fallback.

Acceptance criteria:

- `GET /v1/autocomplete` and `/autocomplete` return `suggestions` in
  TASCO `PlaceResult` shape.
- `GET /v1/search`, `/search`, and `/v1/geocode-search` return `results` in
  TASCO `PlaceResult` shape.
- `GET /v1/poi/{id}` and `/poi/{id}` return selected POI details.
- `GET /v1/reverse-geocoding`, `/reverse-geocoding`, and `/v1/reverse` return
  nearest place/address results.
- `GET /v1/nearby-search` and `/nearby-search` return nearby places around a
  coordinate.
- `GET /v1/geocoding` and `/geocoding` resolve address text to place results.
- `POST /v1/route` and `/route` return a route DTO with summary, geometry, and
  maneuvers.
- `GET /health` returns a simple success response.
- Query understanding runs before live upstream calls, so compact forms such as
  `caphe` can be sent upstream as expanded Vietnamese query text.
- Live upstream configuration supports base URL, bearer token, API key, locale,
  and timezone without hardcoding credentials.
- If the live upstream is missing, unavailable, or returns no valid data, the
  facade falls back to local deterministic data.
- Tests cover local fallback, live-client use, validation errors, and DTO
  mapping.

## 9. Suggested Architecture

```text
Demo UI / API Client
  -> Autocomplete API
    -> Query Normalization
    -> Intent + Entity Extraction
    -> Candidate Retrieval
      -> Autocomplete Dataset Index
      -> POI Index
      -> Popular Query Index
      -> Abbreviation Dictionary
      -> Template Generator
  -> Ranking Engine
  -> Behavior Feedback / Personalization Store
  -> Response Presenter
  -> Optional Agentic Layer
    -> Failure Analysis
    -> Explanation Generation
    -> Offline Ranking Tuning
  -> TASCO Maps Facade
    -> /v1/autocomplete
    -> /v1/search
    -> /v1/poi/{id}
    -> /v1/reverse-geocoding
    -> /v1/nearby-search
    -> /v1/geocoding
    -> /v1/route
    -> optional live upstream client
    -> local fallback presenter
```

Recommended implementation shape when code begins:

- `domain/`: query, suggestion, intent, POI, ranking score, user profile.
- `application/`: suggest query handler, evaluation runner, ranking pipeline.
- `infrastructure/`: CSV loader, in-memory indexes, config, optional LLM client.
- `interface/`: HTTP API, demo UI adapter, presenters.
- `eval/` or `scripts/`: public evaluation command and report generation.

Generalization roadmap after the initial MVP:

- synchronous deterministic tier: normalization, abbreviations, Vietnamese
  syllable segmentation, Telex/VNI cleanup, fuzzy retrieval, semantic-lite
  candidate retrieval, local embedding kNN retrieval, kNN intent voting, and
  transparent ranking
- future model tier: multilingual sentence embeddings can replace the local
  vectorizer when model files are available
- hard-case agent tier: optional LLM rewrite provider, strict validation,
  deterministic reranking, and persistent alias memory
- learning/tuning tier: local behavior feedback, alias-memory promotion with
  acceptance guardrails, and measured ranking-weight presets

## 10. Data Contract

Required dataset columns:

- Public Evaluation: `case_id`, `input_prefix`, `expected_suggestion_type`,
  `expected_top_suggestions`, `difficulty`, `skills_tested`.
- POI Dataset: `poi_id`, `poi_name`, `category`, `brand`, `address`, `city`,
  `latitude`, `longitude`, `rating`, `review_count`, `popularity_score`, `tags`.
- Autocomplete Dataset: `suggestion_id`, `input_prefix`, `suggestion_text`,
  `suggestion_type`, `score`, `query_frequency`.
- Abbreviation Dictionary: `abbreviation`, `expanded_form`, `type`.
- Popular Queries: `query_id`, `query_text`, `intent_type`,
  `monthly_frequency`, `region`.

Ingestion acceptance:

- Missing required file fails startup or evaluation with a specific message.
- Missing required column fails with file name and column name.
- Numeric fields are parsed and invalid values are reported.
- Tags are split into arrays.
- Semicolon-delimited expected suggestions are split for evaluation.

## 11. Ranking Formula V1

Initial ranking should be transparent and tunable:

```text
score =
  0.30 * lexical_match
+ 0.20 * intent_match
+ 0.15 * source_confidence
+ 0.10 * popularity_frequency
+ 0.10 * poi_quality
+ 0.05 * locality_match
+ 0.05 * personalization
+ 0.05 * diversity_bonus
```

The exact weights may change after evaluation, but changes must be recorded in
config or documentation and measured against the public evaluation set.

## 12. Tooling And Plugin Strategy

The project should use the available tools where they create concrete leverage:

| Tool/Skill/Plugin | Use In This Project | Acceptance Signal |
| --- | --- | --- |
| Harness CLI | Intake, story matrix, tool registry, trace records. | `scripts/bin/harness-cli query matrix` shows planned/implemented proof. |
| Computer Use / iPhone Mirroring | Observe T Maps iOS UX and capture demo steps without modifying the app. | Demo script references observed UI accurately. |
| Playwright or browser verification | Verify demo UI and API behavior once a web demo exists. | Screenshot/smoke proof with no console errors. |
| Context7 / official docs lookup | Fetch current library docs when selecting framework or API usage. | Implementation cites current docs when needed. |
| Figma | Optional design mockups for T Maps-style autocomplete UI. | Demo UI has a repeatable visual target if time allows. |
| Canva / presentation tooling | Optional final deck creation or asset resizing. | Hackathon deck matches final product behavior. |
| Vercel tooling | Optional deployment and deployment verification. | Live demo URL and health/smoke proof if deployed. |
| Spreadsheet/document skills | Inspect datasets and generate judge-facing reports if needed. | Evaluation outputs are readable and reproducible. |

External tools must degrade cleanly. If a capability is absent, the project
should skip that enhancement and keep the deterministic local demo working.

## 13. Validation Strategy

### Required Before Claiming MVP

- Dataset loader tests pass.
- Normalization and abbreviation tests pass.
- API happy-path tests pass.
- Public evaluation command runs all 60 cases.
- Demo UI can show at least 10 curated examples.

### Required Before Hackathon Submission

- Public evaluation metrics are reported.
- README contains setup, methodology, examples, and limitations.
- Demo can be run locally from documented commands.
- Optional deployment has smoke proof if used.
- Presentation or demo script does not overclaim native T Maps integration.

### Suggested Quality Targets

| Metric | MVP Target | Submission Target |
| --- | ---: | ---: |
| Easy-case top-3 recall | >= 80% | >= 90% |
| Overall top-3 recall | >= 60% | >= 75% |
| Overall top-5 recall | >= 70% | >= 85% |
| p95 local API latency | <= 150 ms | <= 100 ms |
| Curated demo examples | >= 10 | >= 15 |

## 14. Demo Example Set

At minimum, support these examples from the problem and dataset:

| Input | Expected Direction |
| --- | --- |
| `vin` | Vincom Center, Vinmec, Vinpearl. |
| `cafe` | Cafe nearby, Highlands Coffee, 24/7 cafe. |
| `atm` | ATM Vietcombank nearest, ATM nearby. |
| `ks da nang` | Hotels in Da Nang, beach-adjacent discovery suggestions. |
| `nguyen hue` | Nguyen Hue address and POIs on Nguyen Hue. |
| `ben thanh` | Cho Ben Thanh and nearby hotel/discovery suggestions. |
| `q1 cafe` | District 1 cafe/category suggestions. |
| `bv bach` | Bach Mai hospital. |
| `cay x` | Gas station nearby. |
| `coffee near` | Mixed English/Vietnamese nearby cafe intent. |

## 15. Open Decisions

1. Final app stack: keep unspecified until implementation starts. Likely
   options are Next.js/React for a fast demo or FastAPI plus a lightweight UI
   if backend clarity is prioritized.
2. LLM provider: optional. The deterministic autocomplete path must work
   without provider keys.
3. Native integration: currently not assumed. Real T Maps integration requires
   an API contract or SDK hook from the platform team.
4. Persistence: local JSON/SQLite is enough for hackathon personalization unless
   deployment requirements force a hosted store.

## 16. Definition Of Done

Tasco Whisperer is hackathon-ready when:

- A judge can run the demo and type Vietnamese map prefixes.
- Suggestions are ranked, typed, scored, and explainable.
- The public evaluation script reports measurable performance.
- The demo visibly connects to the T Maps search experience.
- Agentic behavior improves hard-case understanding, evaluation, or
  explanation without breaking real-time response.
- README and presentation materials clearly explain methodology, examples,
  limitations, and next steps.
