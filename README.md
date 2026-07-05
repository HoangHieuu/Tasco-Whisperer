# Tasco Whisperer

Tasco Whisperer is an agentic Vietnamese autocomplete and query suggestion
engine for T Maps. It is built for Agentic AI Build Week in Vietnam around the
Mobility Track P9 problem statement: AI-Powered Autocomplete & Query
Suggestions.

The project started from a Harness scaffold and now includes a working
React/Vite demo, deterministic autocomplete engine, model-backed semantic
runtime, optional agentic rewrite correction, grounded suggestion narrator,
public evaluation runner, local `/api/suggest` service, and Harness-backed
product contract.

## Hackathon Submission

Tasco Whisperer addresses Mobility Track P9 by acting as a Vietnamese map
search intelligence layer for T Maps. It predicts intent while a user types,
normalizes accents, typos, abbreviations, compact forms, and mixed
English/Vietnamese queries, retrieves suggestions from the provided datasets,
ranks them with transparent factors, and exposes a local demo API/UI that can
be shown beside the real T Maps app.

Submission deliverables in this repo:

- Source code and product contract in `src/`, `SPEC.md`, and `docs/product/`.
- Live local browser demo through `npm run dev`.
- Search API/service through `npm run api:dev`.
- TASCO-compatible facade and OpenAPI file in `docs/hackathon/openapi.yaml`.
- At least 10 generated examples in this README and the full gallery at
  `docs/submission/example-gallery.md`.
- Explanation and methodology notes in `explanation/` and the sections below.

## Technology Stack

- Frontend: React, Vite, TypeScript, CSS, and lucide-react icons.
- Runtime/API: Node.js, TypeScript, `tsx`, and local HTTP handlers.
- Data: provided synthetic CSV files under `data/`.
- AI/retrieval: deterministic Vietnamese normalization, abbreviation and alias
  expansion, compact syllable segmentation, generated query patterns,
  prefix-completion prediction language model, semantic retrieval, MiniLM
  embedding artifact support, kNN/direct-evidence intent voting, and optional
  validated rewrite providers.
- Evaluation: Vitest, public evaluation runner, robustness evaluation,
  ranking-tuning reports, learning-to-rank export, enrichment reports, API
  smoke checks, and Vite production build.

## Product Contract

Read these first:

- `SPEC.md`: complete product specification, phases, user stories, acceptance
  criteria, validation targets, and tool strategy.
- `Problem.md`: original hackathon challenge statement.
- `docs/product/overview.md`: short product contract.
- `docs/product/generalization-roadmap.md`: roadmap for moving beyond
  fixture-heavy rules into segmentation, semantic retrieval, alias memory, and
  optional hard-case model providers.
- `docs/stories/backlog.md`: candidate epics and planned user stories.
- `docs/TEST_MATRIX.md`: behavior-to-proof matrix.

## Dataset

Synthetic hackathon data lives in `data/`:

- Public evaluation cases.
- POI dataset.
- Historical autocomplete pairs.
- Abbreviation dictionary.
- Popular query dataset.
- Dataset README.

The public evaluation CSV is the baseline regression suite for autocomplete
quality once implementation begins.

## Harness Workflow

This repo uses the Rust Harness CLI:

```bash
scripts/bin/harness-cli query matrix
scripts/bin/harness-cli query tools --summary
scripts/bin/harness-cli query intakes
```

Before implementation work, classify the request through `docs/FEATURE_INTAKE.md`
and update story/proof records as work moves from planned to implemented.

## Current State

- `SPEC.md` exists and defines the Tasco Whisperer product.
- Harness DB is initialized locally.
- Planned stories US-001 through US-018 are seeded in the Harness story matrix.
- US-001 through US-030 have working proof.
- The app runs as a React/Vite TypeScript demo with a deterministic local
  autocomplete engine, Vietnamese segmentation/Telex cleanup, semantic
  candidate retrieval, deterministic prefix-completion prediction, MiniLM
  embedding artifact/runtime for Node API usage, persistent runtime-writable
  alias memory, validated rewrite correction path, behavior-feedback
  personalization with a server-side event log, configurable and learned
  runtime ranking weights, grounded suggestion explanations, data-derived generated query patterns, robustness evaluation,
  learning-to-rank feature export, and local API service.

## Setup

macOS/Linux:

```bash
npm install
npm run embeddings:build
npm run prediction:build
npm run dev -- --host 127.0.0.1 --port 5173
```

Windows PowerShell:

```powershell
npm install
npm run embeddings:build
npm run prediction:build
npm run dev -- --host 127.0.0.1 --port 5173
```

Open `http://127.0.0.1:5173/`.

For the full local demo, run the API and UI together with one command:

```bash
npm run demo
```

Windows PowerShell:

```powershell
npm run demo
```

This starts the API on `http://127.0.0.1:8787` and the UI on
`http://127.0.0.1:5173`. The launcher accepts optional port overrides:

```bash
TASCO_DEMO_API_PORT=8790 TASCO_DEMO_UI_PORT=5174 npm run demo
```

Windows PowerShell:

```powershell
$env:TASCO_DEMO_API_PORT="8790"; $env:TASCO_DEMO_UI_PORT="5174"; npm run demo
```

You can also run the API and UI in two terminals.

macOS/Linux:

```bash
npm run api:dev -- --host 127.0.0.1 --port 8787
npm run dev -- --host 127.0.0.1 --port 5173
```

Windows PowerShell:

```powershell
npm run api:dev -- --host 127.0.0.1 --port 8787
npm run dev -- --host 127.0.0.1 --port 5173
```

Then open `http://127.0.0.1:5173/`. The UI calls the local TASCO facade at
`http://127.0.0.1:8787` when available and falls back to the browser-local
engine if the API is offline.

## API

Run the local autocomplete API:

```bash
npm run api:dev -- --host 127.0.0.1 --port 8787
```

The organizer-compatible mock server entrypoint is also available:

```bash
node docs/hackathon/mock_api_server.js
```

Windows PowerShell:

```powershell
npm run api:dev -- --host 127.0.0.1 --port 8787
```

Example request:

```bash
curl "http://127.0.0.1:8787/api/suggest?q=cafe%20wifi&city=TP.HCM&userId=coffee-loyal&limit=3"
```

The endpoint accepts `q`, `city`, `userId`, `lat`, `lng`, `limit`, and
`agentic`. Set `agentic=false` to prove deterministic-only fallback behavior.
Invalid parameters return a `4xx` JSON error. Empty `q` returns deterministic
popular query fallback suggestions.

Selection feedback can be recorded locally for the active `userId`:

```bash
curl -X POST "http://127.0.0.1:8787/api/behavior-events" \
  -H "content-type: application/json" \
  -d '{"userId":"local-demo","query":"cafe","selectedText":"Highlands Coffee Nguyễn Huệ","selectedType":"POI Search","brand":"Highlands Coffee","city":"TP.HCM","occurredAt":"2026-07-05T00:00:00.000Z"}'
```

The TASCO facade also accepts `POST /v1/behavior-events`. Stored events are
replayed into `/api/suggest` and facade autocomplete/search ranking for the
matching `userId` or `sessionId`.

The Node API can use the generated MiniLM artifact and optional rewrite
providers while preserving deterministic fallback:

```bash
TASCO_SEMANTIC_ARTIFACT="data/semantic-embeddings.minilm.json" \
TASCO_REWRITE_PROVIDER="hosted-mini" \
TASCO_REWRITE_ENDPOINT="http://127.0.0.1:11434/api/generate" \
TASCO_REWRITE_MODEL="qwen2.5:3b" \
npm run api:dev -- --host 127.0.0.1 --port 8787
```

If the semantic artifact or rewrite endpoint is missing, responses degrade to
the lexical/deterministic path and expose provider/degradation metadata instead
of failing the request.

### TASCO Maps Facade

The API service also exposes the hackathon-compatible routes from
`tasco_maps_hackathon_api_documentation.pdf`:

```bash
curl "http://127.0.0.1:8787/v1/autocomplete?q=caphe&limit=5&sessionId=demo-1"
curl "http://127.0.0.1:8787/v1/search?q=coffee&lat=21.0278&lon=105.8342&limit=5"
curl "http://127.0.0.1:8787/v1/poi/poi:POI001?include=reviews,photos,hours,ai_summary"
curl "http://127.0.0.1:8787/v1/reverse?point.lat=10.7759&point.lon=106.7031"
curl "http://127.0.0.1:8787/v1/nearby-search?lat=10.7759&lon=106.7031&category=ATM&limit=3"
curl "http://127.0.0.1:8787/v1/geocoding?address=Nguyen%20Hue&city=TP.HCM&limit=3"
curl -X POST "http://127.0.0.1:8787/v1/route" \
  -H "Content-Type: application/json" \
  -d '{"locations":[{"lat":10.7759,"lon":106.7031},{"lat":10.772,"lon":106.698}],"mode":"auto"}'
curl "http://127.0.0.1:8787/v1/search?q=cafe&mockError=unauthorized"
curl "http://127.0.0.1:8787/health"
```

Aliases are supported for quick demos:

- `/autocomplete`
- `/search`
- `/v1/geocode-search`
- `/poi/{id}`
- `/reverse-geocoding`
- `/v1/reverse`
- `/nearby-search`
- `/geocoding`
- `/route`

By default these routes use Tasco Whisperer query understanding and local
fallback data. To call a live TASCO-compatible upstream first, configure:

```bash
TASCO_API_BASE_URL="https://hackathon.example.com/v1" \
TASCO_API_KEY="<api_key>" \
npm run api:dev -- --host 127.0.0.1 --port 8787
```

Supported live credentials:

- `TASCO_BEARER_TOKEN`
- `TASCO_API_KEY`

Keep these credentials on the Node API process only. Do not put bearer tokens
or API keys in `VITE_*` variables or browser/mobile code. The browser UI calls
the local facade at `VITE_TASCO_API_BASE_URL` or `http://127.0.0.1:8787`; the
facade adds `Authorization`, `X-API-Key`, `X-Request-Id`, `X-Locale`, and
`X-Timezone` when calling TASCO-compatible upstream services.

The facade sends normalized/expanded Vietnamese queries upstream for
autocomplete/search. For example, `caphe` is understood locally as `ca phe`,
then the facade calls the live `/v1/autocomplete` or `/v1/search` endpoint with
the expanded query. POI, reverse geocoding, nearby search, geocoding, and route
requests also try the live TASCO-compatible endpoint first when configured. If
the live endpoint is missing, empty, or unavailable, the response falls back to
local deterministic data and marks `meta.source` as `local-fallback`.

For mock demos, POI detail supports `include=reviews,photos,hours,ai_summary`.
POI responses keep the familiar scalar fields and add an `enrichment` block
with field-level source, confidence, evidence, generated/verified flags,
deterministic attributes, and live/local reconciliation notes. Vietnamese
`aiSummary` text is generated only from known dataset/upstream fields. Reviews
and photos remain deterministic demo placeholders unless supplied by a live
upstream, and are marked as `local-mock` with `verifiedRealWorld=false`.
Documented error responses can be exercised without requiring real auth or
upstream failures by passing `mockError=<code>`, for example `unauthorized`,
`rate_limited`, `timeout`, or `service_unavailable`.

The OpenAPI contract for the facade is available at
`docs/hackathon/openapi.yaml`.

### Flutter Thin Adapter

The repo includes a Flutter/Dart adapter in
`integrations/flutter/tasco_whisperer_adapter.dart`. It calls the documented
TASCO facade routes, keeps auth pluggable through a `headerProvider`, and maps
`PlaceResult` rows into an app-compatible suggestion DTO that can be converted
to the existing Flutter `SearchSuggestion` model.

See `integrations/flutter/README.md` for the copy/import snippet and
`SearchSuggestion` mapping example.

## Validation

```bash
npm run test
npm run eval
npm run eval:minilm
npm run eval:robust
npm run embeddings:build
npm run rank:tune
npm run rank:train
npm run enrich:report
npm run tune:agentic
npm run alias:memory -- --rawQuery cf --rewrite "cà phê" --intent "Category Search"
npm run api:smoke
npm run build
npm run check
```

Current public evaluation baseline:

- 60 cases run.
- Top-1 accuracy: 93.3%.
- Top-3 recall: 100%.
- Top-5 recall: 100%.
- Intent accuracy: 98.3%.
- MRR: 0.967.
- P95 latency: 36 ms.

MiniLM async server-path evaluation:

- Artifact: 316 documents, 384 dimensions.
- 60 cases run through `suggestAsync()`.
- Top-1 accuracy: 93.3%.
- Top-3 recall: 100%.
- Top-5 recall: 100%.
- Intent accuracy: 98.3%.
- MRR: 0.967.
- P95 latency: 31 ms after the cold model-load outlier.
- Embedding provider: MiniLM for 60/60 cases, with 0 degraded embedding cases.

Supplemental robustness baseline:

- 192 generated cases from the provided CSV labels only.
- Top-3 recall: 100%.
- Top-5 recall: 100%.
- Compact transform top-3 recall: 100%.
- P95 latency: 28 ms.

Learning-to-rank baseline:

- 1,626 robustness perturbation rows plus 0 current behavior rows.
- Held-out validation top-3 recall: 100%.
- Held-out validation NDCG@5: 0.955.

Enrichment coverage baseline:

- 62/62 POIs have Vietnamese evidence-based summaries.
- 62/62 POIs have deterministic derived opening-hour estimates.
- Average deterministic attributes per POI: 6.194.
- No outside enrichment corpus is imported.

This is the current local demo baseline. It uses Vietnamese normalization,
abbreviation expansion, algorithmic compact syllable segmentation, guarded
Telex/VNI cleanup, a generated MiniLM embedding artifact with lexical fallback,
kNN/direct-evidence intent voting, entity extraction, semantic templates,
transparent score factors, simulated profile boosts, server-side behavior
feedback from selected suggestions, configurable and learned ranking weights, a
local `/api/suggest` HTTP service, runtime-writable alias memory, and a
validated agentic rewrite contract for low-confidence variants that remain hard
after the deterministic tiers. Simulated profiles include
`coffee-loyal`, `danang-traveler`, and `commuter`; the demo also has a
`local-demo` learner profile backed by browser local storage and the local API
behavior log. Boosted suggestions expose the reason in metadata. The
browser/synchronous path keeps a local lexical fallback; the Node API can load
`data/semantic-embeddings.minilm.json` and embed only the query at runtime. A
hosted/local rewrite-provider adapter exists through `npm run rewrite:agent`
and the API runtime env vars above, but it only runs when an endpoint is
configured and remains outside the per-keystroke path.
Accepted hosted/local rewrites are written back to alias memory during serving:
the API mutates the loaded records and persists `data/alias-memory.local.json`
so repeat queries become deterministic without restarting the process.
`npm run rank:tune` compares named ranking-weight presets against the public
evaluation suite and writes reports to `reports/ranking-tuning/latest.json` and
`reports/ranking-tuning/latest.md`.
`npm run eval:robust` writes supplemental metamorphic robustness reports to
`reports/robustness/latest.json` and `reports/robustness/latest.md`.
Compact alias/abbreviation variants such as `ksd`, `coffeenear`,
`nguyenhuee`, `12nguyenhueq`, and `dhbk` now resolve through the same
deterministic understanding path rather than the agentic fallback.
`npm run rank:train` writes a dependency-free pairwise learning-to-rank model
to `config/ranking-weights.json`, `reports/learning-to-rank/latest.json`, and
`reports/learning-to-rank/latest.md`; the engine loads the config as runtime
defaults unless `TASCO_DISABLE_LEARNED_RANKER=true` or
`VITE_TASCO_DISABLE_LEARNED_RANKER=true` is set.
`npm run enrich:report` writes field-provenance and deterministic-attribute
coverage to `reports/enrichment/latest.json` and
`reports/enrichment/latest.md`.
`npm run tune:agentic` exports advisory weak-case tuning reports to
`reports/agentic-tuning/latest.json` and `reports/agentic-tuning/latest.md`;
proposals require explicit developer acceptance before changing runtime
ranking, templates, or alias memory.
The local API also exposes TASCO PDF-compatible `/v1/autocomplete`,
`/v1/search`, `/v1/poi/{id}`, `/v1/reverse-geocoding`, `/v1/nearby-search`,
`/v1/geocoding`, `/v1/route`, and `/health` routes, with optional live upstream
calls configured by `TASCO_API_BASE_URL`.

## Methodology

The engine follows the suggested problem architecture:

1. User input layer: the API/UI accepts incomplete Vietnamese prefixes plus
   optional `city`, `lat`, `lng`, `userId`, and `limit`.
2. Query understanding layer: the prefix is normalized, accents are stripped for
   matching, abbreviations are expanded, compact syllables are split when
   dataset evidence supports the split, and entities are extracted.
3. Prediction/retrieval layer: candidates come from autocomplete pairs, POIs,
   popular queries, generated patterns, semantic evidence, embedding neighbors,
   and validated low-confidence rewrites.
4. Ranking layer: transparent score factors combine lexical match, intent fit,
   source reliability, popularity, POI quality, locality, personalization, and
   diversity.
5. Personalization layer: simulated profiles and local browser behavior events
   add bounded boosts while preserving deterministic fallback behavior.
6. Explanation layer: selected suggestions expose grounded source, matched
   evidence, ranking reason, score factors, POI/enrichment fields, and
   personalization reasons when present.

Intent prediction is returned in every response with type, confidence, and
evidence. The current intent families include brand, category, nearby, POI,
address, discovery, navigation, attribute, coordinate, and ambiguous search.

Personalization is hackathon-safe: built-in demo profiles such as
`coffee-loyal`, `danang-traveler`, and `commuter` are simulated, while the
browser demo records selected suggestions locally under the `local-demo`
profile. No production user history is collected.

## Demo Inputs

The UI includes these curated examples:

- `vin`
- `cafe`
- `caphe`
- `atm`
- `nguyen h`
- `ben th`
- `ks d`
- `bv bach`
- `cay x`
- `pho th`
- `coffee near`
- `q1 cafe`
- `vincom dong k`

## Example Gallery

These generated examples are from the current CSV-backed engine. See
`docs/submission/example-gallery.md` for the longer table and reproduction
notes.

| Input | Intent | Top generated suggestions |
| --- | --- | --- |
| `vin` | Brand Search | `Vinpearl`; `Vincom Center`; `Vinmec` |
| `cafe` | Category Search | `Quán cà phê gần đây`; `Coffee near me`; `Vincom Quán cà phê Phan Chu Trinh TP.HCM` |
| `caphe` | Category Search | `Quán cà phê gần đây`; `Coffee near me`; `Vincom Quán cà phê Phan Chu Trinh TP.HCM` |
| `atm` | Nearby Search | `ATM Vietcombank gần nhất`; `ATM BIDV gần đây`; `ATM gần sân bay` |
| `ks da nang` | Discovery Search | `Khách sạn Đà Nẵng gần biển`; `Khách sạn Đà Nẵng`; `Khách sạn gần biển Đà Nẵng` |
| `nguyen hue` | Address Suggestion | `Nguyễn Huệ, Quận 1, TP.HCM`; `Highlands Coffee Nguyễn Huệ`; `12 Nguyễn Huệ, Quận 1, TP.HCM` |
| `ben thanh` | POI Search | `Chợ Bến Thành`; `Khách sạn gần Chợ Bến Thành` |
| `q1 cafe` | Category Search | `Vincom Quán cà phê Phan Chu Trinh TP.HCM`; `Quán cà phê gần đây`; `Highlands Coffee Nguyễn Huệ` |
| `bv bach` | POI Search | `Bệnh viện Bạch Mai`; `Trường Đại học Bách Khoa Hà Nội`; `Bệnh viện Trần Duy Hưng Đà Nẵng` |
| `cay x` | Nearby Search | `Cây xăng gần đây`; `Trạm xăng gần đây`; `Lotte Mart Cây xăng Hai Bà Trưng Hải Phòng` |
| `coffee near` | Discovery Search | `Quán cà phê gần đây`; `Coffee near me`; `Vincom Quán cà phê Phan Chu Trinh TP.HCM` |
| `vincom dong k` | POI Search | `Vincom Center Đồng Khởi`; `vincom đồng khởi` |

## Demo Flow

1. Start the API and UI with the commands above.
2. Open `http://127.0.0.1:5173/`.
3. Type or click the curated prefixes in the left rail.
4. Show the ranked suggestions, intent chips, entity evidence, score factors,
   TASCO facade status, and `Why this result` explanation panel.
5. Select a suggestion to record local behavior feedback, then rerun a related
   query to show the personalization reason.
6. Use `docs/demo/iphone-mirroring-demo.md` when presenting beside the real
   T Maps app. The repo does not modify the closed-source iOS app.

## Limitations

- The datasets are synthetic hackathon assets, not production T Maps data.
- Real-world availability, opening hours, reviews, and photos are deterministic
  demo fields unless provided by a configured live upstream.
- Optional hosted/local rewrite providers are disabled by default and are not
  required for the main demo.
- The MiniLM artifact improves semantic context in the Node API path but the
  browser demo keeps a deterministic local fallback.
- Personalization is simulated or local to the browser demo; it is not a
  production user-history system.
- Native T Maps integration is represented by the compatible API facade,
  Flutter adapter, and presentation flow, not by modifying the iOS app.

## iPhone Mirroring Demo

Use [docs/demo/iphone-mirroring-demo.md](docs/demo/iphone-mirroring-demo.md)
for the hackathon presentation flow. It explains how to show the real T Maps
search entry point in iPhone Mirroring, switch to Tasco Whisperer, run the hard
Vietnamese examples, show `/api/suggest`, and avoid overclaiming production
iOS integration.

## Final Smoke Proof

US-018 local demo smoke proof is recorded in
`docs/submission/demo-smoke-proof.md`. The latest proof used:

```bash
TASCO_DEMO_API_PORT=8790 TASCO_DEMO_UI_PORT=5174 npm run demo
```

It verified `/health`, `/api/suggest`, browser load at
`http://127.0.0.1:5174/`, `8/8 TASCO APIs`, query `ks da nang`, local learner
selection, grounded explanation rendering, clean browser console, and
`npm run check`.

## Likely Next Slice

All planned implementation and packaging stories are now proof-backed. The
remaining optional work is public deployment or presentation-deck polish if the
submission venue requires it.

## Repository Structure

```text
project/
  AGENTS.md
  SPEC.md
  Problem.md
  data/
  README.md
  docs/
    HARNESS.md
    FEATURE_INTAKE.md
    ARCHITECTURE.md
    TEST_MATRIX.md
    product/
    stories/
    decisions/
    templates/
  scripts/
    README.md
    bin/harness-cli
    runDemo.mjs
```
