# US-032 Public Demo Deployment Overview

## Current Behavior

The React/Vite UI and Node API run together locally. Autocomplete has a browser
fallback, while Agent Journey requires the Node API and keeps active task state
in memory.

## Target Behavior

Publish a judge-ready HTTPS UI on Vercel, connect it to a persistent
single-instance Node API, and prove autocomplete, SSE task progress, and the
confirmation gate against the public URLs.

## Affected Users

- Hackathon judges opening the submitted demo link.
- Presenters running the autocomplete and Agent Journey demonstrations.

## Affected Product Docs

- `README.md`
- `docs/product/overview.md`
- `docs/TEST_MATRIX.md`
- `docs/stories/backlog.md`

## Non-Goals

- Native production integration with the closed-source Tasco Maps app.
- Production-grade durable user history or horizontally scaled agent tasks.
- Moving the normal autocomplete path behind a remote language model.
