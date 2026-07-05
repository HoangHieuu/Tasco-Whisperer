# Overview

## Current Behavior

Tasco Whisperer has a strong deterministic autocomplete baseline: Vietnamese
normalization, lexical and lightweight semantic retrieval, transparent ranking,
local personalization, TASCO facade fallback routes, and validated local rewrite
fixtures. The weak spots for the hackathon objective are credibility and AI
depth: some facade/UI metadata is synthesized, the "embedding" path is lexical
vector search rather than a real model-backed embedding path, and hosted/local
LLM rewrite providers are validated by adapter tests but not wired into the
runtime correction loop.

## Target Behavior

Implement the selected real-AI generalization plan phases:

- Phase 0: credibility fixes for facade source labels, route degradation, score
  factor provenance, module contract wiring, and stale proof docs.
- Phase 2: model-backed multilingual embedding artifacts and runtime kNN intent
  context with deterministic lexical fallback.
- Phase 7: real optional rewrite provider runtime wiring, startup alias memory,
  and facade participation without making every request depend on an LLM.

## Affected Users

- Vietnamese map users receiving autocomplete suggestions.
- Hackathon judges reviewing whether the solution is genuinely AI-backed.
- Developers running local API, evaluation, and fallback proof.

## Affected Product Docs

- `SPEC.md`
- `docs/product/overview.md`
- `docs/product/generalization-roadmap.md`
- `docs/TEST_MATRIX.md`
- `.cursor/plans/real-ai_generalization_plan_6c116a07.plan.md`

## Non-Goals

- No remote LLM on every keystroke.
- No production user-history collection.
- No weakening deterministic fallback or current API smoke proof.
- No use of the 60 public eval cases as training data for learned ranking.
