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
              scoreFactors: {
                lexical: 0.91,
                intent: 0.82,
                source: 0.73,
                popularity: 0.64,
                poiQuality: 0.55,
                locality: 0.46,
                personalization: 0.37,
                diversity: 0.28,
              },
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
        href: 'http://127.0.0.1:8787/v1/autocomplete?q=cap&limit=8&lang=vi&sessionId=coffee-loyal&userId=coffee-loyal&lat=10.7769&lon=106.7009',
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
    expect(response.suggestions[0].metadata.reason).toContain('engine ranking factors');
    expect(response.suggestions[0].metadata.factors).toEqual(
      expect.objectContaining({
        lexical: 0.91,
        intent: 0.82,
        diversity: 0.28,
      }),
    );
    expect(response.diagnostics.expansions[0]).toBe('TASCO facade source -> local-fallback');
  });

  it('labels tasco-api facade rows as live and avoids pretending score factors are available', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            query: 'vin',
            suggestions: [
              {
                id: 'poi:live-vin',
                type: 'poi',
                name: 'Live Vincom',
                label: 'Live Vincom',
                category: 'shopping mall',
                score: 0.88,
                source: 'tasco-api',
              },
            ],
            meta: {
              limit: 8,
              lang: 'vi',
              source: 'live',
              normalizedQuery: 'vin',
              expandedQuery: 'vin',
              upstreamUsed: true,
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );

    const response = await fetchFrontendSuggest({ q: 'vin', limit: 8 });

    expect(response.facadeSource).toBe('live');
    expect(response.suggestions[0].metadata.reason).toContain('TASCO live API');
    expect(response.suggestions[0].metadata.reason).toContain('factor details unavailable');
    expect(response.suggestions[0].metadata.factors).toEqual(
      expect.objectContaining({
        lexical: 0.88,
        source: 0,
        intent: 0,
      }),
    );
  });

  it('passes city scope to the facade and drops stale out-of-city API rows', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          query: 'caphe',
          suggestions: [
            {
              id: 'poi:POI001',
              type: 'poi',
              name: 'Highlands Coffee Nguyễn Huệ',
              label: 'Highlands Coffee Nguyễn Huệ',
              address: '86 Nguyễn Huệ, Quận 1, TP.HCM',
              category: 'Quán cà phê',
              score: 0.82,
              source: 'local-fallback',
            },
            {
              id: 'poi:POI999',
              type: 'poi',
              name: 'Highlands Coffee Võ Nguyên Giáp Đà Nẵng',
              label: 'Highlands Coffee Võ Nguyên Giáp Đà Nẵng',
              address: '285 Phan Chu Trinh, Đà Nẵng',
              category: 'Quán cà phê',
              score: 0.92,
              source: 'local-fallback',
            },
          ],
          meta: {
            limit: 8,
            lang: 'vi',
            city: 'TP.HCM',
            source: 'local-fallback',
            normalizedQuery: 'caphe',
            expandedQuery: 'ca phe',
            upstreamUsed: false,
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const response = await fetchFrontendSuggest(
      { q: 'caphe', city: 'TP.HCM', limit: 8 },
      { apiBaseUrl: 'http://127.0.0.1:8787' },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        href: 'http://127.0.0.1:8787/v1/autocomplete?q=caphe&limit=8&lang=vi&city=TP.HCM',
      }),
      { signal: undefined },
    );
    expect(response.suggestions.map((suggestion) => suggestion.text)).toEqual(['Highlands Coffee Nguyễn Huệ']);
    expect(response.diagnostics.candidateCount).toBe(1);
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
