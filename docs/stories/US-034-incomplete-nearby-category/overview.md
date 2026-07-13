# US-034 Incomplete Nearby Category Overview

## Current Behavior

`caphe gan` produces only the generic completions `Quán cà phê gần đây` and
`Coffee near me`. The unfinished proximity token is not completed, so category
POIs are not retrieved.

## Target Behavior

Interpret `gan` as the supported contextual completion `gan day` after a known
category, classify the request as `Nearby Search`, and retrieve every matching
coffee POI allowed by the selected city or inferred coordinate city.

Without location context, results may span the synthetic dataset and must not
claim physical proximity. With city or coordinate context, local POIs rank
before generic query completions.

## Acceptance Criteria

- `caphe gan` expands to `ca phe gan day`.
- Results are coffee-only and use `Nearby Search`.
- Any-city mode returns all nine coffee POIs in the current synthetic dataset.
- TP.HCM and Hà Nội scopes return all coffee POIs in the selected city first.
- The corrected behavior is visible on the production Vercel demo.
