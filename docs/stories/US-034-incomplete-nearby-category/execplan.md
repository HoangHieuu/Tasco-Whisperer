# US-034 Incomplete Nearby Category Exec Plan

## Goal

Complete the unfinished nearby prefix and connect it to category- and
location-aware POI retrieval on the deployed demo.

## Risk Classification

High risk: query interpretation, ranking, public facade limits, browser
behavior, existing evaluation behavior, and production deployment.

## Phases

1. Reproduce `caphe gan` locally and on production.
2. Add normalization, engine, city-scope, and facade regression tests.
3. Implement contextual completion and category POI expansion.
4. Preserve public, MiniLM, and robustness metrics.
5. Deploy Railway and Vercel and verify the exact browser flow.
