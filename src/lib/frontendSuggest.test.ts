import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchFrontendSuggest } from './frontendSuggest';

describe('frontend TASCO facade adapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('maps TASCO autocomplete facade results into UI suggestions', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          query: 'cap',
          suggestions: [
            {
              id: 'poi:poi-1',
              type: 'poi',
              name: 'Highlands Coffee Nguyễn Huệ',
              label: 'Highlands Coffee Nguyễn Huệ',
              address: 'Nguyễn Huệ, Quận 1, TP.HCM',
              category: 'cafe',
              score: 0.93,
              source: 'local-fallback',
            },
          ],
          meta: {
            limit: 8,
            sessionId: 'coffee-loyal',
            lang: 'vi',
            source: 'local-fallback',
            normalizedQuery: 'cap',
            expandedQuery: 'ca phe',
            upstreamUsed: false,
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const response = await fetchFrontendSuggest(
      { q: 'cap', userId: 'coffee-loyal', lat: 10.7769, lon: 106.7009, limit: 8 },
      { apiBaseUrl: 'http://127.0.0.1:8787' },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        href: 'http://127.0.0.1:8787/v1/autocomplete?q=cap&limit=8&lang=vi&sessionId=coffee-loyal&lat=10.7769&lon=106.7009',
      }),
      { signal: undefined },
    );
    expect(response.transport).toBe('api');
    expect(response.facadeSource).toBe('local-fallback');
    expect(response.expandedQuery).toBe('ca phe');
    expect(response.suggestions[0]).toEqual(
      expect.objectContaining({
        text: 'Highlands Coffee Nguyễn Huệ',
        source: 'poi',
        score: 0.93,
      }),
    );
    expect(response.diagnostics.expansions[0]).toBe('TASCO facade source -> local-fallback');
  });

  it('falls back to browser suggestions when the facade is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connection refused')));

    const response = await fetchFrontendSuggest({ q: 'cap', limit: 5 }, { apiBaseUrl: 'http://127.0.0.1:8787' });

    expect(response.transport).toBe('local-fallback');
    expect(response.facadeSource).toBe('browser-fallback');
    expect(response.transportReason).toContain('connection refused');
    expect(response.suggestions[0].text).toBe('Quán cà phê gần đây');
  });

  it('boosts API results that match the local learner history', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            query: 'cafe',
            suggestions: [
              {
                id: 'suggestion:generic',
                type: 'query',
                name: 'Quán cà phê gần đây',
                label: 'Quán cà phê gần đây',
                category: 'cafe',
                score: 0.74,
                source: 'local-fallback',
              },
              {
                id: 'poi:POI001',
                type: 'poi',
                name: 'Highlands Coffee Nguyễn Huệ',
                label: 'Highlands Coffee Nguyễn Huệ',
                address: 'Nguyễn Huệ, Quận 1, TP.HCM',
                category: 'cafe',
                score: 0.7,
                source: 'local-fallback',
              },
            ],
            meta: {
              limit: 8,
              lang: 'vi',
              source: 'local-fallback',
              normalizedQuery: 'cafe',
              expandedQuery: 'ca phe',
              upstreamUsed: false,
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );

    const response = await fetchFrontendSuggest({
      q: 'cafe',
      userId: 'local-demo',
      limit: 8,
      behaviorEvents: [
        {
          userId: 'local-demo',
          query: 'highlands',
          selectedText: 'Highlands Coffee Nguyễn Huệ',
          selectedType: 'Brand Search',
          brand: 'Highlands Coffee',
          category: 'cafe',
          city: 'TP.HCM',
          occurredAt: '2026-07-03T00:00:00.000Z',
        },
      ],
    });

    expect(response.suggestions[0].text).toBe('Highlands Coffee Nguyễn Huệ');
    expect(response.suggestions[0].metadata.personalizationReason).toContain('prior result');
    expect(response.suggestions[0].metadata.factors.personalization).toBeGreaterThan(0);
  });
});
