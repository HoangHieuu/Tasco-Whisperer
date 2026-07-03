# Tasco Whisperer

Tasco Whisperer is an agentic Vietnamese autocomplete and query suggestion
engine for T Maps. It is built for Agentic AI Build Week in Vietnam around the
Mobility Track P9 problem statement: AI-Powered Autocomplete & Query
Suggestions.

The project started from a Harness scaffold and now includes a working
React/Vite demo, deterministic autocomplete engine, optional agentic rewrite
correction, public evaluation runner, local `/api/suggest` service, and
Harness-backed product contract.

## Product Contract

Read these first:

- `SPEC.md`: complete product specification, phases, user stories, acceptance
  criteria, validation targets, and tool strategy.
- `Problem.md`: original hackathon challenge statement.
- `docs/product/overview.md`: short product contract.
- `docs/product/generalization-roadmap.md`: roadmap for moving beyond
  fixture-heavy rules into segmentation, semantic retrieval, alias memory, and
  optional hard-case model providers.
- `docs/stories/backlog.md`: candidate epics and planned user stories.
- `docs/TEST_MATRIX.md`: behavior-to-proof matrix.

## Dataset

Synthetic hackathon data lives in `data/`:

- Public evaluation cases.
- POI dataset.
- Historical autocomplete pairs.
- Abbreviation dictionary.
- Popular query dataset.
- Dataset README.

The public evaluation CSV is the baseline regression suite for autocomplete
quality once implementation begins.

## Harness Workflow

This repo uses the Rust Harness CLI:

```bash
scripts/bin/harness-cli query matrix
scripts/bin/harness-cli query tools --summary
scripts/bin/harness-cli query intakes
```

Before implementation work, classify the request through `docs/FEATURE_INTAKE.md`
and update story/proof records as work moves from planned to implemented.

## Current State

- `SPEC.md` exists and defines the Tasco Whisperer product.
- Harness DB is initialized locally.
- Planned stories US-001 through US-018 are seeded in the Harness story matrix.
- US-001 through US-015 and US-019 through US-025 have working proof; US-016
  through US-018 remain planned packaging/explanation slices.
- The app runs as a React/Vite TypeScript demo with a deterministic local
  autocomplete engine, Vietnamese segmentation/Telex cleanup, semantic
  candidate retrieval, persistent alias-memory utilities, validated rewrite
  correction path, behavior-feedback personalization, configurable ranking
  weights, and local API service.

## Setup

macOS/Linux:

```bash
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

Windows PowerShell:

```powershell
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

Open `http://127.0.0.1:5173/`.

## API

Run the local autocomplete API:

```bash
npm run api:dev -- --host 127.0.0.1 --port 8787
```

Windows PowerShell:

```powershell
npm run api:dev -- --host 127.0.0.1 --port 8787
```

Example request:

```bash
curl "http://127.0.0.1:8787/api/suggest?q=cafe%20wifi&city=TP.HCM&userId=coffee-loyal&limit=3"
```

The endpoint accepts `q`, `city`, `userId`, `lat`, `lng`, `limit`, and
`agentic`. Set `agentic=false` to prove deterministic-only fallback behavior.
Invalid parameters return a `4xx` JSON error. Empty `q` returns deterministic
popular query fallback suggestions.

## Validation

```bash
npm run test
npm run eval
npm run rank:tune
npm run tune:agentic
npm run alias:memory -- --rawQuery cf --rewrite "cà phê" --intent "Category Search"
npm run api:smoke
npm run build
npm run check
```

Current public evaluation baseline:

- 60 cases run.
- Top-1 accuracy: 90%.
- Top-3 recall: 100%.
- Top-5 recall: 100%.
- Intent accuracy: 66.7%.
- MRR: 0.933.
- P95 latency: 26 ms.

This is a Phase 5 local demo baseline. It uses Vietnamese normalization,
abbreviation expansion, algorithmic compact syllable segmentation, guarded
Telex/VNI cleanup, a local embedding kNN index with intent voting, entity
extraction, semantic templates, transparent score factors, simulated profile
boosts, local behavior feedback from selected suggestions, configurable ranking
weights, a local `/api/suggest` HTTP service, persistent alias-memory helpers,
and a validated agentic rewrite contract for low-confidence variants that
remain hard after the deterministic tiers. Simulated profiles include
`coffee-loyal`, `danang-traveler`, and `commuter`; the demo also has a
`local-demo` learner profile backed by browser local storage. Boosted
suggestions expose the reason in metadata. The current embedding source is
local and dependency-free; it can be swapped for a multilingual sentence model
later. A hosted/local rewrite-provider adapter exists through
`npm run rewrite:agent`, but it only runs when an endpoint is configured and
remains outside the per-keystroke path.
`npm run rank:tune` compares named ranking-weight presets against the public
evaluation suite and writes reports to `reports/ranking-tuning/latest.json` and
`reports/ranking-tuning/latest.md`.
`npm run tune:agentic` exports advisory weak-case tuning reports to
`reports/agentic-tuning/latest.json` and `reports/agentic-tuning/latest.md`;
proposals require explicit developer acceptance before changing runtime
ranking, templates, or alias memory.

## Demo Inputs

The UI includes these curated examples:

- `vin`
- `cafe`
- `caphe`
- `atm`
- `nguyen h`
- `ben th`
- `ks d`
- `bv bach`
- `cay x`
- `pho th`
- `coffee near`
- `q1 cafe`
- `vincom dong k`

## iPhone Mirroring Demo

Use [docs/demo/iphone-mirroring-demo.md](docs/demo/iphone-mirroring-demo.md)
for the hackathon presentation flow. It explains how to show the real T Maps
search entry point in iPhone Mirroring, switch to Tasco Whisperer, run the hard
Vietnamese examples, show `/api/suggest`, and avoid overclaiming production
iOS integration.

## Likely Next Slice

Continue Phase 5:

1. Add a grounded explanation/narrator layer that uses only returned metadata.
2. Prepare the final README example gallery and submission packaging.
3. Run the final local/deployed smoke proof when the presentation target is chosen.

## Repository Structure

```text
project/
  AGENTS.md
  SPEC.md
  Problem.md
  data/
  README.md
  docs/
    HARNESS.md
    FEATURE_INTAKE.md
    ARCHITECTURE.md
    TEST_MATRIX.md
    product/
    stories/
    decisions/
    templates/
  scripts/
    README.md
    bin/harness-cli
```
