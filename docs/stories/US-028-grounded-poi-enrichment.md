# US-028 Grounded POI Enrichment

## Status

implemented

## Lane

normal

## Product Contract

POI enrichment must be explicit about what is known from the provided dataset,
what is locally derived, what is mock-only, and what came from a live upstream.
The facade should keep existing scalar fields for compatibility while adding
field-level provenance, confidence, deterministic attributes, Vietnamese
evidence-based summaries, and reconciliation evidence when live and local data
disagree.

## Relevant Product Docs

- `SPEC.md`
- `docs/product/overview.md`
- `docs/TEST_MATRIX.md`
- `docs/hackathon/openapi.yaml`

## Acceptance Criteria

- POI detail exposes `enrichment.fields` with source, confidence, evidence,
  generation status, and verified-real-world status.
- Vietnamese `aiSummary` is generated only from known dataset or upstream
  fields and is not an English placeholder.
- Deterministic attributes are derived from tags, category, rating,
  review-count, and popularity fields.
- Mock reviews/photos are explicitly labeled as mock with low confidence and
  `verifiedRealWorld=false`.
- Live/local POI disagreements are recorded in `enrichment.reconciliations`
  without overwriting live values.
- Ranking explanations for POI suggestions include enriched attribute evidence.
- Future external POI corpus, ranker, Vietnamese NLP, and agentic runtimes have
  typed interfaces without being required in the demo path.

## Design Notes

- Commands: `npm run enrich:report`
- Queries: TASCO facade POI detail plus autocomplete/search PlaceResult DTOs.
- API: Additive `enrichment` block; existing `openingHours`, `aiSummary`,
  `reviews`, `photos`, `rating`, and `tags` remain compatible.
- Domain rules: provided CSV fields are `provided-dataset`; deterministic local
  summaries/hours are `local-derived`; placeholder reviews/photos are
  `local-mock`; live upstream values are `live-upstream`.
- UI surfaces: no new UI in this slice.

## Validation

When updating durable proof status, use numeric booleans:
`scripts/bin/harness-cli story update --id US-028 --unit 1 --integration 1 --e2e 0 --platform 0`.

| Layer | Expected proof |
| --- | --- |
| Unit | `src/lib/enrichment.test.ts`, `src/lib/engine.test.ts`, and `src/lib/tascoFacade.test.ts` cover summaries, attributes, provenance, reconciliation, mock labels, and ranking explanations. |
| Integration | `src/lib/tascoApiClient.test.ts`, `npm run enrich:report`, and `npm run api:smoke` cover API parsing, full-dataset coverage, and facade smoke. |
| E2E | Not required; no browser flow changed. |
| Platform | Not required; no deployment behavior changed. |
| Release | `npm run build` must pass. |

## Harness Delta

No Harness policy changes. Added a story record and a repo-native enrichment
coverage report because no registered external coverage tool is present.

## Evidence

- `npm run test`: 16 files, 91 tests passed.
- `npm run enrich:report`: 62/62 Vietnamese summaries, 62/62 derived hours,
  6.194 average deterministic attributes per POI.
- `npm run api:smoke`: validates facade POI enrichment metadata, including
  `summarySource=local-derived` and `reviewSource=local-mock`.
- `npm run build`: TypeScript and Vite production build passed.
- `scripts/bin/harness-cli story verify US-028`: passed.
