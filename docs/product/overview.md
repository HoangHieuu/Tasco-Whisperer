# Tasco Whisperer Product Overview

Tasco Whisperer is the product layer for this repository. It is an agentic
Vietnamese autocomplete and query suggestion engine for T Maps, built for
Agentic AI Build Week in Vietnam.

The source contract is `SPEC.md`. Future implementation work should use this
overview plus the SPEC to create bounded story packets, validation commands,
and durable Harness proof.

## Product Surfaces

- Autocomplete API for ranked query suggestions.
- Demo UI modeled after the T Maps search experience.
- Offline evaluation runner over the provided public evaluation dataset.
- iPhone Mirroring demo script showing the real T Maps app context.
- Agentic layer for validated hard-case query rewrites, plus future tuning and
  explainable suggestions.

## Core Domains

- Query normalization.
- Vietnamese abbreviation and typo handling.
- Intent and entity prediction.
- Candidate retrieval from autocomplete, POI, popular-query, and abbreviation
  datasets.
- Suggestion ranking and personalization.
- Evaluation and demo proof.

## Current Source Files

- `Problem.md`: challenge statement.
- `SPEC.md`: accepted product specification.
- `data/*.csv`: synthetic hackathon datasets.
- `src/lib/*`: deterministic autocomplete engine, local agentic rewrite
  provider, loaders, ranking, API contract, and evaluation logic.
- `src/App.tsx`: T Maps-style browser demo.
- `scripts/api.ts`: local `/api/suggest` HTTP service.
- `scripts/smokeApi.ts`: API smoke proof.
- `docs/demo/iphone-mirroring-demo.md`: presentation script and recording
  checklist.
- `docs/product/agentic-learning.md`: agentic rewrite, alias-memory, model
  provider, and self-improvement contract.
- `docs/decisions/0008-agentic-correction-loop.md`: durable architecture
  decision for hybrid deterministic plus optional agentic correction.
- `docs/TEST_MATRIX.md`: planned proof matrix.
- `docs/stories/backlog.md`: candidate epics and user stories.

## Current Scope

The current repo has a Phase 5 local demo baseline: dataset loading,
normalization, entity-aware intent prediction, candidate generation,
transparent ranking, browser demo, public evaluation runner, local autocomplete
API, and a validated local rewrite-agent path for compact Vietnamese variants
such as `caphe -> cà phê`. Remaining hackathon slices should focus on
persistent alias memory, offline tuning reports, grounded explanations, and
final submission polish.

## Agentic Learning Direction

The implemented correction loop handles hard Vietnamese variants such as
`caphe` without turning every keystroke into an LLM request. The accepted
direction remains not LLM-on-every-keystroke and not live self-training. The
system uses:

- deterministic autocomplete by default
- agentic rewrite only for low-confidence/no-result cases
- structured and validated agent output
- request-level alias memory for accepted corrections, with persistent storage
  still future work
- developer/evaluation approval before global alias promotion
- optional Hermes-class local provider only after Vietnamese quality proof
