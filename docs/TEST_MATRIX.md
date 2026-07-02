# Test Matrix

This file maps Tasco Whisperer product behavior to proof.

The accepted product contract is `SPEC.md`. Do not mark a row implemented until
tests or validation evidence exist.

## Status Values

| Status | Meaning |
| --- | --- |
| planned | Accepted as intended behavior, not implemented |
| in_progress | Actively being built |
| implemented | Implemented and proof exists |
| changed | Contract changed after earlier implementation |
| retired | No longer part of the product contract |

## Matrix

| Story | Contract | Unit | Integration | E2E | Platform | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| US-001 | Product contract and Harness wiring are defined. | no | no | no | no | implemented | `SPEC.md`, `docs/product/overview.md`, Harness intake #1, story matrix seeded. |
| US-002 | Dataset contract is inspectable and references all provided CSVs. | no | no | no | no | implemented | Dataset inventory in `SPEC.md` from CSV inspection. |
| US-003 | Dataset loader validates all required files and columns. | yes | no | no | no | implemented | `npm run test` covers typed CSV loading and missing-column failure. |
| US-004 | Vietnamese normalization handles accents, typos, abbreviations, aliases. | yes | no | no | no | implemented | `npm run test` covers accent stripping, abbreviation expansion, alias typo handling. |
| US-005 | Candidate generation returns relevant suggestions from merged sources. | yes | yes | no | no | implemented | `npm run test` covers `vin`, `cafe`, `atm`, `ks d`, and `nguyen h`; browser QA covers live `atm` suggestions. |
| US-006 | Intent classifier predicts suggestion/search type for incomplete prefixes. | yes | yes | no | no | implemented | `npm run test` covers category/attribute/coordinate intent; `npm run eval` reports 51.7% intent accuracy across public labels. |
| US-007 | Entity/context extraction detects brands, categories, POIs, streets, districts, cities, and nearby terms. | yes | yes | no | no | implemented | `npm run test` covers category, city, brand, attribute, and coordinate entities; UI displays entity chips with source/confidence. |
| US-008 | Ranking engine produces transparent scores and source/reason metadata. | yes | yes | no | no | implemented | `npm run eval`: top1 88.3%, top3 100%, top5 100%, MRR 0.922, p95 12 ms; UI score-factor panel shows ranking factors. |
| US-009 | Local/simulated personalization boosts relevant suggestions with fallback. | yes | yes | no | no | planned | Future personalization tests. |
| US-010 | Public evaluation harness reports accuracy, recall, MRR, difficulty/type metrics, and latency. | yes | yes | no | no | implemented | `npm run eval`: 60 cases, top1 88.3%, top3 100%, top5 100%, intent 51.7%, MRR 0.922, p95 latency 12 ms. |
| US-011 | Autocomplete API returns schema-compliant suggestions with errors and latency. | yes | yes | no | no | implemented | `npm run test` covers API parser/response/error cases; `npm run api:smoke` starts the HTTP server, calls `/api/suggest`, and verifies invalid limit handling. |
| US-012 | T Maps-style demo UI supports real-time suggestions and debug metadata. | no | yes | yes | yes | implemented | Playwright QA at `http://127.0.0.1:5173/`; desktop/mobile screenshots in `/tmp/tasco-whisperer-qa/`. |
| US-013 | iPhone Mirroring demo script ties the solution to the observed T Maps UX without overclaiming integration. | no | no | no | yes | implemented | `docs/demo/iphone-mirroring-demo.md`; Computer Use observation verified T Maps first screen in iPhone Mirroring with search field, category chips, and bottom tabs. |
| US-014 | Agentic query understanding adds validated hard-case analysis with deterministic fallback. | yes | yes | yes | no | implemented | `npm run check` passes; tests cover structured parser validation, deterministic compact-prefix fallback, `caphe -> cà phê`, negative rewrite fixtures, API diagnostics, and alias-memory reuse; browser smoke verifies `cap` and `cayx` in the UI with no warnings/errors. |
| US-015 | Agentic evaluation loop proposes accepted, measurable tuning changes. | yes | yes | no | no | planned | Future before/after eval report. |
| US-016 | Suggestion narrator explains results using grounded metadata only. | yes | yes | no | no | planned | Future explanation grounding tests. |
| US-017 | Submission README and example gallery explain setup, methods, examples, and limitations. | no | no | no | no | planned | Future README review. |
| US-018 | Demo is locally runnable or deployed with smoke proof and graceful optional-provider degradation. | no | yes | yes | yes | planned | Future smoke/deploy proof. |

## Evidence Rules

- Unit proof covers pure domain and application rules.
- Integration proof covers backend enforcement, data integrity, provider
  behavior, jobs, or service contracts.
- E2E proof covers user-visible browser flows.
- Platform proof covers only shell, deployment, mobile, desktop, or runtime
  behavior that cannot be proven in lower layers.
- A story can be implemented without every proof column if the story packet
  explains why.
