# US-014 Agentic Query Understanding Pipeline

## Status

implemented

## Lane

normal

## Product Contract

Add an optional agentic correction path for hard or low-confidence Vietnamese
query variants, such as `caphe -> cà phê`, while preserving the deterministic
autocomplete path as the default real-time behavior.

## Relevant Product Docs

- `docs/product/agentic-learning.md`
- `docs/decisions/0008-agentic-correction-loop.md`
- `docs/ARCHITECTURE.md`
- `SPEC.md`

## Acceptance Criteria

- Deterministic suggestions still work when the agent provider is disabled.
- Agent triggers only for low-confidence, ambiguous, or no-result cases.
- Agent output is parsed as structured JSON and validated before use.
- `caphe` can produce coffee suggestions through an agent rewrite or learned
  alias.
- Positive and negative rewrite fixtures prevent broad over-correction.
- Accepted corrections can be stored as inspectable alias-memory records.
- Debug metadata shows whether a rewrite came from deterministic aliases,
  agent output, or learned alias memory.

## Design Notes

- Commands: `npm run test`, `npm run eval`, `npm run api:smoke`, and
  `npm run build` are covered by `npm run check`.
- Queries: `GET /api/suggest` exposes agent/alias diagnostics in debug mode and
  supports `agentic=false` for deterministic-only fallback proof.
- API: provider must be configurable as `disabled`, hosted low-latency model,
  or optional local Hermes-class model.
- Domain rules: agent proposes rewrites only; deterministic engine still
  creates final suggestions.
- UI surfaces: debug panel should show rewrite source and accepted entities.

## Validation

When updating durable proof status, use numeric booleans:
`scripts/bin/harness-cli story update --id US-014 --unit 1 --integration 1 --e2e 0 --platform 0`.

| Layer | Expected proof |
| --- | --- |
| Unit | Parser, schema validation, trigger rules, positive/negative rewrite fixtures. |
| Integration | Suggest pipeline reruns deterministic engine with validated rewrite. |
| E2E | Optional demo proof for `caphe`. |
| Platform | Optional provider-specific smoke when using hosted or local model. |
| Release | README explains provider configuration and fallback behavior. |

## Harness Delta

Decision `0008-agentic-correction-loop` records why the system uses hybrid
deterministic plus optional agentic correction instead of LLM-on-every-keystroke
or live model self-training.

## Evidence

- `src/lib/agentic.ts` implements the local structured rewrite provider,
  trigger rules, output parser/validator, and request-level alias-memory
  contract.
- `src/lib/engine.ts` supports deterministic compact-prefix typeahead for
  cross-token Vietnamese forms such as `cap -> cà phê`, `cayx -> cây xăng`,
  and `benhv -> bệnh viện`, then reruns candidate retrieval/ranking after a
  validated rewrite when the optional agent path applies.
- `src/lib/agentic.test.ts`, `src/lib/engine.test.ts`, and
  `src/lib/suggestApi.test.ts` cover parser validation, disabled provider
  fallback, deterministic compact-prefix fallback, `caphe -> cà phê`,
  positive/negative fixtures, API diagnostics, and alias-memory reuse.
- `npm run check` passes: 38 tests, 60 public evaluation cases, top-1 88.3%,
  top-3 100%, top-5 100%, intent 51.7%, MRR 0.922, p95 latency 14 ms, API
  smoke, and Vite production build.
- Browser smoke at `http://127.0.0.1:5174/` verifies typing `cap` shows coffee
  suggestions, typing `cayx` shows gas-station suggestions, and no browser
  warnings/errors appear.
