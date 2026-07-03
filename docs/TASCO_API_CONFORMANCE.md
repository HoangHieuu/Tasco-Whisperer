# TASCO Maps API Conformance

Source contract: `tasco_maps_hackathon_api_documentation.md`, version
2026-06-25.

## Verdict

The project implements the concrete API surface documented for the hackathon:

- `GET /v1/search`, aliases `/search` and `/v1/geocode-search`
- `GET /v1/autocomplete`, alias `/autocomplete`
- `GET /v1/poi/{id}`, alias `/poi/{id}`
- `GET /v1/reverse-geocoding`, aliases `/reverse-geocoding` and `/v1/reverse`
- `GET /v1/nearby-search`, alias `/nearby-search`
- `GET /v1/geocoding`, alias `/geocoding`
- `POST /v1/route`, alias `/route`
- `GET /health`

The backend facade can call a live TASCO-compatible upstream first and falls
back to deterministic local data when the upstream is absent, empty, or
unavailable. The browser UI uses the facade for autocomplete and runs frontend
coverage checks against every documented endpoint family. The Flutter adapter
in `integrations/flutter/tasco_whisperer_adapter.dart` is the thin app layer for
calling the same facade from the existing T Maps Flutter app.

## Authentication And Credentials

Production credentials are server-side only:

- `TASCO_API_BASE_URL`
- `TASCO_BEARER_TOKEN`
- `TASCO_API_KEY`
- `TASCO_LOCALE`
- `TASCO_TIMEZONE`

The live client sends:

- `Authorization: Bearer <token>` when `TASCO_BEARER_TOKEN` is present
- `X-API-Key: <key>` when `TASCO_API_KEY` is present
- `X-Request-Id`
- `X-Locale`
- `X-Timezone`

The live client also supports a pluggable header provider for app-network-layer
integration. The Flutter adapter accepts `baseUrl`, `bearerToken`, `apiKey`,
and `headerProvider`, but production mobile code should prefer the existing auth
layer plus `headerProvider` so credentials are not hardcoded in widgets or
search UI. Do not put TASCO credentials in `VITE_*` variables or browser code.
`VITE_TASCO_API_BASE_URL` may point only to the local or deployed facade.

## Endpoint Coverage

| Documentation Area | Backend | Frontend | Notes |
| --- | --- | --- | --- |
| Current app boundaries | yes | yes | Backend returns app-compatible `PlaceResult`; Flutter adapter maps rows into `SearchSuggestion`-ready DTOs. |
| Configurable base URL | yes | yes | Backend accepts bases with or without trailing `/v1`; frontend points at facade. |
| Bearer/API-key auth | yes | yes | Server-side uses env vars; Flutter adapter supports constructor credentials and `headerProvider` without hardcoding in UI code. |
| Common headers | yes | yes | Upstream client and Flutter adapter send request ID, locale, and timezone. |
| `PlaceResult` DTO | yes | yes | Backend normalizes live/local rows; frontend maps rows into suggestion cards. |
| Error response shape | yes | partial | Backend returns JSON `error.code/message/details`; local mock supports `mockError` for documented statuses. |
| Search params | yes | coverage | Supports `q`, `lat`, `lon`, `radiusMeters`, `bbox`, `category`, `limit`, and `lang`. |
| Autocomplete params | yes | yes | Main UI uses `q`, `lat`, `lon`, `limit`, `sessionId`, and `lang`. |
| POI params | yes | coverage | Supports `id`, `lang`, and `include`; local fallback supports `reviews`, `photos`, `hours`, and `ai_summary`. |
| Reverse geocoding params | yes | coverage | Supports `lat/lon`, `point.lat/point.lon`, `radiusMeters`, and `lang`. |
| Nearby params | yes | coverage | Supports `lat`, `lon`, `radiusMeters`, `category`, `openNow`, `limit`, and `lang`. |
| Geocoding params | yes | coverage | Supports `address`, `city`, `district`, `lat`, `lon`, `limit`, and `lang`. |
| Route body/results | yes | coverage | Supports `locations`, `mode`, `alternates`, `language`, `units`, `avoidTolls`, and `avoidHighways`; live/local route results are normalized to `routes[]`, `summary`, `LineString` geometry, and `maneuvers[]`. |
| Mock server compatibility | yes | yes | Local facade listens on `http://127.0.0.1:8787` and exposes `/health`. |
| Thin Flutter adapter | yes | yes | `integrations/flutter/tasco_whisperer_adapter.dart` covers autocomplete, search, POI, reverse, nearby, geocoding, and typed normalized route DTOs. |
| Submission expectations | partial | partial | API, README, Flutter adapter, mock data, and notes exist; final deck/video/deployed URL remain packaging work. |

## Known Limits

The local mock facade accepts `mockError=<code>` on documented TASCO routes to
exercise `unauthorized`, `forbidden`, `not_found`, `timeout`, `rate_limited`,
`internal_error`, and `service_unavailable` response shapes without requiring
real upstream failures.

The documentation names conversational map and semantic ranking as possible
solution areas but does not define separate REST endpoints for them. Tasco
Whisperer implements semantic and agentic ranking internally, not as separate
TASCO facade routes.

Search, nearby, geocoding, reverse, POI, and route are wired to the frontend
coverage panel. The primary user-visible suggestion list currently uses
`/v1/autocomplete`; deeper UI experiences for route previews, POI detail
drawers, and geocoding result panels are still product enhancements.

## Validation

Run:

```bash
npm run check
```

This executes unit tests, public evaluation, API smoke tests for the documented
facade routes, and the production build.
