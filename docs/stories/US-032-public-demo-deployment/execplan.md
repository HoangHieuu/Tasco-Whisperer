# US-032 Public Demo Deployment Exec Plan

## Goal

Produce and verify a public Tasco Whisperer demo with working autocomplete and
the separate three-agent mobility journey.

## Scope

In scope:

- Vercel configuration for the Vite frontend.
- Persistent Node-service configuration for the API.
- Server-only provider environment variables.
- Public API, browser, SSE, and confirmation-gate smoke proof.

Out of scope:

- A durable workflow rewrite.
- Production Tasco data or native mobile integration.
- Multiple backend replicas.

## Risk Classification

Risk flags:

- External systems.
- Audit/security and secret handling.
- Public contracts.
- Cross-platform browser and service deployment.
- Existing behavior.
- Multi-domain deployment.

Hard gates:

- External provider behavior and server-only OpenRouter credentials.

## Work Phases

1. Inspect runtime and hosting boundaries.
2. Record split-hosting architecture and deployment configuration.
3. Run local tests and production build.
4. Deploy backend and frontend with scoped environment variables.
5. Verify public health, autocomplete, SSE, and action confirmation.
6. Record URLs and Harness evidence.

## Stop Conditions

Pause for human confirmation if:

- A hosting login or billing decision cannot be completed safely.
- Provider credentials are missing or invalid.
- Deployment would require weakening the confirmation gate.
