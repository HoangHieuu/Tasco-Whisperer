# US-032 Public Demo Deployment Validation

## Proof Strategy

Verify the unchanged product locally first, then prove the same public API and
browser behavior after deployment. The Agent Journey is accepted only if the
public task reaches a truthful terminal or confirmation-ready state and no
route-changing action occurs before explicit confirmation.

## Test Plan

| Layer | Cases |
| --- | --- |
| Unit | Existing autocomplete and agent runtime suites. |
| Integration | Full `npm run check`, health, autocomplete, task and confirmation APIs. |
| E2E | Public Vercel UI autocomplete plus Agent Journey with clean console. |
| Platform | Vercel frontend and persistent Node backend report healthy. |
| Performance | Public autocomplete responds within a reasonable interactive demo window. |
| Logs/Audit | No credential values in build/runtime output; provenance labels remain visible. |

## Fixtures

- Synthetic hackathon autocomplete and POI datasets.
- Existing Agent Journey demo request and fallback evidence.
- One server-only OpenRouter configuration.

## Commands

```text
npm run check
curl <api-url>/health
curl '<api-url>/v1/autocomplete?q=caphe&limit=5'
```

## Acceptance Evidence

- `npm run check` passed 22 test files and 131 tests, public evaluation top-1
  93.3%, top-3/top-5 100%, intent 98.3%, API smoke, and Vite build.
- Railway production deployment `baa70d14-5340-4c7a-b4c7-da32c464e802`
  passed its `/health` check at
  `https://api-production-7c48c.up.railway.app/health`.
- Public `caphe` autocomplete returned five ranked suggestions in 480 ms with
  `ca phe` expansion and honest `local-fallback` provenance.
- Vercel production deployment is aliased to
  `https://tasco-whisperer.vercel.app/`.
- Browser QA showed `8/8 TASCO APIs`, API-backed `caphe` suggestions, the Agent
  Journey surface, and no console errors or warnings.
- A real public OpenRouter task reached `ready_for_confirmation` with three
  completed model agents, eight tool calls, verifier decision `pass`, and the
  proposed action still `proposed`.
- The SSE endpoint returned 31 `agent-event` messages and one final `snapshot`.
- Hosted MiniLM loading exceeded the demo service memory. The deployment now
  uses the existing explicit lexical semantic fallback; local
  `npm run eval:minilm` remains the model-backed proof path.
