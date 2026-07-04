# Full Architecture Explained

## Purpose

Tasco Whisperer is an agentic Vietnamese autocomplete and query suggestion
engine for T Maps. It is designed to sit between a map search UI and one or
more map/search data providers. The system accepts incomplete user input,
normalizes Vietnamese variants, predicts intent, retrieves candidate
suggestions, ranks them, enriches POI results, and returns an integration-ready
API response.

The current implementation is a local, deterministic TypeScript system with
optional live TASCO-compatible upstream calls. It does not require an LLM or
external dataset to respond to a keystroke.

## High-Level Runtime

```text
Browser demo / Flutter adapter / REST client
        |
        v
Node API server
        |
        +--> /api/suggest debug autocomplete endpoint
        |
        +--> TASCO facade endpoints /v1/*
                 |
                 +--> local query understanding
                 +--> optional live TASCO-compatible upstream
                 +--> local fallback data
```

The main runtime surfaces are:

- `src/App.tsx`: React/Vite demo UI.
- `scripts/api.ts` and `scripts/apiServer.ts`: local HTTP server.
- `src/lib/suggestApi.ts`: internal debug autocomplete endpoint.
- `src/lib/tascoFacade.ts`: TASCO-compatible REST facade.
- `src/lib/tascoApiClient.ts`: optional live upstream client.
- `src/lib/engine.ts`: core autocomplete, intent, retrieval, ranking, and
  personalization engine.
- `src/lib/enrichment.ts`: POI provenance, confidence, summaries, attributes,
  and reconciliation logic.
- `integrations/flutter/tasco_whisperer_adapter.dart`: thin Flutter/Dart
  adapter for app integration.

## Data Layer

The demo uses the provided synthetic hackathon CSV files in `data/`:

| Dataset | Rows | Used for |
| --- | ---: | --- |
| README | 5 | Dataset notes and synthetic-data constraint. |
| Public Evaluation | 60 | Offline quality and latency evaluation. |
| POI Dataset | 62 | Places, IDs, names, categories, brands, addresses, cities, WGS84 coordinates, ratings, review counts, popularity, tags. |
| Autocomplete Dataset | 24 | Historical prefix-to-suggestion pairs, scores, frequencies. |
| Abbreviation Dictionary | 15 | Vietnamese abbreviations and aliases such as `ks`, `bv`, `hn`, `dn`, `tp hcm`. |
| Popular Queries | 10 | Trend/frequency signals and regional query intent. |

The local demo data is synthetic and hackathon-only. Live data can be used only
through a configured TASCO-compatible upstream, and that path is explicitly
marked in response metadata.

## Query Processing Flow

```text
raw query
  -> normalization
  -> abbreviation expansion
  -> Vietnamese compact-form rewrite, for example caphe -> ca phe
  -> entity extraction
  -> semantic/embedding context
  -> candidate retrieval
  -> optional validated agentic rewrite for hard cases
  -> intent prediction
  -> ranking and deduplication
  -> response DTO
```

### 1. Normalization

Implemented in `src/lib/normalize.ts` and used by `src/lib/engine.ts`.

The engine lowercases text, removes accent sensitivity for matching, normalizes
spacing/punctuation, expands abbreviations, and preserves the original display
text in responses. Compact Vietnamese forms are handled algorithmically when
there is dataset or lexicon evidence, for example:

- `caphe` -> `ca phe`
- `khachsan` -> `khach san`
- `benhvien` -> `benh vien`

### 2. Entity Extraction

The engine extracts entities such as:

- brand
- category
- POI
- street
- city
- district
- attribute
- proximity
- navigation
- coordinate
- address

Entity evidence comes from query tokens, abbreviation records, POI fields,
semantic templates, validated agent proposals, and alias-memory records.

### 3. Candidate Retrieval

Candidate generation merges several sources:

- Autocomplete pairs from the historical autocomplete CSV.
- POI rows from the POI CSV.
- Popular queries from the popular-query CSV.
- Local embedding and semantic retrieval over dataset-derived documents.
- Generated patterns from category, attribute, brand, and city signals.
- Hand-authored semantic templates for known Vietnamese map-search patterns.

Each candidate carries:

- stable ID
- display text
- predicted suggestion type
- source
- matched evidence
- base score
- frequency score
- explanation reason
- optional POI record

### 4. City Scope

If a request includes `city`, city is treated as a hard scope for explicit POI
and city-specific suggestions. Generic suggestions such as `Quán cà phê gần
đây` can remain, but rows that clearly belong to another known city are removed.

Known city aliases include:

- TP.HCM, HCM, Ho Chi Minh, Sài Gòn
- Hà Nội
- Đà Nẵng
- Đà Lạt
- Nha Trang
- Hải Phòng

This applies in the core engine, facade response filtering, frontend adapter,
and profile/behavior personalization.

### 5. Intent Prediction

Intent prediction combines:

- category keyword signals
- candidate-source votes
- extracted entity votes
- embedding-neighbor intent votes
- hard signals such as coordinates or navigation phrases

Supported intent types include:

- Brand Search
- Category Search
- Nearby Search
- POI Search
- Address Suggestion
- Discovery Search
- Navigation
- Attribute Search
- Coordinate Search
- Ambiguous

### 6. Ranking

Ranking happens in `rankAndMerge()` inside `src/lib/engine.ts`.

Each candidate receives transparent score factors:

- lexical
- intent
- source
- popularity
- poiQuality
- locality
- personalization
- diversity

The default weighted score is:

```text
score =
  lexical * 0.30 +
  intent * 0.20 +
  source * 0.15 +
  popularity * 0.10 +
  poiQuality * 0.10 +
  locality * 0.05 +
  personalization * 0.05 +
  diversity * 0.05
```

The engine deduplicates by normalized suggestion text, keeps the best-scoring
version, sorts descending, applies source tie-breaks, and returns the requested
limit.

### 7. Enrichment

POI enrichment is implemented in `src/lib/enrichment.ts`.

The system adds:

- field-level provenance
- confidence per known or derived field
- deterministic attributes from category, tags, rating, review count, and
  popularity
- Vietnamese summaries generated only from known fields
- local-derived opening-hour estimates
- explicit mock labels for demo reviews/photos
- live/local reconciliation when upstream and local values disagree

Enrichment data is not silently treated as verified real-world truth. Every
field marks its source and whether it is generated or verified.

### 8. TASCO-Compatible Facade

The facade exposes the hackathon-compatible API:

- `GET /v1/autocomplete`
- `GET /v1/search`
- `GET /v1/poi/{id}`
- `GET /v1/reverse-geocoding`
- `GET /v1/nearby-search`
- `GET /v1/geocoding`
- `POST /v1/route`
- `GET /health`

Aliases such as `/autocomplete`, `/search`, `/poi/{id}`, `/v1/reverse`,
`/geocoding`, and `/route` are supported for demo compatibility.

When `TASCO_API_BASE_URL` is configured, the facade calls the live upstream
first. If the upstream is absent, errors, returns no rows, or returns rows that
fail selected-city scope, the facade returns local deterministic fallback data
and marks `meta.source` as `local-fallback`.

### 9. Frontend and Client Integration

The React demo calls `/v1/autocomplete` through `src/lib/frontendSuggest.ts`.
It forwards:

- query
- limit
- language
- city
- user/profile ID
- optional coordinates

The frontend adapter also performs defensive city filtering so a stale API
response cannot display out-of-city suggestions.

For mobile integration, the Flutter adapter keeps base URL and auth configurable
and maps TASCO facade `PlaceResult` rows into app-facing suggestion DTOs.

## Observability

The API server logs one JSON line per request with:

- timestamp
- level
- request_id
- user_id when available
- action
- query
- duration_ms
- status_code
- message

Responses also include metadata such as normalized/expanded query, source, and
whether upstream was used.

## Validation

The repo validates this architecture with:

- `npm run test`
- `npm run eval`
- `npm run eval:robust`
- `npm run rank:tune`
- `npm run rank:train`
- `npm run enrich:report`
- `npm run api:smoke`
- `npm run build`
- Harness story verification through `scripts/bin/harness-cli story verify`.

Current public evaluation proof after the city-scope fix:

- 60 public cases.
- Top-1 accuracy: 93.3%.
- Top-3 recall: 100%.
- Top-5 recall: 100%.
- MRR: 0.964.
- Intent accuracy: 68.3%.
- P95 local evaluation latency: about 38 ms.

## Current Production Gaps

The architecture is integration-ready for a hackathon demo, but not full
production search infrastructure yet:

- Local POI data is synthetic.
- Reviews/photos are local mock placeholders unless a live upstream supplies
  them.
- There is no large licensed external POI corpus integrated in the default
  path.
- Runtime ranking is transparent weighted scoring, not a deployed LambdaMART,
  XGBoost, or LightGBM model.
- Optional external NLP, ranker, POI corpus, and agent modules have typed
  interfaces but are not mandatory runtime dependencies.
