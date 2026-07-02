# US-011 Autocomplete API Service

## Status

implemented

## Lane

normal

## Product Contract

Expose the existing deterministic Tasco Whisperer suggestion engine through a
stable HTTP autocomplete endpoint that a companion demo, T Maps prototype, or
deployment wrapper can call in real time.

## Relevant Product Docs

- `SPEC.md`
- `docs/ARCHITECTURE.md`
- `docs/TEST_MATRIX.md`

## Acceptance Criteria

- `GET /api/suggest` accepts `q`, optional `city`, `userId`, `lat`, `lng`, and
  `limit`.
- Successful responses follow the `FR-005` suggestion response shape.
- Empty query returns safe deterministic fallback suggestions.
- Invalid parameters return clear `4xx` JSON errors.
- API latency is included in the response and the server emits canonical JSON
  request logs.
- Integration tests cover happy path, empty query, invalid input, and
  personalized request path.

## Design Notes

- Commands: `npm run api:dev`, `npm run api:smoke`
- Queries: `GET /api/suggest`
- API: query-string only; no auth, persistence, or external provider.
- Domain rules: reuse `suggest()` and dataset loaders; no LLM in the request
  path.
- UI surfaces: none required for this story.

## Validation

When updating durable proof status, use numeric booleans:
`scripts/bin/harness-cli story update --id US-011 --unit 1 --integration 1 --e2e 0 --platform 0`.

| Layer | Expected proof |
| --- | --- |
| Unit | Request parser and API response tests. |
| Integration | API smoke command starts server, calls `/api/suggest`, and shuts down. |
| E2E | Not required; UI can keep using in-browser engine. |
| Platform | Optional curl/manual local smoke proof. |
| Release | README documents the endpoint and commands. |

## Harness Delta

None expected unless API validation exposes repeatable Harness friction.

## Evidence

- `npm run test`: API request parser and response tests pass.
- `npm run api:smoke`: starts local HTTP server, verifies
  `/api/suggest?q=cafe%20wifi&limit=3`, verifies invalid limit returns `400`,
  then shuts the server down.
- `npm run build`: TypeScript and Vite production build pass.
