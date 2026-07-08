import { describe, expect, it } from 'vitest';
import {
  handleTascoFacadeRequest,
  type TascoAutocompleteResponse,
  type TascoPlacesResponse,
  type TascoPoiResponse,
  type TascoRouteResponse,
  type TascoSearchResponse,
} from './tascoFacade';
import { testDataset } from './testDataset';
import type { BehaviorEvent } from './types';

describe('handleTascoFacadeRequest', () => {
  it('serves TASCO autocomplete from the local engine when no live client is configured', async () => {
    const result = await handleTascoFacadeRequest(testDataset, {
      method: 'GET',
      url: '/v1/autocomplete?q=caphe&limit=3&sessionId=s-123',
    });
    const body = result.body as TascoAutocompleteResponse;

    expect(result.status).toBe(200);
    expect(body.query).toBe('caphe');
    expect(body.meta).toEqual(
      expect.objectContaining({
        limit: 3,
        sessionId: 's-123',
        source: 'local-fallback',
        expandedQuery: 'ca phe',
        upstreamUsed: false,
      }),
    );
    expect(body.suggestions.map((suggestion) => suggestion.label)).toEqual(
      expect.arrayContaining(['Quán cà phê gần đây']),
    );
  });

  it('honors city scope for autocomplete and does not leak other-city POI rows', async () => {
    const result = await handleTascoFacadeRequest(testDataset, {
      method: 'GET',
      url: '/v1/autocomplete?q=caphe&city=TP.HCM&limit=8',
    });
    const body = result.body as TascoAutocompleteResponse;
    const visibleText = body.suggestions
      .map((suggestion) => `${suggestion.label} ${suggestion.address ?? ''}`)
      .join(' ');

    expect(result.status).toBe(200);
    expect(body.meta.city).toBe('TP.HCM');
    expect(body.suggestions.length).toBeGreaterThan(0);
    expect(visibleText).not.toMatch(/Đà Nẵng|Đà Lạt|Hà Nội|Hải Phòng/);
  });

  it('falls back to city-scoped local results when live autocomplete only returns other-city rows', async () => {
    const seenParams: unknown[] = [];
    const result = await handleTascoFacadeRequest(
      testDataset,
      {
        method: 'GET',
        url: '/v1/autocomplete?q=caphe&city=TP.HCM&userId=coffee-loyal&limit=5',
      },
      {
        async autocomplete(params) {
          seenParams.push(params);
          return [
            {
              id: 'poi:live-da-nang',
              type: 'poi',
              name: 'Live Coffee Đà Nẵng',
              label: 'Live Coffee Đà Nẵng',
              address: '285 Phan Chu Trinh, Đà Nẵng',
              category: 'Quán cà phê',
              score: 0.99,
              source: 'tasco-api',
            },
          ];
        },
      },
    );
    const body = result.body as TascoAutocompleteResponse;

    expect(result.status).toBe(200);
    expect(seenParams[0]).toEqual(
      expect.objectContaining({
        city: 'TP.HCM',
        userId: 'coffee-loyal',
      }),
    );
    expect(body.meta.source).toBe('local-fallback');
    expect(body.meta.upstreamUsed).toBe(false);
    expect(body.suggestions.map((suggestion) => suggestion.label).join(' ')).not.toContain('Đà Nẵng');
  });

  it('uses server-side behavior events for TASCO facade autocomplete ranking', async () => {
    const events: BehaviorEvent[] = [
      {
        userId: 'server-demo',
        query: 'cafe',
        selectedText: 'Highlands Coffee Nguyễn Huệ',
        selectedType: 'POI Search',
        brand: 'Highlands Coffee',
        category: 'Quán cà phê',
        city: 'TP.HCM',
        occurredAt: '2026-07-05T00:00:00.000Z',
      },
    ];
    const result = await handleTascoFacadeRequest(
      testDataset,
      {
        method: 'GET',
        url: '/v1/autocomplete?q=cafe&city=TP.HCM&userId=server-demo&limit=5',
      },
      undefined,
      {
        behaviorRuntime: {
          eventsForUser(userId?: string) {
            return userId ? events.filter((event) => event.userId === userId) : [];
          },
          record() {
            return { storedCount: events.length };
          },
        },
      },
    );
    const body = result.body as TascoAutocompleteResponse;
    const highlands = body.suggestions.find((suggestion) => suggestion.label === 'Highlands Coffee Nguyễn Huệ');

    expect(result.status).toBe(200);
    expect(highlands?.scoreFactors?.personalization).toBeGreaterThan(0);
  });

  it('serves TASCO search from the local engine with PlaceResult mapping', async () => {
    const result = await handleTascoFacadeRequest(testDataset, {
      method: 'GET',
      url: '/v1/search?q=atm&limit=5&lat=10.77&lon=106.7',
    });
    const body = result.body as TascoSearchResponse;

    expect(result.status).toBe(200);
    expect(body.query).toBe('atm');
    expect(body.results.length).toBeGreaterThan(0);
    expect(body.results[0]).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        label: expect.any(String),
        source: expect.any(String),
      }),
    );
    expect(body.results.some((result) => typeof result.distanceMeters === 'number')).toBe(true);
  });

  it('returns coordinate-backed POIs first for the organizer /search?q=coffee mock example', async () => {
    const result = await handleTascoFacadeRequest(testDataset, {
      method: 'GET',
      url: '/search?q=coffee',
    });
    const body = result.body as TascoSearchResponse;

    expect(result.status).toBe(200);
    expect(body.query).toBe('coffee');
    expect(body.results[0]).toEqual(
      expect.objectContaining({
        id: expect.stringMatching(/^poi:/),
        label: expect.stringContaining('Coffee'),
        coordinates: expect.objectContaining({
          lat: expect.any(Number),
          lon: expect.any(Number),
        }),
      }),
    );
  });

  it('supports documented search filters and forwards them to live search', async () => {
    const seenParams: unknown[] = [];
    const result = await handleTascoFacadeRequest(
      testDataset,
      {
        method: 'GET',
        url: '/v1/search?q=atm&limit=5&lat=10.7759&lon=106.7031&radiusMeters=2000&category=ATM&bbox=106.6,10.7,106.8,10.9',
      },
      {
        async search(params) {
          seenParams.push(params);
          return [];
        },
      },
    );
    const body = result.body as TascoSearchResponse;

    expect(result.status).toBe(200);
    expect(seenParams[0]).toEqual(
      expect.objectContaining({
        q: 'atm',
        lat: 10.7759,
        lon: 106.7031,
        radiusMeters: 2000,
        category: 'ATM',
        bbox: '106.6,10.7,106.8,10.9',
      }),
    );
    expect(body.meta).toEqual(
      expect.objectContaining({
        radiusMeters: 2000,
        category: 'ATM',
        bbox: '106.6,10.7,106.8,10.9',
      }),
    );
    expect(body.results.every((place) => place.category?.includes('ATM'))).toBe(true);
  });

  it('prioritizes coordinate-backed nearby results when location context is provided', async () => {
    const result = await handleTascoFacadeRequest(testDataset, {
      method: 'GET',
      url: '/v1/autocomplete?q=atm&limit=5&lat=10.7751&lon=106.7035',
    });
    const body = result.body as TascoAutocompleteResponse;

    expect(result.status).toBe(200);
    expect(body.suggestions[0]).toEqual(
      expect.objectContaining({
        label: 'ATM Vietcombank Nguyễn Huệ',
        distanceMeters: 0,
      }),
    );
  });

  it('uses live TASCO autocomplete when a client returns results after local query understanding', async () => {
    const seenQueries: string[] = [];
    const result = await handleTascoFacadeRequest(
      testDataset,
      {
        method: 'GET',
        url: '/v1/autocomplete?q=caphe&limit=2&lang=vi',
      },
      {
        async autocomplete(params) {
          seenQueries.push(params.q);
          return [
            {
              id: 'poi:coffee-live',
              type: 'poi',
              name: 'Live Coffee',
              label: 'Live Coffee',
              address: 'Ha Noi',
              category: 'cafe',
              coordinates: { lat: 21.01, lon: 105.81 },
              score: 0.99,
              source: 'tasco-api',
            },
          ];
        },
        async search() {
          return [];
        },
      },
    );
    const body = result.body as TascoAutocompleteResponse;

    expect(seenQueries).toEqual(['ca phe']);
    expect(body.meta.source).toBe('live');
    expect(body.meta.upstreamUsed).toBe(true);
    expect(body.suggestions[0].label).toBe('Live Coffee');
  });

  it('falls back locally when the live client fails', async () => {
    const result = await handleTascoFacadeRequest(
      testDataset,
      {
        method: 'GET',
        url: '/search?q=cafe&limit=3',
      },
      {
        async autocomplete() {
          return [];
        },
        async search() {
          throw new Error('upstream unavailable');
        },
      },
    );
    const body = result.body as TascoSearchResponse;

    expect(result.status).toBe(200);
    expect(body.meta.source).toBe('local-fallback');
    expect(body.meta.degraded).toBe(true);
    expect(body.meta.degradationReason).toContain('upstream unavailable');
    expect(body.results.map((place) => place.label)).toEqual(expect.arrayContaining(['Quán cà phê gần đây']));
  });

  it('rejects invalid TASCO facade requests with PDF-compatible errors', async () => {
    const missingQuery = await handleTascoFacadeRequest(testDataset, {
      method: 'GET',
      url: '/v1/autocomplete?limit=3',
    });
    const invalidLimit = await handleTascoFacadeRequest(testDataset, {
      method: 'GET',
      url: '/v1/search?q=cafe&limit=99',
    });
    const invalidBbox = await handleTascoFacadeRequest(testDataset, {
      method: 'GET',
      url: '/v1/search?q=cafe&bbox=bad',
    });
    const invalidNow = await handleTascoFacadeRequest(testDataset, {
      method: 'GET',
      url: '/v1/autocomplete?q=cafe&now=not-a-date',
    });

    expect(missingQuery.status).toBe(400);
    expect(missingQuery.body).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({
          code: 'invalid_request',
        }),
      }),
    );
    expect(invalidLimit.status).toBe(400);
    expect(invalidBbox.status).toBe(400);
    expect(invalidNow.status).toBe(400);
  });

  it('supports health checks expected by the hackathon mock server contract', async () => {
    const result = await handleTascoFacadeRequest(testDataset, { method: 'GET', url: '/health' });

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ ok: true });
  });

  it('returns POI details with local fallback enrichment', async () => {
    const result = await handleTascoFacadeRequest(testDataset, {
      method: 'GET',
      url: '/v1/poi/poi:POI001?include=reviews,photos,hours,ai_summary',
    });
    const body = result.body as TascoPoiResponse;

    expect(result.status).toBe(200);
    expect(body.poi.label).toBe('Highlands Coffee Nguyễn Huệ');
    expect(body.poi.coordinates).toEqual({ lat: 10.7759, lon: 106.7031 });
    expect(body.poi.openingHours).toBe('07:00-22:00');
    expect(body.poi.aiSummary).toContain('Highlands Coffee Nguyễn Huệ');
    expect(body.poi.aiSummary).toContain('là quán cà phê');
    expect(body.poi.aiSummary).not.toContain(' is a ');
    expect(body.poi.enrichment?.fields.aiSummary).toEqual(
      expect.objectContaining({
        source: 'local-derived',
        confidence: expect.any(Number),
        generated: true,
        verifiedRealWorld: false,
      }),
    );
    expect(body.poi.enrichment?.fields.openingHours).toEqual(
      expect.objectContaining({
        source: 'local-derived',
        confidence: expect.any(Number),
        note: expect.stringContaining('not verified hours'),
      }),
    );
    expect(body.poi.enrichment?.attributes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'tag:wifi', label: 'Có Wi-Fi' }),
        expect.objectContaining({ key: 'quality:many-reviews', value: 1250 }),
        expect.objectContaining({ key: 'popularity:high', value: 88 }),
      ]),
    );
    expect(body.poi.reviews).toHaveLength(2);
    expect(body.poi.reviews?.[0]).toEqual(
      expect.objectContaining({
        id: 'poi-poi001:review:1',
        rating: 4.6,
        source: 'local-fallback',
        confidence: expect.any(Number),
        provenance: expect.objectContaining({
          source: 'local-mock',
          verifiedRealWorld: false,
        }),
      }),
    );
    expect(body.poi.photos).toHaveLength(2);
    expect(body.poi.photos?.[0]).toEqual(
      expect.objectContaining({
        id: 'poi-poi001:photo:1',
        url: 'https://hackathon.example.com/mock-photos/poi-poi001-1.jpg',
        source: 'local-fallback',
        provenance: expect.objectContaining({
          source: 'local-mock',
          verifiedRealWorld: false,
        }),
      }),
    );
    expect(body.meta.source).toBe('local-fallback');
  });

  it('records live/local POI reconciliation without overwriting live values', async () => {
    const result = await handleTascoFacadeRequest(
      testDataset,
      {
        method: 'GET',
        url: '/v1/poi/poi:POI001?include=hours,ai_summary',
      },
      {
        async poi(id) {
          return {
            id,
            type: 'poi',
            name: 'Highlands Coffee Nguyễn Huệ Live',
            label: 'Highlands Coffee Nguyễn Huệ Live',
            address: 'Live upstream address',
            category: 'Quán cà phê',
            rating: 4.8,
            openingHours: '08:00-21:00',
            source: 'tasco-api',
          };
        },
      },
    );
    const body = result.body as TascoPoiResponse;

    expect(result.status).toBe(200);
    expect(body.meta.source).toBe('live');
    expect(body.poi.address).toBe('Live upstream address');
    expect(body.poi.openingHours).toBe('08:00-21:00');
    expect(body.poi.enrichment?.fields.openingHours).toEqual(
      expect.objectContaining({
        source: 'live-upstream',
        verifiedRealWorld: true,
      }),
    );
    expect(body.poi.enrichment?.reconciliations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'label', winner: 'live' }),
        expect.objectContaining({ field: 'address', winner: 'live' }),
        expect.objectContaining({ field: 'rating', winner: 'live' }),
      ]),
    );
  });

  it('supports documented mock error responses without requiring real auth failures', async () => {
    const unauthorized = await handleTascoFacadeRequest(testDataset, {
      method: 'GET',
      url: '/v1/search?q=cafe&mockError=unauthorized',
    });
    const rateLimited = await handleTascoFacadeRequest(testDataset, {
      method: 'GET',
      url: '/v1/autocomplete?q=cafe&mockError=rate_limited',
    });
    const timeout = await handleTascoFacadeRequest(testDataset, {
      method: 'POST',
      url: '/v1/route?mockError=timeout',
      body: {
        locations: [
          { lat: 10.7759, lon: 106.7031 },
          { lat: 10.772, lon: 106.698 },
        ],
      },
    });

    expect(unauthorized.status).toBe(401);
    expect(unauthorized.body).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({ code: 'unauthorized' }),
      }),
    );
    expect(rateLimited.status).toBe(429);
    expect(timeout.status).toBe(408);
  });

  it('returns reverse-geocoding results for lat/lon and Pelias-compatible point params', async () => {
    const result = await handleTascoFacadeRequest(testDataset, {
      method: 'GET',
      url: '/v1/reverse?point.lat=10.7759&point.lon=106.7031&lang=vi',
    });
    const body = result.body as TascoPlacesResponse;

    expect(result.status).toBe(200);
    expect(body.results[0]).toEqual(
      expect.objectContaining({
        label: 'Highlands Coffee Nguyễn Huệ',
        distanceMeters: 0,
      }),
    );
  });

  it('returns nearby-search results with category filtering', async () => {
    const result = await handleTascoFacadeRequest(testDataset, {
      method: 'GET',
      url: '/v1/nearby-search?lat=10.7759&lon=106.7031&category=ATM&radiusMeters=2000&limit=3',
    });
    const body = result.body as TascoPlacesResponse;

    expect(result.status).toBe(200);
    expect(body.center).toEqual({ lat: 10.7759, lon: 106.7031 });
    expect(body.results.map((place) => place.label)).toEqual(expect.arrayContaining(['ATM Vietcombank Nguyễn Huệ']));
  });

  it('returns geocoding results from local address evidence', async () => {
    const result = await handleTascoFacadeRequest(testDataset, {
      method: 'GET',
      url: '/v1/geocoding?address=Nguyen%20Hue&city=TP.HCM&limit=3',
    });
    const body = result.body as TascoPlacesResponse;

    expect(result.status).toBe(200);
    expect(body.query).toBe('Nguyen Hue TP.HCM');
    expect(body.results.map((place) => place.label)).toEqual(
      expect.arrayContaining(['Highlands Coffee Nguyễn Huệ', 'ATM Vietcombank Nguyễn Huệ']),
    );
  });

  it('returns a local fallback route for POST /v1/route', async () => {
    const result = await handleTascoFacadeRequest(testDataset, {
      method: 'POST',
      url: '/v1/route',
      body: {
        locations: [
          { lat: 10.7759, lon: 106.7031 },
          { lat: 10.772, lon: 106.698 },
        ],
        mode: 'auto',
        alternates: 1,
      },
    });
    const body = result.body as TascoRouteResponse;

    expect(result.status).toBe(200);
    expect(body.routes[0].summary.distanceMeters).toBeGreaterThan(0);
    expect(body.routes[0].geometry.coordinates).toEqual([
      [106.7031, 10.7759],
      [106.698, 10.772],
    ]);
    expect(body.meta.source).toBe('local-fallback');
  });

  it('uses live route and POI providers when available', async () => {
    const poiResult = await handleTascoFacadeRequest(
      testDataset,
      { method: 'GET', url: '/poi/poi:live' },
      {
        async poi(id) {
          return {
            id,
            type: 'poi',
            name: 'Live POI',
            label: 'Live POI',
            source: 'tasco-api',
          };
        },
      },
    );
    const routeResult = await handleTascoFacadeRequest(
      testDataset,
      {
        method: 'POST',
        url: '/route',
        body: {
          locations: [
            { lat: 1, lon: 2 },
            { lat: 3, lon: 4 },
          ],
        },
      },
      {
        async route() {
          return {
            routes: [
              {
                routeId: 'route:live-1',
                sourceIndex: 0,
                summary: { distanceMeters: 1000, durationSeconds: 600 },
                geometry: {
                  type: 'LineString',
                  coordinates: [
                    [2, 1],
                    [4, 3],
                  ],
                },
                maneuvers: [],
              },
            ],
            meta: { mode: 'auto', alternates: 2, source: 'live', upstreamUsed: true },
          };
        },
      },
    );

    expect((poiResult.body as TascoPoiResponse).meta.source).toBe('live');
    expect((routeResult.body as TascoRouteResponse).meta.source).toBe('live');
  });

  it('does not report live route success when upstream returns no routes', async () => {
    const routeResult = await handleTascoFacadeRequest(
      testDataset,
      {
        method: 'POST',
        url: '/route',
        body: {
          locations: [
            { lat: 10.7759, lon: 106.7031 },
            { lat: 10.772, lon: 106.698 },
          ],
        },
      },
      {
        async route() {
          return {
            routes: [],
            meta: { mode: 'auto', alternates: 2, source: 'live', upstreamUsed: true },
          };
        },
      },
    );
    const body = routeResult.body as TascoRouteResponse;

    expect(body.routes.length).toBeGreaterThan(0);
    expect(body.meta.source).toBe('local-fallback');
    expect(body.meta.upstreamUsed).toBe(false);
    expect(body.meta.degraded).toBe(true);
    expect(body.meta.degradationReason).toContain('no routes');
  });

  it('lets the facade path use the configured agentic rewrite provider', async () => {
    const result = await handleTascoFacadeRequest(
      testDataset,
      { method: 'GET', url: '/v1/autocomplete?q=bundau&limit=3' },
      undefined,
      {
        agenticRuntime: {
          provider: 'hosted-mini',
          endpoint: 'https://provider.test/rewrite',
          fetchImpl: async () =>
            new Response(
              JSON.stringify({
                output_text: JSON.stringify({
                  rewrites: ['bún đậu'],
                  intent: 'Category Search',
                  entities: [{ kind: 'category', value: 'bún đậu', confidence: 0.87 }],
                  confidence: 0.86,
                  evidence: ['Vietnamese food query normalization'],
                }),
              }),
              { status: 200, headers: { 'content-type': 'application/json' } },
            ),
        },
      },
    );
    const body = result.body as TascoAutocompleteResponse;

    expect(result.status).toBe(200);
    expect(body.meta.expandedQuery).toBe('bun dau');
  });
});
