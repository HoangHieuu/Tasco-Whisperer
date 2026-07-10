# Notes About Ranking, Enrichment, Latency, Fallback, And Data Provenance

## Ranking Notes

Ranking is deterministic and explainable. It is implemented in
`src/lib/engine.ts`.

### Candidate Sources

The engine ranks candidates from:

- `autocomplete`: historical prefix-to-suggestion pairs.
- `poi`: POI rows from the synthetic hackathon POI dataset.
- `popular-query`: frequent/trending queries.
- `generated`: data-derived category/attribute/location phrase candidates.
- `predicted`: deterministic prefix-completion language-model candidates.
- `template`: semantic templates for known Vietnamese map-search intents.
- `semantic`: similarity over dataset-grounded semantic documents.
- `embedding`: MiniLM kNN retrieval in the Node API path, with lexical
  fallback.

### Ranking Factors

Each suggestion has these factors in `metadata.factors`:

| Factor | Meaning |
| --- | --- |
| `lexical` | Prefix, fuzzy, compact-form, or semantic base match quality. |
| `intent` | Whether the candidate type matches predicted intent. |
| `source` | Trust/priority of the candidate source. |
| `popularity` | Frequency, monthly query volume, or POI popularity. |
| `poiQuality` | POI rating, review count, and popularity. |
| `locality` | Selected-city scope, coordinate distance, and time-of-day context. |
| `personalization` | Simulated profile or server/browser behavior boost. |
| `diversity` | Prevents generated/template/semantic sources from crowding all results. |

Runtime weights are loaded from `config/ranking-weights.json`, trained by
pairwise logistic regression on robustness perturbation rows plus optional
behavior selections. Current deployed weights are approximately:

| Factor | Weight |
| --- | ---: |
| lexical | 0.362 |
| intent | 0.263 |
| source | 0.093 |
| popularity | 0.059 |
| poiQuality | 0.000 |
| locality | 0.005 |
| personalization | 0.005 |
| diversity | 0.212 |

The final score is the weighted sum of these factors. Optional
`rankingWeights` can override the defaults for experiments. The static
hand-tuned weights remain available by setting
`TASCO_DISABLE_LEARNED_RANKER=true` or
`VITE_TASCO_DISABLE_LEARNED_RANKER=true`.

Coordinate and time context use the same transparent `locality` factor. When
`lat`/`lon` or `now` is active, the engine reserves enough locality weight for
that request-specific context to affect ranking, even though the learned global
locality weight is small.

### Personalization

Personalization is hackathon-safe:

- No private T Maps user logs are used.
- Built-in simulated profiles include `coffee-loyal`, `danang-traveler`, and
  `commuter`.
- The UI can record local selected-suggestion events in browser local storage.
- The API persists disposable selected-suggestion events in
  `data/behavior-events.local.json` by default.
- `POST /api/behavior-events` and `POST /v1/behavior-events` accept behavior
  events for the active `userId` or `sessionId`.
- Profile and behavior boosts are explainable through `personalizationReason`.
- If a city is selected, profile and behavior boosts apply only when compatible
  with that selected city.

### City Scope

City is a hard scope when supplied. Explicit POI rows and city-specific
semantic/generated suggestions from another known city are removed. Generic
category suggestions may remain because they do not identify a conflicting
city.

This prevents a TP.HCM request from showing Đà Nẵng, Đà Lạt, Hà Nội, or Hải
Phòng POIs.

### Coordinate And Time Context

When `lat` and `lon` are supplied:

- the engine can infer nearest city scope if `city` is absent
- POI candidates receive haversine distance-based `locality`
- ranking reasons include current-location distance evidence

When `now` is supplied:

- 24/7, `mở cửa khuya`, and `ăn đêm` candidates can be boosted at night
- breakfast/phở candidates can be boosted in the morning
- POIs open at the requested time can receive enrichment-hours context

Local opening hours are deterministic heuristics unless a live upstream supplies
verified hours, so explanations keep the evidence explicit.

## Enrichment Notes

Enrichment is implemented in `src/lib/enrichment.ts` and attached through the
TASCO facade in `src/lib/tascoFacade.ts`.

### What Is Enriched

POI results can include:

- `enrichment.fields`: field-level source, confidence, evidence, generated
  flag, verified-real-world flag, and optional note.
- `enrichment.attributes`: deterministic attributes such as `Có Wi-Fi`, `Gần
  biển`, `Đánh giá tốt`, `Rất phổ biến`.
- `enrichment.reconciliations`: live/local disagreements when a live upstream
  is used.
- `enrichment.summaryEvidence`: field names used to build summary text.
- Optional scalar fields such as `openingHours`, `aiSummary`, `reviews`, and
  `photos`.

### Enrichment Sources

| Source | Meaning |
| --- | --- |
| `provided-dataset` | Direct fields from the provided hackathon CSV dataset. |
| `local-derived` | Deterministic derived data from known fields, for example opening-hour heuristic, summary, quality/popularity attributes. |
| `local-mock` | Demo-only placeholders such as reviews/photos when no live upstream supplies them. |
| `live-upstream` | Data returned by a configured TASCO-compatible live upstream. |
| `reconciled` | Reconciliation context when local and live values disagree. |

### Vietnamese Evidence-Based Summaries

`aiSummary` is Vietnamese and generated only from known fields:

- label/name
- category
- address
- rating
- review count
- popularity score
- tags

It is not a free-form hallucinated summary. Its provenance marks
`source=local-derived`, `generated=true`, and `verifiedRealWorld=false` unless
a live upstream supplies a summary.

### Reviews And Photos

Local reviews/photos are deterministic demo placeholders:

- source: `local-mock`
- low confidence
- `verifiedRealWorld=false`
- notes explicitly say they are not real user reviews or verified media

If a live upstream supplies reviews/photos, the system preserves live values
and marks provenance as `live-upstream`.

## Latency Notes

The keystroke path is deterministic and local by default. No remote LLM is
required for autocomplete.

Expected local latency:

- Typical local evaluation requests: tens of milliseconds.
- Current public evaluation: p95 about 30 ms.
- Robustness evaluation: p95 about 33 ms over 192 generated perturbation cases.
- MiniLM async server path: p95 about 31 ms after the cold model-load outlier.
- Local API smoke requests are also in the tens-of-milliseconds range for the
  autocomplete/search paths.

Practical expectation for demo/local use:

- autocomplete target: under 100 ms locally
- p95 evaluation proof: about 30 ms
- live upstream mode: local processing plus network/upstream latency

If a live upstream is configured, latency depends on that provider. The facade
still keeps local deterministic fallback available.

## Fallback Notes

Fallback is a core design rule.

### Autocomplete And Search

For `/v1/autocomplete` and `/v1/search`:

1. Run local query understanding first.
2. Expand the query when possible, for example `caphe` -> `ca phe`.
3. Call live upstream if configured.
4. City-filter live results when a city is selected.
5. Use live results only if scoped live rows remain.
6. Otherwise return local deterministic fallback.

### Optional AI Components

- MiniLM embedding retrieval falls back to lexical similarity if the artifact,
  model, or runtime provider is missing.
- The deterministic prefix-completion model is built from the local dataset and
  does not call a remote service.
- The rewrite provider path is optional. Invalid, unsafe, or unrelated provider
  output is rejected, and deterministic results continue.
- Accepted rewrites can be persisted to `data/alias-memory.local.json` and
  reused without another provider call.

### POI Detail

For `/v1/poi/{id}`:

- Try live POI when configured.
- Use local POI if live is absent or fails.
- If neither exists, return `404 not_found`.
- Enrichment records live/local reconciliation when both are available and
  disagree.

### Reverse, Nearby, Geocoding, Route

These endpoints also try live upstream first when configured:

- reverse geocoding falls back to nearest local POIs
- nearby search falls back to nearest local POIs with category/radius filters
- geocoding falls back to local text matching over POI address/name/city
- route falls back to a straight-line local route estimate

### Error Simulation

The facade supports `mockError` for demo and test coverage:

- `invalid_request`
- `unauthorized`
- `forbidden`
- `not_found`
- `timeout`
- `rate_limited`
- `internal_error`
- `service_unavailable`

This lets judges/testers verify error contracts without needing real upstream
failures.

## Data Provenance Notes

### Local Demo Origin

The default local data originates from the provided hackathon CSV files in
`data/`. The dataset README explicitly says the data is synthetic and only for
the hackathon.

Local data includes:

- stable POI IDs
- WGS84 latitude/longitude coordinates
- Vietnamese names/addresses/categories/tags
- ratings, review counts, and popularity scores
- autocomplete frequencies
- popular-query frequencies and regions
- public evaluation labels
- generated MiniLM embedding artifact
- generated prediction-language-model artifact
- learned ranking-weight config
- local behavior-event and alias-memory JSON logs

### Live Origin

If `TASCO_API_BASE_URL` is configured, live data originates from the configured
TASCO-compatible upstream. The facade marks successful live usage with:

```json
{
  "meta": {
    "source": "live",
    "upstreamUsed": true
  }
}
```

Local fallback usage is marked with:

```json
{
  "meta": {
    "source": "local-fallback",
    "upstreamUsed": false
  }
}
```

### Field-Level Provenance

For POI enrichment, each field can carry:

```json
{
  "source": "provided-dataset",
  "confidence": 0.86,
  "evidence": ["POI address"],
  "generated": false,
  "verifiedRealWorld": false
}
```

This makes it explicit whether a field came from provided CSV data, a
deterministic derivation, a mock placeholder, or a live upstream.

## Important Limitations To State

- The local corpus is small and synthetic.
- Local reviews/photos are mock placeholders, not real-world user content.
- Local opening hours are heuristics unless supplied by live upstream.
- The runtime ranker is a transparent learned linear model, not a production
  LambdaMART/XGBoost/LightGBM deployment.
- There is no licensed external POI corpus integrated in the default path.
- Optional rewrite providers are disabled unless explicitly configured.
- The default path is integration-ready for hackathon demo, not production map
  search at national scale.
