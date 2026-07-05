# US-016 Explainable Suggestion Narrator

## Status

implemented

## Lane

normal

## Product Contract

Selected suggestions should expose a short explanation that helps judges and
product stakeholders understand why the result was returned. The explanation
must be grounded in existing suggestion metadata and must not call an LLM or
invent facts outside the returned evidence.

## Relevant Product Docs

- `SPEC.md`
- `docs/product/overview.md`
- `docs/TEST_MATRIX.md`
- `docs/stories/backlog.md`

## Acceptance Criteria

- Demo can show a short explanation for a selected suggestion.
- Explanation references source evidence such as POI match, abbreviation,
  popularity, location, or user preference when those fields are present.
- Explanation never invents facts not present in candidate metadata.
- Explanation generation is optional, local, synchronous, and does not block
  real-time suggestions.

## Design Notes

- Commands: no command-side mutation is introduced.
- Queries: `suggest()` attaches optional `metadata.explanation` to each returned
  suggestion.
- API: `/api/suggest` returns the optional explanation field as additive
  metadata; existing clients can ignore it.
- Domain rules: explanations are generated from `source`, `matched`,
  `metadata.reason`, `metadata.factors`, `metadata.personalizationReason`,
  POI metadata, and enrichment attributes only.
- UI surfaces: the analysis panel renders the selected suggestion explanation
  and evidence list.

## Validation

| Layer | Expected proof |
| --- | --- |
| Unit | Narrator tests prove summary/evidence are derived from metadata. |
| Integration | Engine/API/frontend tests prove explanation metadata travels with suggestions. |
| E2E | Browser proof shows the selected suggestion explanation renders. |
| Platform | Not required; no provider or deployment change. |
| Release | README/test matrix mention the narrator after validation. |

## Harness Delta

Intake #15 records this as a normal spec slice for US-016.

## Evidence

- `npm run test -- --run src/lib/suggestionNarrator.test.ts src/lib/engine.test.ts src/lib/suggestApi.test.ts src/lib/frontendSuggest.test.ts`
  passed 4 files and 40 tests.
- `npm run check` passed 18 test files and 108 tests, evaluation top1 96.7%,
  top3/top5 100%, intent 98.3%, API smoke, and production build.
- Browser QA at `http://127.0.0.1:5173/` used query `coffee near`, clicked the
  top suggestion, recorded `1 local selections`, rendered `Why this result`,
  and showed source, matched query, ranking reason, category, and
  personalization evidence.
- Browser console warning/error log was empty; screenshot:
  `/tmp/tasco-us016-explanation-panel.png`.
- Harness story update:
  `scripts/bin/harness-cli story update --id US-016 --status implemented --unit 1 --integration 1 --e2e 1 --platform 0`.
