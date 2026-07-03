import 'dart:convert';

import 'package:http/http.dart' as http;

typedef TascoHeaderProvider = Future<Map<String, String>> Function();

typedef SearchSuggestionBuilder<T> =
    T Function({
      required String id,
      required String label,
      String? meta,
      String? description,
      TascoCoordinates? coordinates,
    });

class TascoWhispererAdapter {
  TascoWhispererAdapter({
    required String baseUrl,
    http.Client? client,
    String? bearerToken,
    String? apiKey,
    TascoHeaderProvider? headerProvider,
    this.locale = 'vi-VN',
    this.timezone = 'Asia/Ho_Chi_Minh',
  }) : _baseUrl = _normalizeBaseUrl(baseUrl),
       _client = client ?? http.Client(),
       _ownsClient = client == null,
       _bearerToken = bearerToken,
       _apiKey = apiKey,
       _headerProvider = headerProvider;

  final String _baseUrl;
  final http.Client _client;
  final bool _ownsClient;
  final String? _bearerToken;
  final String? _apiKey;
  final TascoHeaderProvider? _headerProvider;
  final String locale;
  final String timezone;

  Future<List<TascoSearchSuggestionDto>> autocomplete({
    required String q,
    double? lat,
    double? lon,
    int limit = 5,
    String? sessionId,
    String lang = 'vi',
  }) async {
    final body = await _getJson('/v1/autocomplete', {
      'q': q,
      'lat': lat,
      'lon': lon,
      'limit': limit,
      'sessionId': sessionId,
      'lang': lang,
    });
    final suggestions = _list(body['suggestions']);
    return suggestions
        .map(TascoPlaceResult.fromJson)
        .map(TascoSearchSuggestionDto.fromPlace)
        .toList();
  }

  Future<List<TascoSearchSuggestionDto>> search({
    required String q,
    double? lat,
    double? lon,
    int? radiusMeters,
    String? bbox,
    String? category,
    int limit = 10,
    String lang = 'vi',
  }) async {
    final body = await _getJson('/v1/search', {
      'q': q,
      'lat': lat,
      'lon': lon,
      'radiusMeters': radiusMeters,
      'bbox': bbox,
      'category': category,
      'limit': limit,
      'lang': lang,
    });
    final results = _list(body['results']);
    return results
        .map(TascoPlaceResult.fromJson)
        .map(TascoSearchSuggestionDto.fromPlace)
        .toList();
  }

  Future<TascoPlaceResult> poi({
    required String id,
    String? include,
    String lang = 'vi',
  }) async {
    final encodedId = Uri.encodeComponent(id);
    final body = await _getJson('/v1/poi/$encodedId', {
      'include': include,
      'lang': lang,
    });
    return TascoPlaceResult.fromJson(_object(body['poi']));
  }

  Future<List<TascoPlaceResult>> reverseGeocoding({
    required double lat,
    required double lon,
    int? radiusMeters,
    String lang = 'vi',
  }) async {
    final body = await _getJson('/v1/reverse-geocoding', {
      'lat': lat,
      'lon': lon,
      'radiusMeters': radiusMeters,
      'lang': lang,
    });
    return _list(body['results']).map(TascoPlaceResult.fromJson).toList();
  }

  Future<List<TascoPlaceResult>> nearbySearch({
    required double lat,
    required double lon,
    int radiusMeters = 1000,
    String? category,
    bool? openNow,
    int limit = 10,
    String lang = 'vi',
  }) async {
    final body = await _getJson('/v1/nearby-search', {
      'lat': lat,
      'lon': lon,
      'radiusMeters': radiusMeters,
      'category': category,
      'openNow': openNow,
      'limit': limit,
      'lang': lang,
    });
    return _list(body['results']).map(TascoPlaceResult.fromJson).toList();
  }

  Future<List<TascoPlaceResult>> geocoding({
    required String address,
    String? city,
    String? district,
    double? lat,
    double? lon,
    int limit = 5,
    String lang = 'vi',
  }) async {
    final body = await _getJson('/v1/geocoding', {
      'address': address,
      'city': city,
      'district': district,
      'lat': lat,
      'lon': lon,
      'limit': limit,
      'lang': lang,
    });
    return _list(body['results']).map(TascoPlaceResult.fromJson).toList();
  }

  Future<TascoRouteResponse> route(TascoRouteRequest request) async {
    final body = await _postJson('/v1/route', request.toJson());
    return TascoRouteResponse.fromJson(body);
  }

  void close() {
    if (_ownsClient) {
      _client.close();
    }
  }

  Future<Map<String, dynamic>> _getJson(
    String path,
    Map<String, Object?> params,
  ) async {
    final response = await _client.get(
      _uri(path, params),
      headers: await _headers(),
    );
    return _decode(response);
  }

  Future<Map<String, dynamic>> _postJson(
    String path,
    Map<String, dynamic> body,
  ) async {
    final response = await _client.post(
      _uri(path, const {}),
      headers: {...await _headers(), 'Content-Type': 'application/json'},
      body: jsonEncode(body),
    );
    return _decode(response);
  }

  Future<Map<String, String>> _headers() async {
    final headers = {
      'Accept': 'application/json',
      'X-Request-Id': _requestId(),
      'X-Locale': locale,
      'X-Timezone': timezone,
    };
    if (_bearerToken != null && _bearerToken.isNotEmpty) {
      headers['Authorization'] = 'Bearer $_bearerToken';
    }
    if (_apiKey != null && _apiKey.isNotEmpty) {
      headers['X-API-Key'] = _apiKey;
    }
    return {
      ...headers,
      ...await (_headerProvider?.call() ??
          Future.value(const <String, String>{})),
    };
  }

  Uri _uri(String path, Map<String, Object?> params) {
    final query = <String, String>{};
    for (final entry in params.entries) {
      final value = entry.value;
      if (value == null) {
        continue;
      }
      query[entry.key] = value.toString();
    }
    return Uri.parse(
      '$_baseUrl$path',
    ).replace(queryParameters: query.isEmpty ? null : query);
  }

  Map<String, dynamic> _decode(http.Response response) {
    final decoded = response.body.isEmpty
        ? <String, dynamic>{}
        : jsonDecode(response.body);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw TascoApiException.fromJson(response.statusCode, decoded);
    }
    return _object(decoded);
  }

  static String _normalizeBaseUrl(String baseUrl) {
    final trimmed = baseUrl.replaceFirst(RegExp(r'/+$'), '');
    return trimmed.replaceFirst(RegExp(r'/v1$', caseSensitive: false), '');
  }
}

class TascoSearchSuggestionDto {
  const TascoSearchSuggestionDto({
    required this.id,
    required this.label,
    this.meta,
    this.description,
    this.coordinates,
    required this.place,
  });

  final String id;
  final String label;
  final String? meta;
  final String? description;
  final TascoCoordinates? coordinates;
  final TascoPlaceResult place;

  factory TascoSearchSuggestionDto.fromPlace(TascoPlaceResult place) {
    return TascoSearchSuggestionDto(
      id: place.id,
      label: place.label,
      meta: place.category ?? place.type,
      description: place.address,
      coordinates: place.coordinates,
      place: place,
    );
  }

  T toSearchSuggestion<T>(SearchSuggestionBuilder<T> build) {
    return build(
      id: id,
      label: label,
      meta: meta,
      description: description,
      coordinates: coordinates,
    );
  }
}

class TascoPlaceResult {
  const TascoPlaceResult({
    required this.id,
    required this.type,
    required this.name,
    required this.label,
    this.address,
    this.category,
    this.brand,
    this.coordinates,
    this.distanceMeters,
    this.score,
    required this.source,
    this.tags = const [],
    this.rating,
    this.reviewCount,
    this.popularityScore,
    this.openingHours,
    this.aiSummary,
    this.reviews = const [],
    this.photos = const [],
    this.enrichment = const <String, dynamic>{},
  });

  final String id;
  final String type;
  final String name;
  final String label;
  final String? address;
  final String? category;
  final String? brand;
  final TascoCoordinates? coordinates;
  final num? distanceMeters;
  final num? score;
  final String source;
  final List<String> tags;
  final num? rating;
  final num? reviewCount;
  final num? popularityScore;
  final String? openingHours;
  final String? aiSummary;
  final List<TascoReview> reviews;
  final List<TascoPhoto> photos;
  final Map<String, dynamic> enrichment;

  factory TascoPlaceResult.fromJson(Map<String, dynamic> json) {
    final label = _string(json['label']) ?? _string(json['name']) ?? '';
    return TascoPlaceResult(
      id: _string(json['id']) ?? '',
      type: _string(json['type']) ?? 'poi',
      name: _string(json['name']) ?? label,
      label: label,
      address: _string(json['address']),
      category: _string(json['category']),
      brand: _string(json['brand']),
      coordinates: json['coordinates'] is Map<String, dynamic>
          ? TascoCoordinates.fromJson(
              json['coordinates'] as Map<String, dynamic>,
            )
          : null,
      distanceMeters: _number(json['distanceMeters']),
      score: _number(json['score']),
      source: _string(json['source']) ?? 'tasco-api',
      tags: _stringList(json['tags']),
      rating: _number(json['rating']),
      reviewCount: _number(json['reviewCount']),
      popularityScore: _number(json['popularityScore']),
      openingHours: _string(json['openingHours']),
      aiSummary: _string(json['aiSummary']),
      reviews: _list(json['reviews']).map(TascoReview.fromJson).toList(),
      photos: _list(json['photos']).map(TascoPhoto.fromJson).toList(),
      enrichment: _object(json['enrichment']),
    );
  }
}

class TascoReview {
  const TascoReview({
    required this.id,
    required this.author,
    required this.rating,
    required this.text,
    required this.createdAt,
    required this.source,
    this.confidence,
    this.provenance = const <String, dynamic>{},
  });

  final String id;
  final String author;
  final num rating;
  final String text;
  final String createdAt;
  final String source;
  final num? confidence;
  final Map<String, dynamic> provenance;

  factory TascoReview.fromJson(Map<String, dynamic> json) {
    return TascoReview(
      id: _string(json['id']) ?? '',
      author: _string(json['author']) ?? '',
      rating: _number(json['rating']) ?? 0,
      text: _string(json['text']) ?? '',
      createdAt: _string(json['createdAt']) ?? '',
      source: _string(json['source']) ?? 'tasco-api',
      confidence: _number(json['confidence']),
      provenance: _object(json['provenance']),
    );
  }
}

class TascoPhoto {
  const TascoPhoto({
    required this.id,
    required this.url,
    required this.caption,
    required this.width,
    required this.height,
    required this.source,
    this.confidence,
    this.provenance = const <String, dynamic>{},
  });

  final String id;
  final String url;
  final String caption;
  final int width;
  final int height;
  final String source;
  final num? confidence;
  final Map<String, dynamic> provenance;

  factory TascoPhoto.fromJson(Map<String, dynamic> json) {
    return TascoPhoto(
      id: _string(json['id']) ?? '',
      url: _string(json['url']) ?? '',
      caption: _string(json['caption']) ?? '',
      width: _nonNegativeInt(json['width']),
      height: _nonNegativeInt(json['height']),
      source: _string(json['source']) ?? 'tasco-api',
      confidence: _number(json['confidence']),
      provenance: _object(json['provenance']),
    );
  }
}

class TascoCoordinates {
  const TascoCoordinates({required this.lat, required this.lon});

  final double lat;
  final double lon;

  factory TascoCoordinates.fromJson(Map<String, dynamic> json) {
    return TascoCoordinates(
      lat: (_number(json['lat']) ?? 0).toDouble(),
      lon: (_number(json['lon']) ?? 0).toDouble(),
    );
  }

  Map<String, dynamic> toJson() => {'lat': lat, 'lon': lon};
}

class TascoRouteRequest {
  const TascoRouteRequest({
    required this.locations,
    this.mode = 'auto',
    this.alternates = 2,
    this.language = 'vi-VN',
    this.units = 'kilometers',
    this.avoidTolls,
    this.avoidHighways,
  });

  final List<TascoCoordinates> locations;
  final String mode;
  final int alternates;
  final String language;
  final String units;
  final bool? avoidTolls;
  final bool? avoidHighways;

  Map<String, dynamic> toJson() => {
    'locations': locations.map((location) => location.toJson()).toList(),
    'mode': mode,
    'alternates': alternates,
    'language': language,
    'units': units,
    if (avoidTolls != null) 'avoidTolls': avoidTolls,
    if (avoidHighways != null) 'avoidHighways': avoidHighways,
  };
}

class TascoRouteResponse {
  const TascoRouteResponse({required this.routes, required this.meta});

  final List<TascoRoute> routes;
  final Map<String, dynamic> meta;

  factory TascoRouteResponse.fromJson(Map<String, dynamic> json) {
    return TascoRouteResponse(
      routes: _list(json['routes']).asMap().entries.map((entry) {
        return TascoRoute.fromJson(entry.value, entry.key);
      }).toList(),
      meta: json['meta'] is Map<String, dynamic>
          ? json['meta'] as Map<String, dynamic>
          : const {},
    );
  }
}

class TascoRoute {
  const TascoRoute({
    required this.routeId,
    required this.sourceIndex,
    required this.summary,
    required this.geometry,
    required this.maneuvers,
  });

  final String routeId;
  final int sourceIndex;
  final TascoRouteSummary summary;
  final TascoRouteGeometry geometry;
  final List<TascoRouteManeuver> maneuvers;

  factory TascoRoute.fromJson(Map<String, dynamic> json, int index) {
    return TascoRoute(
      routeId: _string(json['routeId']) ?? 'route:live-${index + 1}',
      sourceIndex: (_number(json['sourceIndex']) ?? index).round(),
      summary: TascoRouteSummary.fromJson(_object(json['summary'])),
      geometry: TascoRouteGeometry.fromJson(_object(json['geometry'])),
      maneuvers: _list(
        json['maneuvers'],
      ).map(TascoRouteManeuver.fromJson).toList(),
    );
  }
}

class TascoRouteSummary {
  const TascoRouteSummary({
    required this.distanceMeters,
    required this.durationSeconds,
  });

  final int distanceMeters;
  final int durationSeconds;

  factory TascoRouteSummary.fromJson(Map<String, dynamic> json) {
    return TascoRouteSummary(
      distanceMeters: _nonNegativeInt(json['distanceMeters']),
      durationSeconds: _nonNegativeInt(json['durationSeconds']),
    );
  }
}

class TascoRouteGeometry {
  const TascoRouteGeometry({required this.type, required this.coordinates});

  final String type;
  final List<List<double>> coordinates;

  factory TascoRouteGeometry.fromJson(Map<String, dynamic> json) {
    return TascoRouteGeometry(
      type: 'LineString',
      coordinates: _coordinatePairs(json['coordinates']),
    );
  }
}

class TascoRouteManeuver {
  const TascoRouteManeuver({
    required this.instruction,
    required this.distanceMeters,
    required this.durationSeconds,
    required this.beginShapeIndex,
    required this.endShapeIndex,
    required this.streetNames,
  });

  final String instruction;
  final int distanceMeters;
  final int durationSeconds;
  final int beginShapeIndex;
  final int endShapeIndex;
  final List<String> streetNames;

  factory TascoRouteManeuver.fromJson(Map<String, dynamic> json) {
    return TascoRouteManeuver(
      instruction: _string(json['instruction']) ?? '',
      distanceMeters: _nonNegativeInt(json['distanceMeters']),
      durationSeconds: _nonNegativeInt(json['durationSeconds']),
      beginShapeIndex: _nonNegativeInt(json['beginShapeIndex']),
      endShapeIndex: _nonNegativeInt(json['endShapeIndex']),
      streetNames: _stringList(json['streetNames']),
    );
  }
}

class TascoApiException implements Exception {
  const TascoApiException({
    required this.statusCode,
    required this.code,
    required this.message,
    this.details,
  });

  final int statusCode;
  final String code;
  final String message;
  final Object? details;

  factory TascoApiException.fromJson(int statusCode, Object? decoded) {
    final body = decoded is Map<String, dynamic>
        ? decoded
        : const <String, dynamic>{};
    final error = body['error'] is Map<String, dynamic>
        ? body['error'] as Map<String, dynamic>
        : const <String, dynamic>{};
    return TascoApiException(
      statusCode: statusCode,
      code: _string(error['code']) ?? 'http_error',
      message: _string(error['message']) ?? 'TASCO request failed',
      details: error['details'],
    );
  }

  @override
  String toString() => 'TascoApiException($statusCode, $code, $message)';
}

Map<String, dynamic> _object(Object? value) {
  if (value is Map<String, dynamic>) {
    return value;
  }
  if (value is Map) {
    return Map<String, dynamic>.from(value);
  }
  return <String, dynamic>{};
}

List<Map<String, dynamic>> _list(Object? value) {
  if (value is! List) {
    return const [];
  }
  return value.map(_object).toList();
}

String? _string(Object? value) =>
    value is String && value.isNotEmpty ? value : null;

num? _number(Object? value) => value is num ? value : null;

int _nonNegativeInt(Object? value) {
  final rounded = (_number(value) ?? 0).round();
  return rounded < 0 ? 0 : rounded;
}

List<List<double>> _coordinatePairs(Object? value) {
  if (value is! List) {
    return const [];
  }
  final pairs = <List<double>>[];
  for (final item in value) {
    if (item is! List || item.length < 2) {
      continue;
    }
    final lon = _number(item[0])?.toDouble();
    final lat = _number(item[1])?.toDouble();
    if (lon == null ||
        lat == null ||
        lon < -180 ||
        lon > 180 ||
        lat < -90 ||
        lat > 90) {
      continue;
    }
    pairs.add([lon, lat]);
  }
  return pairs;
}

List<String> _stringList(Object? value) {
  if (value is! List) {
    return const [];
  }
  return value.whereType<String>().toList();
}

String _requestId() {
  final timestamp = DateTime.now().microsecondsSinceEpoch;
  return 'flutter-$timestamp';
}
