import { describe, expect, it } from 'vitest';
import { createTascoApiClient } from './tascoApiClient';

describe('createTascoApiClient', () => {
  it('returns undefined when no live base URL is configured', () => {
    expect(createTascoApiClient({})).toBeUndefined();
  });

  it('calls the TASCO autocomplete endpoint with auth and locale headers', async () => {
    const calls: Array<{ url: string; headers: unknown }> = [];
    const client = createTascoApiClient({
      baseUrl: 'https://hackathon.example.com',
      bearerToken: 'token-123',
      apiKey: 'key-123',
      headerProvider: () => ({ 'x-custom-auth-context': 'mobile-session' }),
      fetcher: async (input, init) => {
        calls.push({ url: String(input), headers: init?.headers });
        return new Response(
          JSON.stringify({
            suggestions: [
              {
                id: 'poi:landmark-72',
                type: 'poi',
                name: 'Landmark 72',
                label: 'Landmark 72',
                coordinates: { lat: 21.0166, lon: 105.7833 },
                score: 0.98,
                source: 'mock',
                enrichment: {
                  fields: {
                    rating: {
                      source: 'live-upstream',
                      confidence: 0.9,
                      evidence: ['rating'],
                      generated: false,
                      verifiedRealWorld: true,
                    },
                  },
                  attributes: [
                    {
                      key: 'quality:high-rating',
                      label: 'Đánh giá rất tốt',
                      source: 'live-upstream',
                      confidence: 0.9,
                      evidence: ['rating=4.7'],
                    },
                  ],
                  reconciliations: [],
                  summaryEvidence: ['rating'],
                },
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      },
    });

    const results = await client!.autocomplete!({ q: 'land', limit: 5, lang: 'vi', sessionId: 's-1' });

    expect(calls[0].url).toBe('https://hackathon.example.com/v1/autocomplete?q=land&limit=5&lang=vi&sessionId=s-1');
    expect(calls[0].headers).toEqual(
      expect.objectContaining({
        authorization: 'Bearer token-123',
        'x-api-key': 'key-123',
        'x-request-id': expect.any(String),
        'x-locale': 'vi-VN',
        'x-timezone': 'Asia/Ho_Chi_Minh',
        'x-custom-auth-context': 'mobile-session',
      }),
    );
    expect(results[0]).toEqual(
      expect.objectContaining({
        id: 'poi:landmark-72',
        label: 'Landmark 72',
        coordinates: { lat: 21.0166, lon: 105.7833 },
        enrichment: expect.objectContaining({
          attributes: expect.arrayContaining([expect.objectContaining({ key: 'quality:high-rating' })]),
        }),
      }),
    );
  });

  it('filters malformed upstream rows', async () => {
    const client = createTascoApiClient({
      baseUrl: 'https://hackathon.example.com',
      fetcher: async () =>
        new Response(
          JSON.stringify({
            results: [
              { label: 'Missing ID' },
              { id: 'poi:ok', label: 'OK Place', source: 'mock' },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    });

    const results = await client!.search!({ q: 'ok', limit: 5, lang: 'vi' });

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('poi:ok');
  });

  it('accepts the documented facade base URL with a trailing /v1 segment', async () => {
    const calls: string[] = [];
    const client = createTascoApiClient({
      baseUrl: 'https://hackathon.example.com/v1',
      fetcher: async (input) => {
        calls.push(String(input));
        return jsonResponse({ suggestions: [{ id: 'poi:ok', label: 'OK Place', source: 'mock' }] });
      },
    });

    await client!.autocomplete!({ q: 'ok', limit: 5, lang: 'vi' });

    expect(calls[0]).toBe('https://hackathon.example.com/v1/autocomplete?q=ok&limit=5&lang=vi');
  });

  it('calls POI, reverse, nearby, geocoding, and route upstream endpoints', async () => {
    const calls: Array<{ url: string; method?: string; body?: string }> = [];
    const client = createTascoApiClient({
      baseUrl: 'https://hackathon.example.com',
      fetcher: async (input, init) => {
        calls.push({ url: String(input), method: init?.method, body: typeof init?.body === 'string' ? init.body : undefined });
        const url = String(input);
        if (url.includes('/v1/poi/')) {
          return jsonResponse({ poi: { id: 'poi:1', label: 'POI 1', source: 'mock' } });
        }
        if (url.includes('/v1/route')) {
          return jsonResponse({ routes: [], meta: { mode: 'auto', alternates: 2 } });
        }
        return jsonResponse({ results: [{ id: 'poi:1', label: 'POI 1', source: 'mock' }] });
      },
    });

    await client!.poi!('poi:1', { lang: 'vi', include: 'ai_summary' });
    await client!.reverseGeocoding!({ lat: 10, lon: 106, lang: 'vi', radiusMeters: 500 });
    await client!.nearbySearch!({ lat: 10, lon: 106, lang: 'vi', radiusMeters: 1000, category: 'cafe', limit: 3 });
    await client!.geocoding!({ address: 'Nguyen Hue', city: 'TP.HCM', lang: 'vi', limit: 2 });
    await client!.route!({ locations: [{ lat: 10, lon: 106 }, { lat: 11, lon: 107 }], mode: 'auto' });

    expect(calls.map((call) => call.url)).toEqual([
      'https://hackathon.example.com/v1/poi/poi%3A1?lang=vi&include=ai_summary',
      'https://hackathon.example.com/v1/reverse-geocoding?lang=vi&lat=10&lon=106&radiusMeters=500',
      'https://hackathon.example.com/v1/nearby-search?limit=3&lang=vi&lat=10&lon=106&radiusMeters=1000&category=cafe',
      'https://hackathon.example.com/v1/geocoding?address=Nguyen+Hue&city=TP.HCM&limit=2&lang=vi',
      'https://hackathon.example.com/v1/route',
    ]);
    expect(calls[4].method).toBe('POST');
    expect(calls[4].body).toContain('"locations"');
  });

  it('forwards documented search filters to live upstream search', async () => {
    const calls: string[] = [];
    const client = createTascoApiClient({
      baseUrl: 'https://hackathon.example.com',
      fetcher: async (input) => {
        calls.push(String(input));
        return jsonResponse({ results: [{ id: 'poi:1', label: 'POI 1', source: 'mock' }] });
      },
    });

    await client!.search!({
      q: 'coffee',
      lat: 21.0278,
      lon: 105.8342,
      radiusMeters: 1500,
      bbox: '105.7,21.0,105.9,21.1',
      category: 'cafe',
      limit: 5,
      lang: 'vi',
    });

    expect(calls[0]).toBe(
      'https://hackathon.example.com/v1/search?q=coffee&limit=5&lang=vi&lat=21.0278&lon=105.8342&radiusMeters=1500&category=cafe&bbox=105.7%2C21.0%2C105.9%2C21.1',
    );
  });

  it('normalizes live upstream route responses into the stable route DTO', async () => {
    const client = createTascoApiClient({
      baseUrl: 'https://hackathon.example.com/v1',
      fetcher: async () =>
        jsonResponse({
          routes: [
            {
              sourceIndex: 5,
              summary: { distanceMeters: 1234.7, durationSeconds: 456.2 },
              geometry: {
                type: 'Unexpected',
                coordinates: [
                  [106.7031, 10.7759],
                  ['bad', 10],
                  [106.698, 10.772],
                ],
              },
              maneuvers: [
                {
                  instruction: 'Rẽ phải',
                  distanceMeters: 120.8,
                  durationSeconds: 30.2,
                  beginShapeIndex: 0,
                  endShapeIndex: 1,
                  streetNames: ['Nguyễn Huệ', 123],
                },
              ],
            },
          ],
          meta: { mode: 'pedestrian', alternates: 1 },
        }),
    });

    const route = await client!.route!({
      locations: [
        { lat: 10.7759, lon: 106.7031 },
        { lat: 10.772, lon: 106.698 },
      ],
      mode: 'auto',
      alternates: 2,
    });

    expect(route).toEqual({
      routes: [
        {
          routeId: 'route:live-1',
          sourceIndex: 5,
          summary: { distanceMeters: 1235, durationSeconds: 456 },
          geometry: {
            type: 'LineString',
            coordinates: [
              [106.7031, 10.7759],
              [106.698, 10.772],
            ],
          },
          maneuvers: [
            {
              instruction: 'Rẽ phải',
              distanceMeters: 121,
              durationSeconds: 30,
              beginShapeIndex: 0,
              endShapeIndex: 1,
              streetNames: ['Nguyễn Huệ'],
            },
          ],
        },
      ],
      meta: {
        mode: 'pedestrian',
        alternates: 1,
        source: 'live',
        upstreamUsed: true,
      },
    });
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}
