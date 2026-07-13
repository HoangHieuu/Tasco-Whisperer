# US-033 Nearby Search Consistency Overview

## Current Behavior

For `caphe gan day`, compact Vietnamese normalization leaves `caphe`
unexpanded. Permissive semantic prefix matching can then admit unrelated POIs,
and the frontend can infer a different intent from the facade row.

## Target Behavior

Normalize the category inside a multi-token query, keep explicit proximity as
`Nearby Search`, filter semantic candidates against the extracted category,
and preserve the engine's intent through the public facade and browser.

## Acceptance Criteria

- `caphe gan day` expands to `ca phe gan day`.
- The response intent and visible suggestion types are `Nearby Search`.
- Hospital, ATM, and fuel results do not appear in the coffee query.
- The public Railway API and Vercel UI show the corrected behavior.

## Non-Goals

- Replacing the local-first engine with a remote model.
- Claiming production Tasco data or native T Maps integration.
