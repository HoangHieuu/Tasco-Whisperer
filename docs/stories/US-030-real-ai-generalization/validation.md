# Validation

## Proof Strategy

The story is complete only when deterministic fallback still passes, model-backed
semantic context is exercised by tests or scripts, provider wiring is validated
without real credentials, and docs/Harness proof state reflect the new behavior.

## Test Plan

| Layer | Cases |
| --- | --- |
| Unit | Semantic artifact parsing/search, frontend source/factor mapping, provider config and alias memory parsing. |
| Integration | `/api/suggest`, TASCO facade local/live fallback, optional provider fixtures, API smoke. |
| E2E | Existing browser-facing adapter proof remains valid; full visual QA can run after server work if UI changes. |
| Platform | Optional model/package path must degrade without real provider credentials. |
| Performance | Public eval and robustness p95 remain under SPEC budget. |
| Logs/Audit | API/facade logs continue JSON request records and degradation metadata is visible in responses. |

## Fixtures

- Existing `testDataset`.
- Mock live TASCO client rows with `source: 'tasco-api'`.
- Mock rewrite provider responses for hosted/local providers.
- Optional `data/alias-memory.local.json`.
- Generated or fixture semantic embedding artifact.

## Commands

```text
npm run test
npm run eval
npm run eval:robust
npm run api:smoke
npm run build
npm run check
```

## Acceptance Evidence

- `npm run embeddings:build`: generated
  `data/semantic-embeddings.minilm.json` with 316 documents and 384 dimensions
  using `Xenova/paraphrase-multilingual-MiniLM-L12-v2`.
- `npm run test`: 17 test files passed, 106 tests passed.
- `npm run eval`: 60 cases, top-1 96.7%, top-3 100%, top-5 100%,
  intent 98.3%, MRR 0.983, p95 40 ms in `npm run check`.
- `npm run eval:minilm`: 60 cases through the async MiniLM server path,
  top-1 96.7%, top-3 100%, top-5 100%, intent 98.3%, MRR 0.983,
  p95 28 ms, 60/60 MiniLM provider cases, and 0 degraded embedding cases.
- `npm run eval:robust`: 192 cases, top-3 100%, top-5 100%,
  compact transform 53/53 top-3, no top-3 misses, p95 28 ms.
- `npm run api:smoke`: `/api/suggest` and TASCO facade routes returned
  `ok: true`, including route, POI enrichment, mock errors, and local fallback.
- `npm run build`: TypeScript and Vite production build passed.
- `npm run check`: repeated tests, public eval, API smoke, and build
  successfully.
- Template pruning was guarded by sync and MiniLM eval; the rendered template
  count is now 83 while maintaining top-1 96.7% and intent 98.3%.
- kNN intent voting is measured in the async path; coordinate/navigation and
  direct-evidence safeguards remain in place for deterministic fallback quality.
- Runtime alias-memory write-back is wired through accepted hosted/local rewrite
  observations; the API mutates the loaded memory and writes
  `data/alias-memory.local.json` without requiring a server restart.
