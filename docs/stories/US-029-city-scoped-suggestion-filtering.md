# US-029 City-Scoped Suggestion Filtering

## Status

implemented

## Lane

normal

## Product Contract

When the caller selects an explicit city, autocomplete and search suggestions
must not surface POI rows or city-specific generated suggestions from another
known city. City context is a hard scope for explicit place results, while
generic category/query suggestions may remain visible if they do not name
another city.

## Relevant Product Docs

- `SPEC.md`
- `docs/product/overview.md`
- `docs/TEST_MATRIX.md`
- `docs/stories/backlog.md`

## Acceptance Criteria

- `city=TP.HCM` filters out explicit Đà Nẵng, Đà Lạt, Hà Nội, and Hải Phòng
  suggestions across local engine, TASCO facade, and frontend adapter paths.
- Live upstream rows are city-filtered before use; if all live rows are
  out-of-city, the facade falls back to city-scoped local results.
- Profile and behavior personalization are applied only when the profile/event
  city is compatible with the selected request city.
- The demo UI exposes every known dataset city supported by the filter.
- API smoke proof fails if TP.HCM autocomplete returns a known out-of-city row.

## Design Notes

- The city selector remains optional; empty city keeps the previous broad
  discovery behavior.
- City aliases cover common forms such as TP.HCM, HCM, Sài Gòn, Hà Nội, Đà
  Nẵng, Đà Lạt, Nha Trang, and Hải Phòng.
- Generic suggestions like `Quán cà phê gần đây` can remain because they do not
  identify a conflicting city.

## Validation

When updating durable proof status, use numeric booleans:
`scripts/bin/harness-cli story update --id US-029 --unit 1 --integration 1 --e2e 1 --platform 0`.

| Layer | Expected proof |
| --- | --- |
| Unit | `src/lib/engine.test.ts` covers hard city scope plus profile/behavior city compatibility. |
| Integration | `src/lib/tascoFacade.test.ts`, `src/lib/frontendSuggest.test.ts`, and `src/lib/tascoApiClient.test.ts` cover facade filtering, frontend request propagation, stale API rows, and upstream `city/userId` forwarding. |
| E2E | Browser-facing adapter proof covers the screenshot path; full visual QA can reuse the existing Vite app. |
| Platform | Not required; no deployment behavior changed. |
| Release | `npm run build` must pass. |
