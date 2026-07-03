# Flutter Thin Adapter

This folder contains a thin Dart adapter for calling the Tasco Whisperer/TASCO
Maps facade from the existing Flutter app.

## Dependency

Add the HTTP client dependency to the Flutter app if it is not already present:

```yaml
dependencies:
  http: ^1.2.0
```

## Auth Boundary

Do not hardcode TASCO credentials in widgets or search UI code. Keep auth in the
app's existing network/auth layer. For production apps, prefer passing headers
through `headerProvider` so token refresh stays inside the existing auth flow:

```dart
final adapter = TascoWhispererAdapter(
  baseUrl: 'https://your-facade.example.com/v1',
  headerProvider: () async {
    final token = await authRepository.accessToken();
    return {
      'Authorization': 'Bearer $token',
    };
  },
);
```

The adapter also accepts constructor-level credentials for SDK-style wiring
when the app's composition root already owns the secret or short-lived token:

```dart
final adapter = TascoWhispererAdapter(
  baseUrl: 'https://your-facade.example.com/v1',
  bearerToken: accessToken,
  // or apiKey: apiKey,
);
```

For local demo wiring:

```dart
final adapter = TascoWhispererAdapter(
  baseUrl: 'http://127.0.0.1:8787',
);
```

## Search Box Usage

```dart
final suggestions = await adapter.autocomplete(
  q: query,
  lat: currentLocation?.latitude,
  lon: currentLocation?.longitude,
  limit: 5,
  sessionId: searchSessionId,
);
```

Map the adapter DTO into the app's existing `SearchSuggestion` model:

```dart
final appSuggestions = suggestions.map((suggestion) {
  return suggestion.toSearchSuggestion<SearchSuggestion>(
    ({
      required id,
      required label,
      meta,
      description,
      coordinates,
    }) {
      return SearchSuggestion(
        id: id,
        label: label,
        meta: meta,
        description: description,
        coordinates: coordinates == null
            ? null
            : LatLng(coordinates.lat, coordinates.lon),
      );
    },
  );
}).toList();
```

The adapter also exposes search, POI detail, reverse geocoding, nearby search,
geocoding, and route calls for the app's Pelias/Valhalla-style boundaries.
POI detail preserves enriched fields returned by
`include=reviews,photos,hours,ai_summary`, including `reviews`, `photos`,
`openingHours`, and `aiSummary`. It also keeps the optional raw `enrichment`
map so Flutter screens can inspect field-level provenance, confidence,
attributes, and live/local reconciliation notes without hard-coding UI
dependencies into the service layer.
