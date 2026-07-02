# 0008 Agentic Correction Loop

Date: 2026-07-02

## Status

Accepted

## Context

The deterministic autocomplete engine handles many known aliases, accents, and
abbreviations, but it can fail on unseen Vietnamese typing variants such as
`caphe` for `cà phê`. Adding every typo directly to rule-based aliases would
work for known cases but does not scale to new user behavior.

The product still has a strict real-time requirement: autocomplete must remain
fast and usable without paid services or LLM availability.

## Decision

Use a hybrid agentic correction loop:

1. Keep the default per-keystroke path deterministic.
2. Trigger an optional agentic rewrite only for low-confidence, ambiguous, or
   no-result queries.
3. Require the agent to return structured JSON: candidate rewrites, intent,
   entities, confidence, and evidence.
4. Validate agent output before it can affect ranking.
5. Re-run the deterministic engine with accepted rewrites.
6. Store repeated accepted corrections as alias memory so future requests do
   not need an LLM call.
7. Promote shared aliases only after evaluation proof or developer approval.

Model/provider policy:

- Hosted provider: use a low-latency structured-output model for rewrite and
  intent proposals, not a heavy reasoning model on each keystroke.
- Local/open-source provider: a Hermes-class instruction/function-calling model
  can be an optional fallback if Vietnamese rewrite quality passes local tests.
- Offline evaluator: a stronger reasoning model may inspect failed evaluation
  cases and propose dictionary/ranking changes.

Federated learning is a future direction, not a hackathon requirement. For now,
the privacy-preserving story is local alias memory plus explicit promotion of
validated aggregate patterns.

## Alternatives Considered

1. Add every typo as a static alias.
   - Simple and fast, but does not learn from new cases.
2. Call an LLM for every keystroke.
   - Flexible, but too slow, expensive, and fragile for autocomplete.
3. Fine-tune or self-train a model live.
   - Not appropriate for hackathon scope and risky without validation,
     rollback, and poisoning controls.
4. Use only an open-source Hermes model.
   - Attractive for local/private demos, but quality and latency must be proven
     against Vietnamese map-search cases before it becomes the default.

## Consequences

Positive:

- Handles unseen typo and no-space variants such as `caphe`.
- Preserves deterministic low-latency behavior.
- Creates a credible self-improving story through validated alias memory.
- Keeps provider choice pluggable.

Tradeoffs:

- Requires structured output parsing and guardrails.
- Needs evaluation fixtures for accepted and rejected rewrites.
- Adds product complexity around alias memory lifecycle.
- Federated learning remains future-facing until there is a real client/device
  integration surface.

## Follow-Up

- Implement US-014 with a pluggable rewrite-agent interface and deterministic
  fallback.
- Add fixtures for `caphe`, `khachsan`, `benhvien`, `nhahang`, `trasua`,
  `cayxang`, and negative cases where the query should not be rewritten.
- Add a local alias-memory contract for user-specific and global candidate
  rewrites.
- Add an offline tuning report for agent-proposed aliases before global
  promotion.
