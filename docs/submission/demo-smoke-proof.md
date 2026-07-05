# Demo Smoke Proof

This proof closes the locally shareable demo path for US-018. No public
deployment was required for this pass; the repo now supports one-command local
startup after setup.

## One-Command Demo

```bash
npm run demo
```

The command starts:

- API: `http://127.0.0.1:8787`
- UI: `http://127.0.0.1:5173`

For smoke verification without colliding with already-running local services:

```bash
TASCO_DEMO_API_PORT=8790 TASCO_DEMO_UI_PORT=5174 npm run demo
```

The launcher sets `VITE_TASCO_API_BASE_URL` for the UI process so the browser
demo calls the same API process it starts.

## Health And Degradation Proof

Observed startup diagnostics on the local smoke run:

```text
Tasco Whisperer API listening on http://127.0.0.1:8790
TASCO live facade disabled; using local fallback data.
Semantic embedding artifact: data/semantic-embeddings.minilm.json
Agentic rewrite provider: local deterministic fallback.
```

This proves missing TASCO upstream credentials and hosted rewrite-provider keys
do not block the demo path. The app uses local fallback data and deterministic
rewrite behavior by default.

API smoke:

```bash
curl http://127.0.0.1:8790/health
```

Result:

```json
{"ok":true}
```

Suggestion smoke:

```bash
curl "http://127.0.0.1:8790/api/suggest?q=coffee%20near&limit=3&userId=coffee-loyal"
```

Observed summary:

```json
{
  "intent": "Discovery Search",
  "count": 3,
  "first": "Quán cà phê gần đây",
  "provider": "local-rewrite-agent",
  "reason": "deterministic result is strong enough"
}
```

## Browser Proof

Browser QA at `http://127.0.0.1:5174/` verified:

- Page identity: title `Tasco Whisperer`.
- Not blank: first screen rendered demo queries, search input, suggestions,
  metrics, and TASCO facade panel.
- Framework overlay: none detected.
- Console health: no warning/error logs.
- API/UI health: `8/8 TASCO APIs` displayed.
- Interaction: typed `ks da nang`; first result became
  `Khách sạn Đà Nẵng gần biển`.
- Selection: clicked the visible first result; local learner recorded
  `1 local selections`.
- Explanation: `Why this result` updated with source, matched query, ranking
  reason, and personalization evidence.

Screenshot: `/tmp/tasco-us018-demo-smoke.png`.

## Full Validation

```bash
npm run check
```

Latest pass:

- 18 test files and 108 tests passed.
- Public evaluation: top1 96.7%, top3 100%, top5 100%, intent 98.3%, MRR 0.983.
- API smoke passed `/api/suggest`, TASCO facade endpoints, health, mock errors,
  and invalid limit handling.
- Production build passed.
