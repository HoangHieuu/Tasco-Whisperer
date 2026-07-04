# Required Explanations

## How Does Ranking Work?

Ranking is a deterministic weighted-score system.

The engine first creates candidates from multiple sources:

- autocomplete CSV pairs
- POI CSV rows
- popular-query CSV rows
- data-derived generated patterns
- semantic templates
- local semantic retrieval
- local embedding/kNN retrieval

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

Default formula:

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

For POIs, `poiQuality` combines rating, review count, and popularity score.
For personalized requests, simulated profiles or local behavior events can add
boosts. The boost is shown in `metadata.personalizationReason`.

If `city` is selected, city is a hard filter before final ranking, not just a
small score boost. This prevents selected-city results from being polluted by
another city.

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
- current public evaluation p95: about 38 ms
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

Ranking uses transparent weighted scoring over lexical match, intent match,
source trust, popularity, POI quality, locality, personalization, and diversity.
Enrichment comes from known POI dataset fields, deterministic derivations,
explicitly marked mock placeholders, or optional live upstream data. Expected
local autocomplete latency is under 100 ms, with current p95 evaluation latency
around 38 ms. If the upstream fails or returns unusable rows, the facade returns
local deterministic fallback results and marks `meta.source=local-fallback`.
Default local data originates from the provided synthetic hackathon CSV files;
live data originates only from a configured TASCO-compatible upstream.
