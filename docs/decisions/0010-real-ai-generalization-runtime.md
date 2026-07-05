# 0010 Real-AI Generalization Runtime

## Status

accepted

## Context

The hackathon objective asks for an AI-powered autocomplete engine that predicts
intent and suggestions in real time. Tasco Whisperer already has a deterministic
baseline, but the real-AI plan calls for a stronger model-backed semantic layer
and runtime agentic rewrite providers.

## Decision

Use a hybrid runtime:

- Keep deterministic normalization, retrieval, ranking, and local fallback as
  the required request path.
- Add model-backed Transformers.js embedding artifacts as optional semantic
  context for kNN retrieval and intent voting.
- Keep lexical vector search as the fallback provider whenever model artifacts,
  packages, or runtime initialization are unavailable.
- Wire hosted/local rewrite providers only for low-confidence/no-result rewrite
  cases, with structured JSON validation and deterministic alias-memory reuse.
- Keep provider credentials and endpoints on the Node process only.

## Consequences

- The demo can honestly claim model-backed AI assistance without putting every
  keystroke behind a remote LLM.
- The API can still pass offline and deterministic checks without credentials.
- Docs and tests must distinguish model-backed semantic context from lexical
  fallback context.
