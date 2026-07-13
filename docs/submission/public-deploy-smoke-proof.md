# Public Deployment Smoke Proof

Date: 2026-07-12

## Public URLs

- Vercel UI: <https://tasco-whisperer.vercel.app/>
- Railway API: <https://api-production-7c48c.up.railway.app/>
- Health: <https://api-production-7c48c.up.railway.app/health>

This is an integration-ready Tasco Maps prototype. It is not a claim of native
production integration with the Tasco Maps mobile app.

## Deployment Shape

- Vercel serves the React/Vite frontend.
- Railway runs the existing Node HTTP API as one persistent process.
- `VITE_TASCO_API_BASE_URL` contains only the public Railway URL.
- OpenRouter credentials are configured only on Railway.
- CORS, JSON routes, and SSE use the existing application API contract.

Agent tasks are currently process-local. The service remains at one replica,
and a provider restart can invalidate an active journey. Durable workflow or
database storage is required before horizontal production scaling.

## Verification Results

### Local gate

`npm run check` passed:

- 22 test files and 131 tests.
- Public evaluation: 60 cases, top-1 93.3%, top-3/top-5 100%, intent 98.3%,
  MRR 0.967, p95 30 ms.
- API smoke, including the deterministic three-agent test substitute.
- TypeScript and Vite production build.

### Public API

- `/health` returned `{"ok":true}`.
- `/v1/autocomplete?q=caphe&limit=5&city=TP.HCM` returned five useful ranked
  suggestions, expanded `caphe` to `ca phe`, and labeled the source
  `local-fallback`.
- The public response completed in approximately 480 ms during the recorded
  cold-service check.

The MiniLM query model exceeded the memory available to the current Railway
demo service and caused the initial autocomplete container to restart. The
hosted service therefore sets `TASCO_SEMANTIC_ARTIFACT` to a deliberately absent
path, activating the repository's existing diagnosed lexical semantic fallback.
This is not presented as live MiniLM evidence. The committed artifact and
`npm run eval:minilm` remain the reproducible local model-backed path.

### Public Agent Journey

One real OpenRouter run reached `ready_for_confirmation`:

- Supervisor Agent, Mobility Executor Agent, and Verifier & Action Agent each
  completed a separate model call.
- 8 grounded tool calls completed.
- Independent verification returned `pass`.
- The selected `Highway EV Hub` evidence was visibly labeled
  `synthetic-demo` with 0.9 confidence.
- The action remained `proposed`; no route state changed without confirmation.
- SSE replay returned 31 `agent-event` messages and one final `snapshot`.

### Browser

The Vercel UI:

- loaded as `Tasco Whisperer` without a framework error overlay;
- reported `8/8 TASCO APIs`;
- returned API-backed `caphe` suggestions headed by
  `Quán cà phê gần đây`;
- displayed the separate Agent Journey mode; and
- produced no console errors or warnings during the recorded checks.

## Known Deployment Limits

- Hosted autocomplete uses lexical semantic fallback on the current service;
  MiniLM runs locally for evaluation and richer model-backed proof.
- Runtime behavior and alias files are disposable prototype state.
- The backend is intentionally single-instance while agent tasks remain in
  memory.
- Live Tasco Pelias/Valhalla failures retain visibly labeled synthetic or
  derived fallback evidence.
