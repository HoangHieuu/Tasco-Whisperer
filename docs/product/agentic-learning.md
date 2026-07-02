# Agentic Learning And Correction Contract

This document defines the agentic layer for hard Vietnamese query variants such
as `caphe -> cà phê`. It is the living product contract for US-014 and related
future personalization/tuning work.

## Problem

Vietnamese map users often type:

- Without accents: `ca phe`.
- Without spaces: `caphe`, `khachsan`, `benhvien`.
- With abbreviations: `ks`, `bv`, `q1`.
- With mixed English/Vietnamese: `coffee near`, `hotel da nang`.
- With user-specific habits that repeat over time.

Static aliases are necessary but not enough. The system needs a way to handle
new low-confidence cases, learn from accepted corrections, and reuse validated
patterns without calling an LLM every time.

## Architecture

```text
user prefix
  -> deterministic normalize/retrieve/rank
  -> if confident: return suggestions
  -> if low confidence/no result:
       agentic rewrite proposal
       -> schema validation
       -> deterministic rerank with rewrites
       -> show suggestions + debug evidence
       -> record accepted/rejected correction
       -> promote validated aliases
```

The deterministic path remains the only required real-time path. Agentic
correction is optional and must degrade cleanly.

## Trigger Rules

Run the agentic correction path only when at least one condition is true:

- No suggestions are returned.
- Intent is `Ambiguous` with low confidence.
- No entities are extracted from a query with at least four characters.
- Top suggestion score is below a configured threshold.
- The query contains no spaces and resembles a known multi-token category,
  such as `caphe`, `khachsan`, `benhvien`, `nhahang`, `trasua`, or `cayxang`.

Do not call the agent when deterministic results are already strong.

## Agent Output Contract

The agent must return structured JSON only:

```json
{
  "rewrites": ["ca phe", "cà phê", "quán cà phê"],
  "intent": "Category Search",
  "entities": [
    {
      "kind": "category",
      "value": "cà phê",
      "confidence": 0.92
    }
  ],
  "confidence": 0.91,
  "evidence": ["caphe resembles Vietnamese no-space form of ca phe"]
}
```

Validation rules:

- Reject responses that are not valid JSON.
- Reject unsupported intents or entity kinds.
- Reject rewrites longer than the original query by an unreasonable margin.
- Reject rewrites that introduce unrelated brands, places, or claims.
- Cap the number of rewrites.
- Re-run the deterministic engine; do not let the agent directly create final
  suggestion rows.

## Model Provider Policy

Use a provider interface, not a hard-coded model:

- `disabled`: deterministic-only fallback.
- `hosted-mini`: low-latency structured-output model for rewrite proposals.
- `local-hermes`: optional local/open-source Hermes-class rewrite provider.
- `offline-reasoner`: stronger model for evaluation failure analysis only.

Default hackathon recommendation:

- Use `disabled` or a mocked provider until the deterministic fallback is
  tested.
- Add `hosted-mini` for live rewrite demos if an API key is available.
- Treat Hermes as optional. It is useful for a privacy/local story only if it
  passes Vietnamese rewrite tests and meets latency needs.

Do not put a heavy remote model on every keystroke.

## Alias Memory

Accepted corrections should be stored as alias-memory records:

| Field | Meaning |
| --- | --- |
| `rawQuery` | Original user text such as `caphe`. |
| `rewrite` | Accepted rewrite such as `cà phê`. |
| `intent` | Proposed intent after validation. |
| `entities` | Validated entities from the correction. |
| `scope` | `user`, `session`, or `global-candidate`. |
| `source` | `agent`, `evaluation`, or `manual`. |
| `acceptedCount` | Number of times users selected a result after this rewrite. |
| `rejectedCount` | Number of times the rewrite was ignored or contradicted. |
| `status` | `candidate`, `approved`, or `rejected`. |
| `lastSeenAt` | Last observed timestamp. |

Promotion rules:

- User/session aliases may apply immediately to that profile.
- Global aliases require either developer approval or evaluation proof.
- Rejected aliases must not continue boosting suggestions.
- All aliases must be inspectable in debug mode.

## Personalization

Personalization should adapt ranking, not silently rewrite everything.

Example:

- If a user repeatedly accepts coffee suggestions after `caphe`, store
  `caphe -> cà phê` for that user.
- If many users accept the same correction, promote it as a global candidate.
- If the user often chooses Highlands or Cộng Cà Phê, boost matching brands
  after the category rewrite has been validated.

## Federated Learning Position

Federated learning is a future architecture, not a current dependency.

Potential future design:

- Device keeps raw query history locally.
- Device learns local correction and ranking preferences.
- Server receives only aggregate alias updates, model deltas, or anonymized
  counts.
- Updates require poisoning controls and rollback.

For the hackathon, the credible version is local alias memory with explicit
promotion, not live federated model training.

## Acceptance Fixtures

Positive rewrite examples:

| Input | Expected Rewrite Direction |
| --- | --- |
| `caphe` | `cà phê`, `quán cà phê` |
| `khachsan` | `khách sạn` |
| `benhvien` | `bệnh viện` |
| `nhahang` | `nhà hàng` |
| `trasua` | `trà sữa` |
| `cayxang` | `cây xăng` |
| `duongden` | `đường đến`, navigation intent |

Negative examples:

| Input | Reason |
| --- | --- |
| `caphe sua da` | Should not force only generic coffee if a more specific phrase is present. |
| `capherang` | Should not overcorrect without evidence. |
| `vin` | Strong deterministic brand results; agent should not run. |
| `10.77` | Coordinate intent; agent should not rewrite as text. |

## Validation Targets

US-014 is implemented only when:

- Agent output parsing tests pass.
- Deterministic fallback works with provider disabled.
- `caphe` returns coffee suggestions through agent rewrite or learned alias.
- Positive and negative rewrite fixtures pass.
- Evaluation report shows before/after impact for hard or low-confidence cases.
- Debug metadata shows whether a rewrite came from agent output or alias memory.
