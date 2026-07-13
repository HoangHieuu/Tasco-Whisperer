# US-033 Nearby Search Consistency Design

## Query Understanding

Compact-token segmentation may run inside a multi-token query only when the
result has phrase evidence from the existing query knowledge. Explicit
proximity entities deterministically select `Nearby Search`.

## Retrieval And Ranking

Semantic token prefixes require at least four characters unless they are exact
matches. When a high-confidence category entity exists, semantic and embedding
candidates must contain matching category evidence before ranking.

## Interface Contract

`PlaceResult` adds optional `suggestionType`, preserving the engine intent
through `/v1/autocomplete`. The browser prefers this field, then a matching
local suggestion, before using its legacy inference fallback.

## Safety

The cafe-nearby template uses `Nearby Search`. Other generated patterns keep
their existing public-label behavior. Provenance and fallback labels remain
unchanged.
