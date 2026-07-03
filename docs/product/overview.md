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
- Agentic layer for validated hard-case query rewrites, failure analysis,
  measured tuning, and explainable suggestions.
- Generalized query-intelligence roadmap for compact Vietnamese segmentation,
  Telex/VNI cleanup, semantic retrieval, persistent alias memory, behavior
  feedback, measured ranking weights, and optional hard-case LLM providers.

## Core Domains

- Query normalization.
- Vietnamese abbreviation, compact syllable, Telex/VNI, and typo handling.
- Intent and entity prediction.
- Candidate retrieval from autocomplete, POI, popular-query, abbreviation, and
  semantic evidence sources.
- Suggestion ranking, behavior feedback, and personalization.
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
- `docs/product/generalization-roadmap.md`: tiered roadmap for moving beyond
  fixture-heavy rules.
- `docs/decisions/0008-agentic-correction-loop.md`: durable architecture
  decision for hybrid deterministic plus optional agentic correction.
- `docs/TEST_MATRIX.md`: planned proof matrix.
- `docs/stories/backlog.md`: candidate epics and user stories.

## Current Scope

The current repo has a Phase 5 local demo baseline: dataset loading,
normalization, algorithmic compact Vietnamese segmentation, Telex/VNI cleanup,
entity-aware intent prediction, lexical and semantic candidate generation,
transparent ranking, configurable ranking weights, browser demo, public
evaluation runner, local autocomplete API, local behavior-feedback
personalization, persistent alias-memory utilities, local embedding kNN intent
voting, and validated local/hosted rewrite-agent provider adapters. Remaining
hackathon slices should focus on grounded explanations and final submission
polish.

## Agentic Learning Direction

The implemented deterministic layer now handles hard Vietnamese variants such
as `caphe` without turning every keystroke into an LLM request. The accepted
direction remains not LLM-on-every-keystroke and not live self-training. The
system uses:

- deterministic autocomplete by default
- algorithmic compact segmentation and Telex/VNI cleanup before agentic rewrite
- semantic retrieval as an additional evidence source
- agentic rewrite only for low-confidence/no-result cases that remain hard
- structured and validated agent output
- persistent alias-memory utilities for accepted corrections
- local behavior events for profile-specific ranking boosts
- explicit ranking-weight presets measured by evaluation
- developer/evaluation approval before global alias promotion
- optional Hermes-class local provider only after Vietnamese quality proof
