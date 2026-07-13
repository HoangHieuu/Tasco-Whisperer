# US-032 Public Demo Deployment Design

## Domain Model

No autocomplete, ranking, or agent domain rules change. Agent tasks remain
bounded in-memory objects owned by one backend process.

## Application Flow

The Vercel UI sends autocomplete and Agent Journey requests to the deployed API
base URL. The Node service runs deterministic autocomplete locally, invokes the
three separately prompted agents only for Agent Journey, and streams task
snapshots through SSE.

## Interface Contract

Existing routes and response shapes remain unchanged. The browser receives only
the public API base URL. OpenRouter and optional TASCO credentials remain
server-side.

## Data Model

No schema or migration is introduced. Local behavior and alias files are
disposable prototype state. Active agent tasks are process-local, so the
backend is deployed as one replica.

## UI / Platform Impact

The Vite build is hosted on Vercel. The backend binds to the provider-supplied
`HOST` and `PORT` and exposes the existing CORS-enabled JSON and SSE endpoints.

## Observability

Deployment proof checks `/health`, autocomplete provenance, task status and SSE
events, confirmation-gated action state, browser console errors, and provider
logs without printing secret values.

## Alternatives Considered

1. Frontend-only Vercel deployment.
2. Vercel stateless functions without durable task storage.
3. A broader workflow/database refactor before submission.
