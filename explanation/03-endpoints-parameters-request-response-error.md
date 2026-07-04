# Endpoints, Parameters, Request Bodies, Response Bodies, And Errors

## Base URLs

Local API server:

```text
http://127.0.0.1:8787
```

Run it with:

```bash
npm run api:dev -- --host 127.0.0.1 --port 8787
```

The browser demo normally calls the local facade at
`http://127.0.0.1:8787`. A deployed service can use the same routes behind a
different base URL.

## Common Response Types

### PlaceResult

Most TASCO facade endpoints return `PlaceResult` rows:

```json
{
  "id": "poi:POI001",
  "type": "poi",
  "name": "Highlands Coffee Nguyễn Huệ",
  "label": "Highlands Coffee Nguyễn Huệ",
  "address": "86 Nguyễn Huệ, Quận 1, TP.HCM",
  "category": "Quán cà phê",
  "brand": "Highlands Coffee",
  "coordinates": {
    "lat": 10.7759,
    "lon": 106.7031
  },
  "distanceMeters": 0,
  "score": 0.88,
  "source": "local-fallback",
  "tags": ["wifi", "yên tĩnh", "làm việc", "takeaway"],
  "rating": 4.3,
  "reviewCount": 1250,
  "popularityScore": 88,
  "enrichment": {
    "fields": {},
    "attributes": [],
    "reconciliations": [],
    "summaryEvidence": []
  }
}
```

Required fields:

- `id`
- `type`
- `name`
- `label`
- `source`

Important compatibility rules:

- IDs are stable, for example `poi:POI001`.
- Coordinates use WGS84 latitude/longitude as `{ "lat": number, "lon": number }`.
- Vietnamese text and diacritics are preserved in display fields.

### Standard TASCO Error

TASCO facade endpoints return:

```json
{
  "error": {
    "code": "invalid_request",
    "message": "Invalid TASCO facade query parameters.",
    "details": ["q is required"]
  },
  "requestId": "optional-request-id"
}
```

Common error codes:

- `invalid_request`
- `method_not_allowed`
- `not_found`
- `unauthorized`
- `forbidden`
- `timeout`
- `rate_limited`
- `internal_error`
- `service_unavailable`

For demos, pass `mockError=<code>` to force supported mock errors.

## 1. GET /health

Health check.

### Request

```http
GET /health
```

### Parameters

None.

### Response Body

```json
{
  "ok": true
}
```

### Errors

No expected application errors.

## 2. GET /api/suggest

Internal debug autocomplete endpoint. This returns the full engine response,
including diagnostics. Use this for debugging and judging methodology. Use
`/v1/autocomplete` for TASCO-compatible app integration.

### Request

```http
GET /api/suggest?q=cafe%20wifi&city=TP.HCM&userId=coffee-loyal&limit=3
```

### Query Parameters

| Parameter | Required | Validation | Meaning |
| --- | --- | --- | --- |
| `q` | no | max 160 chars | Raw typed query. Empty query returns popular fallback suggestions. |
| `city` | no | max 80 chars | Hard city scope for explicit city/POI results. |
| `userId` | no | max 80 chars | Simulated or local profile ID. |
| `limit` | no | integer 1-12 | Number of suggestions. Default engine limit is 8. |
| `lat` | no | -90 to 90 | Optional latitude. Must be paired with `lng`. |
| `lng` | no | -180 to 180 | Optional longitude. Must be paired with `lat`. |
| `agentic` | no | true/false | Enables or disables optional agentic correction path. |

Note: `/api/suggest` validates `lat/lng`, but the TASCO facade routes are the
main integration path for location-aware ranking.

### Request Body

None. Method must be `GET`.

### Response Body

```json
{
  "query": "caphe",
  "normalizedQuery": "caphe",
  "expandedQuery": "ca phe",
  "intent": {
    "type": "Category Search",
    "confidence": 0.86
  },
  "suggestions": [
    {
      "id": "template-14",
      "text": "Quán cà phê gần đây",
      "normalizedText": "quan ca phe gan day",
      "type": "Discovery Search",
      "score": 0.821,
      "source": "template",
      "matched": ["coffee gan day", "ca phe gan day"],
      "metadata": {
        "reason": "mixed language nearby cafe intent",
        "factors": {
          "lexical": 1,
          "intent": 0.55,
          "source": 0.92,
          "popularity": 0.82,
          "poiQuality": 0.68,
          "locality": 0.7,
          "personalization": 0,
          "diversity": 0.92
        }
      }
    }
  ],
  "latencyMs": 24,
  "diagnostics": {
    "expansions": ["syllable-segmentation: Vietnamese compact syllable segmentation: caphe -> ca phe"],
    "entities": [],
    "candidateCount": 7,
    "agentic": {
      "triggered": false,
      "provider": "disabled",
      "reason": "deterministic result is strong enough"
    },
    "datasetRows": {
      "autocomplete": 24,
      "pois": 62,
      "abbreviations": 15,
      "popularQueries": 10,
      "evaluationCases": 60
    }
  }
}
```

### Errors

- `404 not_found`: path is not `/api/suggest`.
- `405 method_not_allowed`: method is not `GET`.
- `400 invalid_request`: invalid parameter, for example `limit=99`,
  unpaired coordinates, or invalid boolean.

## 3. GET /v1/autocomplete

Low-latency TASCO-compatible autocomplete. Alias: `/autocomplete`.

### Request

```http
GET /v1/autocomplete?q=caphe&city=TP.HCM&limit=8&sessionId=demo-1&userId=coffee-loyal&lang=vi
```

### Query Parameters

| Parameter | Required | Validation | Meaning |
| --- | --- | --- | --- |
| `q` | yes | max 160 chars | Raw typed query. |
| `lat` | no | -90 to 90 | Optional latitude. Must be paired with `lon`. |
| `lon` or `lng` | no | -180 to 180 | Optional longitude. Must be paired with `lat`. |
| `city` | no | max 80 chars | Hard city scope for explicit results. |
| `limit` | no | integer 1-10 | Number of suggestions. Default 5. |
| `lang` | no | max 16 chars, default `vi` | Response/request language hint. |
| `sessionId` | no | max 80 chars | Session identifier. Also used as user profile fallback if `userId` is absent. |
| `userId` | no | max 80 chars | Simulated or local profile ID. |
| `mockError` | no | supported enum | Forces a documented mock error. |

### Request Body

None. Method must be `GET`.

### Response Body

```json
{
  "query": "caphe",
  "suggestions": [
    {
      "id": "poi:POI001",
      "type": "poi",
      "name": "Highlands Coffee Nguyễn Huệ",
      "label": "Highlands Coffee Nguyễn Huệ",
      "address": "86 Nguyễn Huệ, Quận 1, TP.HCM",
      "category": "Quán cà phê",
      "brand": "Highlands Coffee",
      "coordinates": {
        "lat": 10.7759,
        "lon": 106.7031
      },
      "score": 0.772,
      "source": "poi"
    }
  ],
  "meta": {
    "limit": 8,
    "sessionId": "demo-1",
    "lang": "vi",
    "city": "TP.HCM",
    "source": "local-fallback",
    "normalizedQuery": "caphe",
    "expandedQuery": "ca phe",
    "upstreamUsed": false
  }
}
```

### Errors

- `400 invalid_request`: missing `q`, bad `limit`, bad coordinate pair,
  invalid `bbox` if used through shared parser, or too-long strings.
- `405 method_not_allowed`: method is not `GET`.
- Mock errors through `mockError`.

## 4. GET /v1/search

TASCO-compatible search endpoint. Aliases: `/search`, `/v1/geocode-search`.

### Request

```http
GET /v1/search?q=coffee&lat=10.7759&lon=106.7031&radiusMeters=2000&category=Quán%20cà%20phê&city=TP.HCM&limit=5
```

### Query Parameters

| Parameter | Required | Validation | Meaning |
| --- | --- | --- | --- |
| `q` | yes | max 160 chars | Search text. |
| `lat` | no | -90 to 90 | Optional latitude. Must be paired with `lon`. |
| `lon` or `lng` | no | -180 to 180 | Optional longitude. Must be paired with `lat`. |
| `radiusMeters` | no | 1-50000 | Distance filter when location context is present. |
| `bbox` | no | `minLon,minLat,maxLon,maxLat` | Bounding-box filter. |
| `category` | no | string | Category filter. |
| `city` | no | max 80 chars | Hard city scope. |
| `limit` | no | integer 1-20 | Number of results. Default 10. |
| `lang` | no | max 16 chars, default `vi` | Language hint. |
| `mockError` | no | supported enum | Forces a documented mock error. |

### Request Body

None. Method must be `GET`.

### Response Body

```json
{
  "query": "coffee",
  "results": [
    {
      "id": "poi:POI001",
      "type": "poi",
      "name": "Highlands Coffee Nguyễn Huệ",
      "label": "Highlands Coffee Nguyễn Huệ",
      "coordinates": {
        "lat": 10.7759,
        "lon": 106.7031
      },
      "distanceMeters": 0,
      "score": 1,
      "source": "local-fallback"
    }
  ],
  "meta": {
    "limit": 5,
    "lang": "vi",
    "radiusMeters": 2000,
    "category": "Quán cà phê",
    "city": "TP.HCM",
    "source": "local-fallback",
    "normalizedQuery": "coffee",
    "expandedQuery": "ca phe",
    "upstreamUsed": false
  }
}
```

### Errors

- `400 invalid_request`: missing `q`, invalid coordinates, invalid radius,
  invalid bbox, invalid limit, or too-long strings.
- `405 method_not_allowed`: method is not `GET`.
- Mock errors through `mockError`.

## 5. GET /v1/poi/{id}

POI detail and enrichment endpoint. Alias: `/poi/{id}`.

### Request

```http
GET /v1/poi/poi:POI001?include=reviews,photos,hours,ai_summary&lang=vi
```

### Path Parameters

| Parameter | Required | Meaning |
| --- | --- | --- |
| `id` | yes | Stable POI ID, with or without `poi:` prefix. |

### Query Parameters

| Parameter | Required | Meaning |
| --- | --- | --- |
| `include` | no | Comma-separated optional fields: `reviews`, `photos`, `hours`, `opening_hours`, `openinghours`, `ai_summary`. |
| `lang` | no | Language hint, default `vi`. |
| `mockError` | no | Forces a documented mock error. |

### Request Body

None. Method must be `GET`.

### Response Body

```json
{
  "poi": {
    "id": "poi:POI001",
    "type": "poi",
    "name": "Highlands Coffee Nguyễn Huệ",
    "label": "Highlands Coffee Nguyễn Huệ",
    "address": "86 Nguyễn Huệ, Quận 1, TP.HCM",
    "category": "Quán cà phê",
    "coordinates": {
      "lat": 10.7759,
      "lon": 106.7031
    },
    "rating": 4.3,
    "openingHours": "07:00-22:00",
    "aiSummary": "Highlands Coffee Nguyễn Huệ là quán cà phê tại 86 Nguyễn Huệ, Quận 1, TP.HCM. Dữ liệu hackathon ghi nhận điểm 4.3/5, 1.250 lượt đánh giá, độ phổ biến 88/100. Thuộc tính nổi bật: wifi, yên tĩnh, làm việc, takeaway.",
    "reviews": [
      {
        "id": "poi-poi001:review:1",
        "author": "TASCO demo user",
        "rating": 4.6,
        "text": "Highlands Coffee Nguyễn Huệ là kết quả Quán cà phê phù hợp trong dữ liệu demo.",
        "createdAt": "2026-06-25T00:00:00.000Z",
        "source": "local-fallback",
        "confidence": 0.28,
        "provenance": {
          "source": "local-mock",
          "confidence": 0.28,
          "evidence": ["label=Highlands Coffee Nguyễn Huệ", "category=Quán cà phê"],
          "generated": true,
          "verifiedRealWorld": false,
          "note": "Deterministic demo review, not a real user review."
        }
      }
    ],
    "photos": [],
    "enrichment": {
      "fields": {
        "address": {
          "source": "provided-dataset",
          "confidence": 0.86,
          "evidence": ["POI address"],
          "generated": false,
          "verifiedRealWorld": false
        }
      },
      "attributes": [
        {
          "key": "tag:wifi",
          "label": "Có Wi-Fi",
          "value": "wifi",
          "source": "provided-dataset",
          "confidence": 0.84,
          "evidence": ["tag=wifi"]
        }
      ],
      "reconciliations": [],
      "summaryEvidence": ["label", "category", "address", "rating", "reviewCount", "popularityScore", "tags"]
    }
  },
  "meta": {
    "lang": "vi",
    "source": "local-fallback",
    "upstreamUsed": false
  }
}
```

### Errors

- `400 invalid_request`: missing path ID.
- `404 not_found`: POI was not found locally or upstream.
- `405 method_not_allowed`: method is not `GET`.
- Mock errors through `mockError`.

## 6. GET /v1/reverse-geocoding

Reverse geocoding endpoint. Aliases: `/reverse-geocoding`, `/v1/reverse`.

### Request

```http
GET /v1/reverse?point.lat=10.7759&point.lon=106.7031&radiusMeters=1000&lang=vi
```

Also accepts `lat` and `lon`:

```http
GET /v1/reverse-geocoding?lat=10.7759&lon=106.7031
```

### Query Parameters

| Parameter | Required | Validation | Meaning |
| --- | --- | --- | --- |
| `lat` or `point.lat` | yes | -90 to 90 | Latitude. |
| `lon` or `point.lon` | yes | -180 to 180 | Longitude. |
| `radiusMeters` | no | 1-50000 | Optional search radius. |
| `lang` | no | default `vi` | Language hint. |
| `mockError` | no | supported enum | Forces a documented mock error. |

### Request Body

None. Method must be `GET`.

### Response Body

```json
{
  "results": [
    {
      "id": "poi:POI001",
      "type": "poi",
      "label": "Highlands Coffee Nguyễn Huệ",
      "distanceMeters": 0,
      "source": "local-fallback"
    }
  ],
  "meta": {
    "lang": "vi",
    "source": "local-fallback",
    "upstreamUsed": false
  }
}
```

### Errors

- `400 invalid_request`: missing or invalid coordinates.
- `405 method_not_allowed`: method is not `GET`.
- Mock errors through `mockError`.

## 7. GET /v1/nearby-search

Nearby POI search around a coordinate. Alias: `/nearby-search`.

### Request

```http
GET /v1/nearby-search?lat=10.7759&lon=106.7031&category=ATM&radiusMeters=2000&limit=3&openNow=true
```

### Query Parameters

| Parameter | Required | Validation | Meaning |
| --- | --- | --- | --- |
| `lat` | yes | -90 to 90 | Latitude. |
| `lon` | yes | -180 to 180 | Longitude. |
| `radiusMeters` | no | 1-5000, default 1000 | Radius filter. |
| `category` | no | string | Category/tag filter. |
| `openNow` | no | true/false | Passed to live upstream; local fallback currently does not verify real hours. |
| `limit` | no | integer 1-20, default 10 | Number of results. |
| `lang` | no | default `vi` | Language hint. |
| `mockError` | no | supported enum | Forces a documented mock error. |

### Request Body

None. Method must be `GET`.

### Response Body

```json
{
  "center": {
    "lat": 10.7759,
    "lon": 106.7031
  },
  "results": [
    {
      "id": "poi:POI004",
      "type": "poi",
      "label": "ATM Vietcombank Nguyễn Huệ",
      "distanceMeters": 0,
      "source": "local-fallback"
    }
  ],
  "meta": {
    "radiusMeters": 2000,
    "limit": 3,
    "lang": "vi",
    "source": "local-fallback",
    "upstreamUsed": false
  }
}
```

### Errors

- `400 invalid_request`: missing/invalid coordinates, invalid radius, invalid
  limit, or invalid boolean.
- `405 method_not_allowed`: method is not `GET`.
- Mock errors through `mockError`.

## 8. GET /v1/geocoding

Geocode address text to places/coordinates. Alias: `/geocoding`.

### Request

```http
GET /v1/geocoding?address=Nguyen%20Hue&city=TP.HCM&district=Quận%201&limit=3
```

### Query Parameters

| Parameter | Required | Validation | Meaning |
| --- | --- | --- | --- |
| `address` | yes | non-empty string | Address or place text. |
| `city` | no | string | City context. |
| `district` | no | string | District context. |
| `lat` | no | -90 to 90 | Optional bias latitude. Must be paired with `lon`. |
| `lon` | no | -180 to 180 | Optional bias longitude. Must be paired with `lat`. |
| `limit` | no | integer 1-10, default 5 | Number of results. |
| `lang` | no | default `vi` | Language hint. |
| `mockError` | no | supported enum | Forces a documented mock error. |

### Request Body

None. Method must be `GET`.

### Response Body

```json
{
  "query": "Nguyen Hue Quận 1 TP.HCM",
  "results": [
    {
      "id": "poi:POI001",
      "type": "poi",
      "label": "Highlands Coffee Nguyễn Huệ",
      "coordinates": {
        "lat": 10.7759,
        "lon": 106.7031
      },
      "source": "local-fallback"
    }
  ],
  "meta": {
    "limit": 3,
    "lang": "vi",
    "source": "local-fallback",
    "upstreamUsed": false
  }
}
```

### Errors

- `400 invalid_request`: missing address, invalid coordinates, invalid limit,
  or unpaired `lat/lon`.
- `405 method_not_allowed`: method is not `GET`.
- Mock errors through `mockError`.

## 9. POST /v1/route

Route endpoint. Alias: `/route`.

### Request

```http
POST /v1/route
Content-Type: application/json

{
  "locations": [
    {
      "lat": 10.7759,
      "lon": 106.7031
    },
    {
      "lat": 10.772,
      "lon": 106.698
    }
  ],
  "mode": "auto",
  "alternates": 1,
  "language": "vi-VN",
  "units": "kilometers",
  "avoidTolls": false,
  "avoidHighways": false
}
```

### Query Parameters

| Parameter | Required | Meaning |
| --- | --- | --- |
| `mockError` | no | Forces a documented mock error. |

### Request Body

| Field | Required | Validation | Meaning |
| --- | --- | --- | --- |
| `locations` | yes | array with at least 2 points | Origin, destination, and optional intermediate points. |
| `locations[].lat` | yes | -90 to 90 | Latitude. |
| `locations[].lon` | yes | -180 to 180 | Longitude. |
| `mode` | no | string, default `auto` | Route mode. Local speed uses `auto`, `pedestrian`, or `bicycle`. |
| `alternates` | no | number clamped 0-3, default 2 | Number of alternates requested. |
| `language` | no | string, default `vi-VN` | Instruction language. |
| `units` | no | string, default `kilometers` | Units hint. |
| `avoidTolls` | no | boolean | Passed to live upstream/local DTO. |
| `avoidHighways` | no | boolean | Passed to live upstream/local DTO. |

### Response Body

```json
{
  "routes": [
    {
      "routeId": "route:local-fallback",
      "sourceIndex": 0,
      "summary": {
        "distanceMeters": 706,
        "durationSeconds": 83
      },
      "geometry": {
        "type": "LineString",
        "coordinates": [
          [106.7031, 10.7759],
          [106.698, 10.772]
        ]
      },
      "maneuvers": [
        {
          "instruction": "Di theo tuyến đường được ước tính từ dữ liệu địa phương.",
          "distanceMeters": 706,
          "durationSeconds": 83,
          "beginShapeIndex": 0,
          "endShapeIndex": 1,
          "streetNames": []
        }
      ]
    }
  ],
  "meta": {
    "mode": "auto",
    "alternates": 1,
    "source": "local-fallback",
    "upstreamUsed": false
  }
}
```

### Errors

- `400 invalid_request`: body missing, body not JSON object, fewer than 2
  locations, or invalid coordinates.
- `405 method_not_allowed`: method is not `POST`.
- Mock errors through `mockError`.

## Live Upstream Authentication

The local facade can call a TASCO-compatible upstream when configured:

```bash
TASCO_API_BASE_URL="https://hackathon.example.com/v1" \
TASCO_API_KEY="<api_key>" \
TASCO_BEARER_TOKEN="<token>" \
npm run api:dev -- --host 127.0.0.1 --port 8787
```

Supported outbound headers:

- `Authorization: Bearer <token>`
- `X-API-Key: <api_key>`
- `X-Request-Id`
- `X-Locale`
- `X-Timezone`
- custom headers from `headerProvider`

Do not expose bearer tokens or API keys through browser `VITE_*` variables.
The browser should call the local facade; the facade owns upstream credentials.
