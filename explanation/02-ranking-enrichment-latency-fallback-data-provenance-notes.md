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
- `template`: semantic templates for known Vietnamese map-search intents.
- `semantic`: similarity over dataset-grounded semantic documents.
- `embedding`: local deterministic embedding/kNN retrieval.

### Ranking Factors

Each suggestion has these factors in `metadata.factors`:

| Factor | Meaning |
| --- | --- |
| `lexical` | Prefix, fuzzy, compact-form, or semantic base match quality. |
| `intent` | Whether the candidate type matches predicted intent. |
| `source` | Trust/priority of the candidate source. |
| `popularity` | Frequency, monthly query volume, or POI popularity. |
| `poiQuality` | POI rating, review count, and popularity. |
| `locality` | Selected-city match or neutral location score. |
| `personalization` | Simulated profile or local behavior boost. |
| `diversity` | Prevents generated/template/semantic sources from crowding all results. |

Default weights:

| Factor | Weight |
| --- | ---: |
| lexical | 0.30 |
| intent | 0.20 |
| source | 0.15 |
| popularity | 0.10 |
| poiQuality | 0.10 |
| locality | 0.05 |
| personalization | 0.05 |
| diversity | 0.05 |

The final score is the weighted sum of these factors. Optional
`rankingWeights` can override the defaults for experiments. The ranking tuner
and train scripts export measured comparisons, but the current runtime ranker
is still the transparent weighted model.

### Personalization

Personalization is hackathon-safe:

- No private T Maps user logs are used.
- Built-in simulated profiles include `coffee-loyal`, `danang-traveler`, and
  `commuter`.
- The UI can record local selected-suggestion events in browser local storage.
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
- Current public evaluation after the latest city-scope fix: p95 about 38 ms.
- Local API smoke requests are also in the tens-of-milliseconds range for the
  autocomplete/search paths.

Practical expectation for demo/local use:

- autocomplete target: under 100 ms locally
- p95 evaluation proof: about 38 ms
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
- The runtime ranker is a transparent weighted model, not a production
  LambdaMART/XGBoost/LightGBM deployment.
- There is no licensed external POI corpus integrated in the default path.
- The default path is integration-ready for hackathon demo, not production map
  search at national scale.
