# US-034 Incomplete Nearby Category Design

## Query Understanding

The deterministic Vietnamese rewrite layer completes a trailing `gan` to
`gan day` only when the preceding text is a supported category. This avoids
turning an ungrounded standalone fragment into a proximity request.

## Candidate Retrieval

When high-confidence category and proximity entities coexist, POI retrieval
matches the category independently of the proximity words. Semantic and
embedding candidates remain guarded by the same category-consistency filter.

## Location And Ranking

- Explicit city selection remains a hard scope.
- Coordinates continue to infer a city and contribute distance locality.
- Location-scoped POIs receive the primary ranking position.
- Generic query completions are retained as secondary choices.
- With no location context, the UI requests up to 12 rows so all nine mock
  coffee POIs and both generic completions can be displayed.

## Interface Impact

The autocomplete facade accepts up to 12 suggestions. Existing response fields,
provenance labels, and deterministic fallback behavior remain compatible.
