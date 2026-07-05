# Exec Plan

## Goal

Make Tasco Whisperer more credible against the problem objective by adding
real model-backed semantic/intent context and runtime agentic provider wiring,
while keeping the current deterministic autocomplete path fast and available.

## Scope

In scope:

- Phase 0 credibility fixes from the Cursor plan.
- Phase 2 real Transformers.js MiniLM corpus/query embedding path with lexical
  fallback and kNN intent vote diagnostics.
- Phase 7 optional hosted/local rewrite provider integration, alias-memory
  loading at server startup, and facade request participation.
- Tests, scripts, docs, Harness story/matrix records, and validation commands.

Out of scope:

- Phase 1, 3, 4, 5, and 6 implementation beyond correcting stale command names
  or preserving compatibility.
- Production deployment.
- Real TASCO upstream credentials.
- Persisting new user behavior logs server-side.

## Risk Classification

Risk flags:

- External systems: optional hosted/local LLM provider and model package.
- Public contracts: facade metadata and diagnostics change.
- Existing behavior: core autocomplete, API, facade, and tests are touched.
- Weak proof: model-backed behavior must degrade cleanly when model artifacts or
  providers are unavailable.
- Multi-domain: engine, API, facade, docs, and validation all change.

Hard gates:

- External provider behavior.

## Work Phases

1. Refresh repo, product, Harness, plan, and dataset context.
2. Add story and decision records for the high-risk initiative.
3. Implement Phase 0 credibility fixes and tests.
4. Implement Phase 2 model-backed embedding artifact/runtime with fallback.
5. Implement Phase 7 provider and alias-memory runtime wiring.
6. Run `npm run check` plus `npm run eval:robust`.
7. Update docs, matrix, story evidence, and Harness durable records.

## Stop Conditions

Pause for human confirmation if:

- A remote provider must be called with real credentials.
- The validation gate would need to be weakened to pass.
- The model dependency cannot be installed or loaded and no deterministic
  fallback can preserve the current product behavior.
- API response compatibility would need to break.
