# US-009 Hackathon-Safe Personalization

## Status

implemented

## Lane

normal

## Product Contract

Support local, simulated personalization without using private T Maps data.
Passing a known `userId` should boost only candidates that match the simulated
profile's categories, brands, cities, or task patterns, and each boost must be
explainable in suggestion metadata.

## Relevant Product Docs

- `SPEC.md`
- `docs/TEST_MATRIX.md`
- `docs/product/overview.md`

## Acceptance Criteria

- The engine defines explicit simulated profiles for demo use.
- `coffee-loyal` boosts cafe and cafe-brand suggestions.
- `danang-traveler` boosts Da Nang travel, hotel, beach, and airport matches.
- `commuter` boosts ATM, fuel, route, and airport-task suggestions.
- Unknown `userId` values do not change ranking.
- No `userId` keeps a non-personalized fallback.
- Suggestion metadata includes `personalizationReason` when a boost applies.
- Personalization remains active when the optional agentic provider is disabled.

## Validation

| Layer | Expected proof |
| --- | --- |
| Unit | Engine tests cover baseline, known profile boosts, unknown profile fallback, and `agentic=false` behavior. |
| Integration | API tests cover personalized request metadata. |
| E2E | Browser smoke can select a profile and see boost evidence in the UI. |
| Platform | Not required for the local simulated profile model. |

## Evidence

- `src/lib/engine.ts` defines the simulated profile model and applies profile
  boosts during ranking.
- `src/lib/types.ts` exposes `metadata.personalizationReason` for explainable
  suggestion output.
- `src/App.tsx` displays the personalization reason on boosted suggestion rows.
- `src/lib/engine.test.ts` and `src/lib/suggestApi.test.ts` cover profile
  boosts, baseline fallback, unknown profiles, and `agentic=false`.
- `npm run check` passes: 106 tests, 60 public evaluation cases, top-1 96.7%,
  top-3 100%, top-5 100%, intent 98.3%, MRR 0.983, p95 latency 40 ms, API
  smoke, and Vite production build.
