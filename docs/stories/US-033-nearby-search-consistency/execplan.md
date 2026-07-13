# US-033 Nearby Search Consistency Exec Plan

## Goal

Correct the reported `caphe gan day` regression locally and on the public demo.

## Risk Classification

High risk: public contract, existing behavior, cross-platform browser behavior,
external deployment, and multiple autocomplete domains.

## Phases

1. Reproduce the exact query against production.
2. Add regression tests for normalization, semantic evidence, engine output,
   facade intent, and frontend intent preservation.
3. Apply the smallest deterministic fixes.
4. Run the full test, evaluation, robustness, API, and build gates.
5. Deploy Railway and Vercel, then verify the exact public query and UI.

## Stop Conditions

Stop if the public evaluation materially regresses, deployment authentication
fails, or the fix would require weakening provenance or fallback reporting.
