# Design

## Domain Model

- `SemanticDocument`: corpus row from autocomplete, POI, popular query, or
  generated pattern evidence.
- `RuntimeSemanticContext`: model-backed or lexical-fallback kNN neighbors and
  intent vote passed into `suggest()`.
- `AgenticRuntimeConfig`: optional provider endpoint/model settings parsed at
  the Node boundary.
- `AliasMemoryRecord`: approved or candidate rewrite evidence loaded from
  `data/alias-memory.local.json`.

## Application Flow

```text
request
  -> parse query params and env/provider config
  -> deterministic understandQuery
  -> optional runtime semantic context (MiniLM artifact + query embedding)
  -> deterministic candidate generation/ranking with semantic context
  -> optional agentic rewrite only on low-confidence/no-result cases
  -> local fallback if provider/model is unavailable or rejected
```

## Interface Contract

- Existing `/api/suggest` and TASCO facade routes remain compatible.
- Metadata may add explicit provider/degraded fields, but existing fields keep
  their names and meanings.
- Optional agentic provider configuration is process-local only and never
  exposed to browser/mobile code.

## Data Model

- Add a generated JSON embedding artifact under `data/`.
- Continue using local JSON alias memory under `data/alias-memory.local.json`.
- No migration or persistent production data store is introduced.

## UI / Platform Impact

- Browser UI should no longer display synthetic "live" or fabricated ranking
  factors when the API result cannot prove them.
- Node API may use model-backed semantic context when artifacts and dependency
  are available; otherwise it falls back to lexical semantic context.

## Observability

- Facade metadata exposes whether live upstream was used and whether fallback was
  degraded.
- Suggest diagnostics expose semantic provider, neighbors, and intent vote.
- API logs continue one JSON line per request.

## Alternatives Considered

1. LLM on every keystroke: rejected because it conflicts with the real-time rule.
2. Replacing deterministic engine with a model-only path: rejected because the
   dataset is tiny and fallback reliability matters.
3. Keeping lexical embeddings only: rejected because the problem objective asks
   for a more credible AI-powered prediction layer.
