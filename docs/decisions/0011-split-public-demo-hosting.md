# 0011 Split Public Demo Hosting

Date: 2026-07-12

## Status

Accepted

## Context

The submission needs a public demo URL for both the Vite autocomplete UI and
the separate multi-request Agent Journey. The Agent Journey retains task state
in the Node process while the browser creates a task, opens an SSE stream,
reviews the result, and confirms an action. Deploying that runtime unchanged as
independent stateless functions would not preserve the current contract.

## Decision

Deploy the browser UI to Vercel and deploy the existing Node API as a
single-instance persistent service. Configure the browser with
`VITE_TASCO_API_BASE_URL`, keep OpenRouter and any TASCO credentials only on the
Node service, and retain the existing JSON/SSE API contract.

The public demo remains an integration-ready hackathon prototype. It does not
claim native Tasco Maps production integration.

## Alternatives Considered

1. Deploy only the Vite UI. Rejected because autocomplete could fall back in
   the browser but the Agent Journey would not work.
2. Convert the agent runtime to stateless functions. Rejected for this
   submission slice because it requires durable workflow storage and a broader
   runtime redesign.
3. Host both surfaces in one long-lived service. Viable, but the Vercel URL is
   the preferred judge-facing frontend and preview deployment surface.

## Consequences

Positive:

- Judges receive one stable HTTPS frontend URL.
- Autocomplete and Agent Journey use the same deployed API contract as local
  development.
- Provider secrets never enter the Vite bundle.

Tradeoffs:

- Active Agent Journey tasks are lost if the backend process restarts.
- Runtime behavior and alias files remain disposable prototype data.
- The backend must stay at one replica until task state is moved to durable
  storage.

## Follow-Up

- Move agent task state to a durable workflow or database before scaling the
  backend horizontally.
- Replace synthetic/local map fallback data with an approved production Tasco
  data source during a real pilot.
