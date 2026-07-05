# US-018 Deployable Demo

## Status

implemented

## Lane

normal

## Product Contract

Presenters should have a reliable locally shareable demo path for Agentic AI
Build Week. The demo must start from one documented command after setup, expose
API and UI health proof, and degrade cleanly when optional TASCO upstream or
rewrite provider credentials are absent.

## Relevant Product Docs

- `SPEC.md`
- `README.md`
- `docs/product/overview.md`
- `docs/TEST_MATRIX.md`
- `docs/stories/backlog.md`
- `docs/submission/demo-smoke-proof.md`

## Acceptance Criteria

- Demo can run locally from one documented command after setup.
- If deployed, environment variables and deployment steps are documented.
- Health check or smoke test confirms API and UI are live.
- Demo degrades cleanly if optional LLM/provider keys are missing.
- Final validation evidence includes evaluation metrics and smoke test output.

## Design Notes

- Commands: `npm run demo` starts the local API and Vite UI together.
- Queries: smoke proof uses `/health`, `/api/suggest`, and browser query
  `ks da nang`.
- API: `VITE_TASCO_API_BASE_URL` is set for the UI process by the launcher.
- Domain rules: missing TASCO upstream credentials and rewrite provider keys
  keep local fallback behavior active instead of failing startup.
- UI surfaces: browser smoke verifies the T Maps-style demo, TASCO facade
  health, query update, local learner selection, and explanation panel.

## Validation

| Layer | Expected proof |
| --- | --- |
| Unit | Not required; launcher is a process wrapper. |
| Integration | `npm run check` and API health/suggest smoke on demo ports. |
| E2E | Browser QA at the demo URL verifies page load and query interaction. |
| Platform | `npm run demo` is cross-platform through Node and `npm`/`npm.cmd`. |
| Release | README, demo smoke proof, test matrix, and backlog are updated. |

## Harness Delta

Intake #17 records this as a normal spec slice for US-018.

## Evidence

- `TASCO_DEMO_API_PORT=8790 TASCO_DEMO_UI_PORT=5174 npm run demo` started API
  and UI together.
- Startup logs showed `TASCO live facade disabled; using local fallback data`
  and `Agentic rewrite provider: local deterministic fallback`.
- `curl http://127.0.0.1:8790/health` returned `{"ok":true}`.
- `/api/suggest?q=coffee%20near&limit=3&userId=coffee-loyal` returned
  `Discovery Search`, 3 suggestions, and local rewrite-agent diagnostics.
- Browser QA at `http://127.0.0.1:5174/` loaded `Tasco Whisperer`, showed
  `8/8 TASCO APIs`, typed `ks da nang`, returned `Khách sạn Đà Nẵng gần biển`,
  selected the first result, recorded `1 local selections`, and kept console
  errors/warnings empty.
- Browser screenshot: `/tmp/tasco-us018-demo-smoke.png`.
- `npm run check` passed 18 test files and 108 tests, evaluation top1 96.7%,
  top3/top5 100%, intent 98.3%, API smoke, and production build.
- Harness story update:
  `scripts/bin/harness-cli story update --id US-018 --status implemented --unit 0 --integration 1 --e2e 1 --platform 1`.
