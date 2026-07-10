# Required Explanations

## How Does Ranking Work?

Ranking is a transparent linear scoring system with learned runtime weights.

The engine first creates candidates from multiple sources:

- autocomplete CSV pairs
- POI CSV rows
- popular-query CSV rows
- data-derived generated patterns
- deterministic prefix-completion predictions
- semantic templates
- local semantic retrieval
- local MiniLM embedding/kNN retrieval, with lexical fallback

Then it predicts intent from query terms, entities, candidates, and embedding
neighbors. Each candidate receives transparent factors:

- `lexical`
- `intent`
- `source`
- `popularity`
- `poiQuality`
- `locality`
- `personalization`
- `diversity`

Runtime scoring loads `config/ranking-weights.json`, trained by pairwise
logistic regression over robustness perturbation rows plus optional behavior
selection rows. Current learned weights are approximately:

```text
score =
  lexical * 0.362 +
  intent * 0.263 +
  source * 0.093 +
  popularity * 0.059 +
  poiQuality * 0.000 +
  locality * 0.005 +
  personalization * 0.005 +
  diversity * 0.212
```

If `TASCO_DISABLE_LEARNED_RANKER=true` or
`VITE_TASCO_DISABLE_LEARNED_RANKER=true`, the engine falls back to the static
hand-tuned weights. Requests may also pass explicit `rankingWeights` for
experiments.

For POIs, `poiQuality` combines rating, review count, and popularity score.
For personalized requests, simulated profiles or server/browser behavior
events can add boosts. The boost is shown in
`metadata.personalizationReason`.

If `city` is selected, city is a hard filter before final ranking, not just a
small score boost. This prevents selected-city results from being polluted by
another city.

If `lat` and `lon` are supplied, the engine infers the nearest city when
`city` is absent and computes haversine distance to POIs into the `locality`
factor. If `now` is supplied, time-of-day context can boost 24/7/open-late
results at night and breakfast/phở results in the morning. These reasons appear
in `metadata.reason`.

## Where Does The Enrichment Data Come From?

Enrichment comes from four sources:

1. `provided-dataset`: direct fields from the hackathon POI CSV, such as name,
   address, category, coordinates, rating, review count, popularity, and tags.
2. `local-derived`: deterministic values computed from known fields, such as
   Vietnamese summaries, opening-hour heuristics, quality attributes, and
   popularity attributes.
3. `local-mock`: demo-only placeholder reviews/photos when no live upstream
   provides real content.
4. `live-upstream`: values returned by a configured TASCO-compatible upstream.

Every enriched field includes provenance, confidence, evidence, whether it was
generated, and whether it is verified real-world data.

Example:

```json
{
  "source": "local-derived",
  "confidence": 0.78,
  "evidence": ["label", "category", "address", "rating", "reviewCount", "tags"],
  "generated": true,
  "verifiedRealWorld": false,
  "note": "Generated from known dataset fields only."
}
```

## Expected Latency

The default autocomplete path is local and deterministic. It does not call a
remote LLM on every keystroke.

Expected local latency:

- target: under 100 ms for autocomplete
- current public evaluation p95: about 30 ms
- MiniLM async server-path p95: about 31 ms after the cold load outlier
- robustness evaluation p95: about 33 ms
- typical local requests: tens of milliseconds

When a live TASCO-compatible upstream is configured, total latency is local
processing plus upstream network/provider time. If upstream is slow, absent, or
fails, the facade falls back to local deterministic data.

## What Is The Fallback If The Upstream Fails?

The fallback is local deterministic data and logic.

For autocomplete/search:

1. Local query understanding runs first.
2. The facade calls live upstream only if configured.
3. If upstream throws, times out at the fetch layer, returns non-OK, returns no
   rows, or returns only rows filtered out by selected-city scope, the facade
   returns local fallback suggestions.
4. Response metadata shows the result:

```json
{
  "meta": {
    "source": "local-fallback",
    "upstreamUsed": false
  }
}
```

Endpoint-specific fallbacks:

- MiniLM retrieval: lexical fallback if the artifact/model is unavailable.
- Agentic rewrite: deterministic rewrite/alias path if no provider endpoint is
  configured or provider output is invalid.
- POI detail: local POI record plus enrichment, or `404` if not found.
- Reverse geocoding: nearest local POIs.
- Nearby search: nearest local POIs with radius/category filters.
- Geocoding: local text match over POI name/address/city/category/brand.
- Route: local straight-line route estimate with geometry and maneuver text.

## Where Does The Data Originate?

Default local data originates from the supplied hackathon CSV dataset in
`data/`:

- `POI Dataset.csv`
- `Autocomplete Dataset.csv`
- `Popular Queries.csv`
- `Abbreviation Dictionary.csv`
- `Public Evaluation.csv`
- `README.csv`

The dataset README states that the data is synthetic and only for hackathon
use. Therefore, local demo data should not be described as verified production
map data.

Generated local artifacts also come from the supplied dataset:

- `data/semantic-embeddings.minilm.json` for MiniLM kNN retrieval.
- `data/prediction-lm.json` for deterministic prefix completion.
- `config/ranking-weights.json` for the learned linear ranker.
- `data/behavior-events.local.json` for disposable behavior feedback.
- `data/alias-memory.local.json` for accepted rewrite memory.

When a live upstream is configured, live rows originate from that upstream and
are marked as:

```json
{
  "meta": {
    "source": "live",
    "upstreamUsed": true
  }
}
```

For POI enrichment, field-level provenance distinguishes:

- direct synthetic dataset fields
- deterministic local derivations
- mock placeholders
- live upstream fields
- live/local reconciliation evidence

## Short Submission Answer

Ranking uses learned, transparent linear scoring over lexical match, intent
match, source trust, popularity, POI quality, locality, personalization, and
diversity. It now includes MiniLM semantic retrieval, deterministic prefix
prediction, behavior feedback, coordinate locality, and time-of-day context.
Enrichment comes from known POI dataset fields, deterministic derivations,
explicitly marked mock placeholders, or optional live upstream data. Expected
local autocomplete latency is under 100 ms, with current public-eval p95 around
30 ms. If the upstream or optional AI provider fails, the facade returns local
deterministic fallback results and marks `meta.source=local-fallback`. Default
local data originates from the provided synthetic hackathon CSV files; live data
originates only from a configured TASCO-compatible upstream.
