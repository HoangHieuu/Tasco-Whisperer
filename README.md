# Tasco Whisperer

Tasco Whisperer is an AI-assisted Vietnamese autocomplete and query suggestion
engine for Tasco Maps. It predicts what a user means before the query is
complete, handles Vietnamese input variations, returns ranked suggestions, and
explains why each suggestion was selected.

It was built for the Mobility Track P9 challenge: **AI-Powered Autocomplete &
Query Suggestions**.

> This is a local hackathon prototype using synthetic data. It is designed to
> demonstrate the search-intelligence layer that could sit beside or integrate
> with a map application; it does not modify the closed-source Tasco Maps iOS
> app.

## What problem it solves

Vietnamese map search is difficult when users type incomplete, unaccented,
abbreviated, misspelled, compact, or mixed-language queries. A conventional
prefix lookup may fail even when the intended place or category is obvious.

For example:

- `caphe` should be understood as `cà phê`.
- `ks da nang` should produce hotel suggestions scoped to Đà Nẵng.
- `atm` should prioritize nearby ATM intent instead of returning arbitrary text
  matches.
- `q1 cafe` should combine district and category context.

## Solution overview

The system processes each query through a low-latency, explainable pipeline:

```text
User input
  -> Vietnamese normalization and query understanding
  -> Candidate retrieval from datasets and semantic sources
  -> Intent-aware ranking and optional personalization
  -> Suggestions, diagnostics, and explanations
```

### 1. Query understanding

- Removes accent differences for matching while preserving the original query.
- Expands Vietnamese abbreviations such as `q1`, `tp hcm`, `hn`, `ks`, and `bv`.
- Handles compact syllables, guarded Telex/VNI input, common typos, and mixed
  Vietnamese/English queries.
- Extracts entities such as cities, districts, brands, categories, POIs,
  addresses, coordinates, attributes, and proximity terms.
- Predicts intent, including brand, category, nearby, POI, address, discovery,
  navigation, attribute, coordinate, and ambiguous search.

### 2. Candidate retrieval

Candidates are grounded in the provided hackathon data and generated artifacts:

- Historical autocomplete pairs.
- POIs and their categories, brands, locations, ratings, and tags.
- Popular queries.
- Abbreviation and alias mappings.
- Generated query patterns.
- Semantic similarity and MiniLM embedding neighbors.
- A deterministic prefix-completion prediction model.
- Optional validated rewrite proposals for difficult low-confidence queries.

### 3. Ranking and personalization

Suggestions are ranked using transparent factors:

- Lexical match and prefix evidence.
- Intent and entity fit.
- Source reliability.
- Query frequency and POI quality.
- City, coordinate, and time-of-day context.
- Bounded profile or behavior-based personalization.
- Diversity between results.

The default path is deterministic and does not require an LLM request for every
keystroke. Optional model or rewrite providers add evidence only when configured;
the local deterministic path remains the fallback.

### 4. Explanations and integration

Each suggestion can expose its source, matched evidence, score factors,
personalization reason, POI enrichment, and a human-readable `Why this result`
explanation.

The project includes:

- A T Maps-style browser demo.
- A local `/api/suggest` autocomplete API.
- A TASCO-compatible facade for autocomplete, search, POI, reverse geocoding,
  nearby search, geocoding, route, and health requests.
- A Flutter/Dart adapter for integrating the facade into a mobile client.

## Technology used

| Area | Technology |
| --- | --- |
| Browser UI | React, Vite, TypeScript, CSS, lucide-react |
| API runtime | Node.js, TypeScript, `tsx`, Node HTTP server |
| Query intelligence | Vietnamese normalization, abbreviation expansion, compact-syllable segmentation, Telex/VNI cleanup, entity extraction |
| Retrieval and models | Dataset-backed lexical retrieval, semantic retrieval, MiniLM embeddings via `@huggingface/transformers`, deterministic prefix-completion model |
| Ranking | Transparent scoring factors, personalization boosts, dependency-free pairwise learning-to-rank weights |
| Data | Synthetic CSV datasets supplied for the hackathon |
| Quality | Vitest, API smoke tests, robustness evaluation, Vite production build |
| Integration | JSON HTTP API, TASCO-compatible OpenAPI contract, Flutter/Dart adapter |

## Requirements

- Node.js `20.19+` or `22.12+`.
- npm.

The repository already contains the generated prediction and semantic artifacts
needed by the default demo. No external API key or LLM provider is required.

## Setup and run

Install dependencies:

```bash
npm install
```

Start the API and browser demo together:

```bash
npm run demo
```

Open:

- UI: <http://127.0.0.1:5173/>
- API: <http://127.0.0.1:8787/health>

Press `Ctrl+C` to stop both processes.

The demo starts with local deterministic data. If the API is unavailable, the
browser can fall back to its local suggestion engine.

### Run API and UI separately

Terminal 1:

```bash
npm run api:dev -- --host 127.0.0.1 --port 8787
```

Terminal 2:

```bash
npm run dev -- --host 127.0.0.1 --port 5173
```

### Use different ports

macOS/Linux:

```bash
TASCO_DEMO_API_PORT=8790 TASCO_DEMO_UI_PORT=5174 npm run demo
```

Windows PowerShell:

```powershell
$env:TASCO_DEMO_API_PORT="8790"
$env:TASCO_DEMO_UI_PORT="5174"
npm run demo
```

### Regenerate local artifacts

Only run these commands when the dataset or model configuration changes:

```bash
npm run prediction:build
npm run embeddings:build
```

They write:

- `data/prediction-lm.json`
- `data/semantic-embeddings.minilm.json`

The embedding build may download the configured Hugging Face model on its first
run. The committed artifact lets the normal demo run without rebuilding it.

## API usage

### Autocomplete endpoint

`GET /api/suggest` accepts:

| Parameter | Required | Description |
| --- | --- | --- |
| `q` | No | Incomplete query. Empty input returns popular fallback suggestions. |
| `city` | No | Hard city scope, for example `TP.HCM` or `Da Nang`. |
| `userId` | No | Demo profile or local behavior-learning identity. |
| `lat`, `lng`/`lon` | No | Current location for locality ranking. Provide both together. |
| `now` | No | ISO date-time used by time-aware ranking. |
| `limit` | No | Number of results, from 1 to 12. |
| `agentic` | No | Set to `false` to force deterministic-only behavior. |

Example:

```bash
curl "http://127.0.0.1:8787/api/suggest?q=caphe&city=TP.HCM&limit=3"
```

The response includes the normalized and expanded query, predicted intent,
ranked suggestions, latency, entity evidence, candidate counts, embedding
diagnostics, and agentic/fallback diagnostics.

Example response shape:

```json
{
  "query": "caphe",
  "normalizedQuery": "caphe",
  "expandedQuery": "ca phe",
  "intent": { "type": "Category Search", "confidence": 0.94 },
  "suggestions": [
    {
      "text": "Quán cà phê gần đây",
      "type": "Category Search",
      "score": 0.84,
      "source": "popular-query"
    }
  ],
  "latencyMs": 12
}
```

### Behavior feedback

The demo can record selected suggestions for local personalization:

```bash
curl -X POST "http://127.0.0.1:8787/api/behavior-events" \
  -H "content-type: application/json" \
  -d '{
    "userId":"local-demo",
    "query":"cafe",
    "selectedText":"Highlands Coffee Nguyễn Huệ",
    "selectedType":"POI Search",
    "brand":"Highlands Coffee",
    "city":"TP.HCM",
    "occurredAt":"2026-07-05T00:00:00.000Z"
  }'
```

Local behavior events and alias memory are disposable runtime files. They are
not production user-history storage.

### TASCO-compatible facade

The facade is documented in [`docs/hackathon/openapi.yaml`](docs/hackathon/openapi.yaml)
and supports these route families:

- `GET /v1/autocomplete`
- `GET /v1/search`
- `GET /v1/poi/{id}`
- `GET /v1/reverse` and `/v1/reverse-geocoding`
- `GET /v1/nearby-search`
- `GET /v1/geocoding`
- `POST /v1/route`
- `POST /v1/agent/tasks` plus task state, SSE events, clarification, confirmation,
  action-result, and cancellation routes
- `GET /health`

Examples:

```bash
curl "http://127.0.0.1:8787/v1/autocomplete?q=caphe&limit=5&sessionId=demo-1"
curl "http://127.0.0.1:8787/v1/search?q=coffee&lat=21.0278&lon=105.8342&limit=5"
curl "http://127.0.0.1:8787/v1/poi/poi:POI001?include=reviews,photos,hours,ai_summary"
curl "http://127.0.0.1:8787/v1/nearby-search?lat=10.7759&lon=106.7031&category=ATM&limit=3"
```

By default the facade uses local dataset-backed results. A live TASCO-compatible
upstream can be enabled on the Node API process with:

```bash
TASCO_API_BASE_URL="https://hackathon.example.com/v1" \
TASCO_API_KEY="<api_key>" \
npm run api:dev -- --host 127.0.0.1 --port 8787
```

Supported server-only credentials are `TASCO_API_KEY` and
`TASCO_BEARER_TOKEN`. Never put these values in committed files, browser code,
or `VITE_*` variables.

### Multi-agent mobility journey

The **Agent Journey** tab is a separate bounded runtime for complex requests;
ordinary autocomplete never waits for it. It uses three genuine, separately
prompted model agents: a Supervisor that interprets constraints and creates a
dynamic plan, a Mobility Executor that chooses and sequences allowlisted tools,
and an independent Verifier & Action Agent that inspects evidence, requests
replanning, or prepares a confirmation-gated action.

The runtime records every real model call and model-selected tool action in its
SSE trace. It enforces a 20-tool budget, two replans, schema validation, explicit
source/confidence labels, and confirmation before route mutation. OpenRouter is
required for production agent execution. Copy
`.env.example` to the ignored `.env` file and fill in:

```dotenv
TASCO_MOBILITY_AGENT_ENDPOINT=https://openrouter.ai/api/v1
TASCO_MOBILITY_AGENT_MODEL=openai/gpt-4o-mini
TASCO_MOBILITY_AGENT_API_KEY=sk-or-v1-your-key
```

Both `npm run demo` and `npm run api:dev` load `.env` automatically. The key
stays on the Node server and is never included in the Vite browser bundle.

If OpenRouter is absent, the agent task fails clearly instead of pretending that
fixed code is an agent. TASCO Pelias and Valhalla are used live first. Map-tool
outages may fall back to `data/agentic-mobility-demo.json` and deterministic
route estimates, visibly labeled `synthetic-demo` or `derived-estimate`.

### Flutter adapter

[`integrations/flutter/tasco_whisperer_adapter.dart`](integrations/flutter/tasco_whisperer_adapter.dart)
maps the facade response into a mobile-friendly suggestion DTO. See
[`integrations/flutter/README.md`](integrations/flutter/README.md) for usage.

## Evaluation and validation

Run the main checks:

```bash
npm run test          # unit and integration tests
npm run eval          # 60-case public evaluation
npm run eval:minilm   # async MiniLM server-path evaluation
npm run eval:robust   # generated robustness cases
npm run api:smoke     # HTTP route smoke test
npm run build         # TypeScript and production Vite build
npm run check         # test + eval + API smoke + build
```

Latest recorded local baseline:

| Evaluation | Cases | Top-1 | Top-3 | Top-5 | Intent | MRR | P95 latency |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Public evaluation | 60 | 93.3% | 100% | 100% | 98.3% | 0.967 | 29 ms |
| MiniLM async path | 60 | 93.3% | 100% | 100% | 98.3% | 0.967 | 31 ms |
| Robustness evaluation | 192 | — | 100% | 100% | — | — | 33 ms |

These figures are benchmark results for the supplied synthetic dataset, not a
claim about production Tasco Maps traffic or real-world search quality.

## Example queries

| Input | What it demonstrates | Example top suggestion |
| --- | --- | --- |
| `vin` | Brand prediction | `Vincom Center Đồng Khởi` |
| `cafe` | Category search | `Quán cà phê gần đây` |
| `caphe` | Accentless Vietnamese input | `Quán cà phê gần đây` |
| `atm` | Nearby intent | `ATM Vietcombank gần nhất` |
| `ks da nang` | Abbreviation and city scope | `Khách sạn Đà Nẵng gần biển` |
| `nguyen hue` | Address and POI retrieval | `Nguyễn Huệ, Quận 1, TP.HCM` |
| `ben thanh` | POI search | `Chợ Bến Thành` |
| `q1 cafe` | District plus category context | `Vincom Quán cà phê Phan Chu Trinh TP.HCM` |
| `bv bach` | Abbreviation plus POI matching | `Bệnh viện Bạch Mai` |
| `coffee near` | Mixed-language discovery | `Quán cà phê gần đây` |

The full generated example gallery is in
[`docs/submission/example-gallery.md`](docs/submission/example-gallery.md).

## Project structure

```text
src/
  App.tsx                    T Maps-style React demo
  lib/                       Query engine, ranking, retrieval, API contracts
scripts/
  api.ts                     Local API server entrypoint
  runDemo.mjs                Starts API and UI together
  evaluate.ts                Public evaluation runner
  smokeApi.ts                HTTP smoke test
  buildEmbeddings.ts         MiniLM artifact builder
  buildPredictionLm.ts       Prefix-completion model builder
data/                        Synthetic CSV data and generated artifacts
config/                      Runtime ranking weights
integrations/flutter/        Flutter/Dart adapter
docs/hackathon/              OpenAPI and facade documentation
docs/submission/             Example gallery and demo proof
```

## Limitations

- The datasets are synthetic hackathon assets, not production Tasco Maps data.
- Local POI hours, reviews, photos, and summaries are deterministic demo data
  unless a live upstream supplies them.
- Optional rewrite providers are disabled by default and are not required for
  the main demo.
- Personalization uses simulated profiles or disposable local behavior events;
  it is not a production recommendation system.
- The native Tasco Maps iOS app is not modified. Integration is demonstrated
  through the local API facade, browser UI, Flutter adapter, and presentation
  flow.

## Additional documentation

- [`Problem.md`](Problem.md) — original challenge statement.
- [`SPEC.md`](SPEC.md) — detailed product and API behavior specification.
- [`docs/hackathon/openapi.yaml`](docs/hackathon/openapi.yaml) — facade API
  contract.
- [`docs/demo/iphone-mirroring-demo.md`](docs/demo/iphone-mirroring-demo.md) —
  presentation flow beside the Tasco Maps app.
- [`docs/submission/demo-smoke-proof.md`](docs/submission/demo-smoke-proof.md) —
  recorded local demo verification.
