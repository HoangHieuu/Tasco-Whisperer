import { describe, expect, it } from 'vitest';
import { handleSuggestApiRequest, type ApiErrorResponse } from './suggestApi';
import { testDataset } from './testDataset';
import type { SuggestResponse } from './types';

describe('handleSuggestApiRequest', () => {
  it('returns schema-compatible suggestions for a valid request', () => {
    const result = handleSuggestApiRequest(testDataset, {
      method: 'GET',
      url: '/api/suggest?q=cafe%20wifi&limit=3',
    });
    const body = result.body as SuggestResponse;

    expect(result.status).toBe(200);
    expect(result.headers['content-type']).toContain('application/json');
    expect(body.query).toBe('cafe wifi');
    expect(body.intent.type).toBe('Attribute Search');
    expect(body.suggestions).toHaveLength(3);
    expect(body.suggestions.map((suggestion) => suggestion.text)).toEqual(
      expect.arrayContaining(['Cafe có Wi-Fi', 'Quán cà phê có Wi-Fi']),
    );
    expect(body.diagnostics.embedding?.neighbors.length).toBeGreaterThan(0);
  });

  it('returns deterministic fallback suggestions for an empty query', () => {
    const result = handleSuggestApiRequest(testDataset, { method: 'GET', url: '/api/suggest' });
    const body = result.body as SuggestResponse;

    expect(result.status).toBe(200);
    expect(body.query).toBe('');
    expect(body.suggestions.length).toBeGreaterThan(0);
  });

  it('returns algorithmic rewrite diagnostics for compact Vietnamese variants', () => {
    const result = handleSuggestApiRequest(testDataset, {
      method: 'GET',
      url: '/api/suggest?q=caphe&limit=5',
    });
    const body = result.body as SuggestResponse;

    expect(result.status).toBe(200);
    expect(body.suggestions.map((suggestion) => suggestion.text)).toEqual(
      expect.arrayContaining(['Quán cà phê gần đây', 'Cà phê mở cửa 24/7']),
    );
    expect(body.suggestions.some((suggestion) => suggestion.text.includes('Highlands Coffee'))).toBe(true);
    expect(body.diagnostics.agentic).toEqual(
      expect.objectContaining({ triggered: false, reason: 'deterministic result is strong enough' }),
    );
    expect(body.diagnostics.expansions.join(' ')).toContain('syllable-segmentation');
  });

  it('can disable agentic correction through query params', () => {
    const result = handleSuggestApiRequest(testDataset, {
      method: 'GET',
      url: '/api/suggest?q=caphe&agentic=false',
    });
    const body = result.body as SuggestResponse;

    expect(result.status).toBe(200);
    expect(body.suggestions.map((suggestion) => suggestion.text)).toEqual(
      expect.arrayContaining(['Quán cà phê gần đây', 'Highlands Coffee Nguyễn Huệ']),
    );
    expect(body.diagnostics.agentic.provider).toBe('disabled');
    expect(body.diagnostics.agentic.triggered).toBe(false);
  });

  it('rejects invalid limit values with a clear 400 response', () => {
    const result = handleSuggestApiRequest(testDataset, {
      method: 'GET',
      url: '/api/suggest?q=atm&limit=99',
    });
    const body = result.body as ApiErrorResponse;

    expect(result.status).toBe(400);
    expect(body.error.code).toBe('invalid_request');
    expect(body.error.details).toEqual(expect.arrayContaining(['limit must be between 1 and 12']));
  });

  it('rejects invalid agentic toggle values', () => {
    const result = handleSuggestApiRequest(testDataset, {
      method: 'GET',
      url: '/api/suggest?q=caphe&agentic=maybe',
    });
    const body = result.body as ApiErrorResponse;

    expect(result.status).toBe(400);
    expect(body.error.details).toEqual(expect.arrayContaining(['agentic must be true or false']));
  });

  it('rejects incomplete coordinate context', () => {
    const result = handleSuggestApiRequest(testDataset, {
      method: 'GET',
      url: '/api/suggest?q=atm&lat=10.77',
    });
    const body = result.body as ApiErrorResponse;

    expect(result.status).toBe(400);
    expect(body.error.details).toEqual(expect.arrayContaining(['lat and lng must be provided together']));
  });

  it('accepts city and simulated profile context', () => {
    const result = handleSuggestApiRequest(testDataset, {
      method: 'GET',
      url: '/api/suggest?q=atm&city=TP.HCM&userId=commuter&limit=3',
    });
    const body = result.body as SuggestResponse;

    expect(result.status).toBe(200);
    expect(body.suggestions).toHaveLength(3);
    expect(body.suggestions[0].metadata.factors.personalization).toBeGreaterThan(0);
    expect(body.suggestions[0].metadata.personalizationReason).toContain('Daily commuter');
    expect(result.log.userId).toBe('commuter');
  });

  it('returns 404 for unknown routes and 405 for non-GET requests', () => {
    expect(handleSuggestApiRequest(testDataset, { method: 'GET', url: '/api/unknown' }).status).toBe(404);
    expect(handleSuggestApiRequest(testDataset, { method: 'POST', url: '/api/suggest?q=cafe' }).status).toBe(405);
  });
});
