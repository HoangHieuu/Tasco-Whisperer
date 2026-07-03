# 0009 Tiered Query Generalization

Date: 2026-07-03

## Status

Accepted

## Context

The first autocomplete implementation proved the demo path, but too much
coverage came from curated template and local rewrite lists. That is credible
for a hackathon baseline but does not generalize to unseen Vietnamese typing
habits, compact forms, slang, and discovery queries.

Training an LLM is not the right immediate fix because autocomplete has strict
latency requirements and the project does not yet have enough real query logs.

## Decision

Move to a tiered query-intelligence architecture:

1. Keep synchronous autocomplete deterministic and fast.
2. Replace one-off compact aliases with Vietnamese syllable segmentation.
3. Decode Telex/VNI leftovers only when the dataset-derived lexicon supports
   the decoded token.
4. Add local embedding kNN retrieval as a candidate source, initially
   dependency-free and later swappable for multilingual sentence embeddings.
5. Keep LLM rewrite providers optional and hard-case-only behind validation.
6. Persist accepted corrections as alias memory and promote them only through
   explicit approval or evaluation proof.

## Consequences

Positive:

- Better generalization without training a model.
- Lower risk of slow autocomplete interactions.
- A clearer path from hackathon demo to production architecture.
- Reuses the existing ranking and diagnostics contracts.

Tradeoffs:

- The current embedding source is deterministic rather than a transformer model.
- The LLM provider needs an async boundary before it can be integrated safely.
- More candidate sources require stricter evidence thresholds to avoid
  unrelated suggestions.

## Validation

Initial implementation adds tests for:

- compact syllable segmentation
- Telex/VNI cleanup
- local embedding kNN retrieval and intent voting from dataset evidence
- persistent alias-memory promotion and serialization
- public evaluation regression
