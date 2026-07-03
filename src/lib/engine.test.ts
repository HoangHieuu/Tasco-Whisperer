import { describe, expect, it } from 'vitest';
import { suggest, topSuggestionTexts } from './engine';
import { testDataset } from './testDataset';

describe('suggest', () => {
  it('returns Vin brand suggestions for vin', () => {
    expect(topSuggestionTexts(testDataset, 'vin', 3)).toEqual(
      expect.arrayContaining(['Vincom Center', 'Vinmec', 'Vinpearl']),
    );
  });

  it('returns cafe category and brand suggestions', () => {
    const suggestions = topSuggestionTexts(testDataset, 'cafe', 5);
    expect(suggestions).toEqual(expect.arrayContaining(['Quán cà phê gần đây', 'Highlands Coffee']));
  });

  it('uses algorithmic syllable segmentation for compact no-space coffee query', () => {
    const response = suggest(testDataset, { q: 'caphe', limit: 5 });

    expect(response.normalizedQuery).toBe('caphe');
    expect(response.expandedQuery).toBe('ca phe');
    expect(response.intent.type).toBe('Category Search');
    expect(response.diagnostics.agentic).toEqual(
      expect.objectContaining({
        triggered: false,
        reason: 'deterministic result is strong enough',
      }),
    );
    expect(response.diagnostics.expansions.join(' ')).toContain('syllable-segmentation');
    expect(response.suggestions.map((suggestion) => suggestion.text)).toEqual(
      expect.arrayContaining(['Quán cà phê gần đây', 'Cà phê mở cửa 24/7']),
    );
    expect(response.suggestions.some((suggestion) => suggestion.text.includes('Highlands Coffee'))).toBe(true);
  });

  it('uses algorithmic compact-prefix segmentation while a user is still typing caphe', () => {
    const response = suggest(testDataset, { q: 'cap', limit: 5 });

    expect(response.normalizedQuery).toBe('cap');
    expect(response.expandedQuery).toBe('ca phe');
    expect(response.intent.type).toBe('Category Search');
    expect(response.diagnostics.agentic).toEqual(
      expect.objectContaining({
        triggered: false,
        reason: 'deterministic result is strong enough',
      }),
    );
    expect(response.diagnostics.expansions.join(' ')).toContain('syllable-segmentation');
    expect(response.suggestions[0].text).toBe('Quán cà phê gần đây');
    expect(response.suggestions.map((suggestion) => suggestion.text)).toEqual(
      expect.arrayContaining(['Highlands Coffee Nguyễn Huệ', 'Cà phê mở cửa 24/7']),
    );
  });

  it('keeps compact-prefix deterministic fallback when agentic correction is disabled', () => {
    const response = suggest(testDataset, { q: 'caphe', limit: 5, agentic: false });

    expect(response.diagnostics.agentic).toEqual(
      expect.objectContaining({
        provider: 'disabled',
        triggered: false,
      }),
    );
    expect(response.intent.type).toBe('Category Search');
    expect(response.suggestions.map((suggestion) => suggestion.text)).toEqual(
      expect.arrayContaining(['Quán cà phê gần đây', 'Highlands Coffee Nguyễn Huệ']),
    );
  });

  it('uses compact-prefix typeahead for other Vietnamese no-space category prefixes without agentic rewrites', () => {
    const gasResponse = suggest(testDataset, { q: 'cayx', limit: 5, agentic: false });
    expect(gasResponse.diagnostics.agentic).toEqual(expect.objectContaining({ provider: 'disabled' }));
    expect(gasResponse.suggestions.map((suggestion) => suggestion.text)).toEqual(
      expect.arrayContaining(['Cây xăng gần đây']),
    );

    const hospitalResponse = suggest(testDataset, { q: 'benhv', limit: 5, agentic: false });
    expect(hospitalResponse.intent.type).toBe('Nearby Search');
    expect(hospitalResponse.suggestions.map((suggestion) => suggestion.text)).toEqual(
      expect.arrayContaining(['Bệnh viện Bạch Mai']),
    );
  });

  it('does not overcorrect negative compact rewrite cases', () => {
    expect(suggest(testDataset, { q: 'capherang', limit: 5 }).suggestions).toEqual([]);
    expect(suggest(testDataset, { q: 'caphe sua da', limit: 5 }).suggestions).toEqual([]);
    expect(suggest(testDataset, { q: 'nhathuoc', limit: 5 }).suggestions).toEqual([]);
  });

  it('uses abbreviation expansion for hotel in Da Nang', () => {
    const response = suggest(testDataset, { q: 'ks d', city: 'Đà Nẵng', limit: 5 });
    expect(response.expandedQuery).toContain('khach san');
    expect(response.suggestions.map((suggestion) => suggestion.text)).toEqual(
      expect.arrayContaining(['Khách sạn Đà Nẵng', 'Khách sạn gần biển Đà Nẵng']),
    );
  });

  it('retrieves address and POI suggestions for Nguyen Hue typo/prefix', () => {
    const suggestions = topSuggestionTexts(testDataset, 'nguyen h', 5);
    expect(suggestions).toEqual(
      expect.arrayContaining(['Nguyễn Huệ, Quận 1, TP.HCM', 'Highlands Coffee Nguyễn Huệ']),
    );
  });

  it('returns score metadata for debug and explainability', () => {
    const response = suggest(testDataset, { q: 'atm', userId: 'commuter', limit: 3 });
    expect(response.intent.type).toBe('Nearby Search');
    expect(response.suggestions[0].metadata.factors).toHaveProperty('lexical');
    expect(response.suggestions[0].metadata.factors.personalization).toBeGreaterThan(0);
  });

  it('keeps non-personalized ranking free of profile boosts', () => {
    const response = suggest(testDataset, { q: 'cafe', limit: 3 });

    expect(response.suggestions[0].metadata.factors.personalization).toBe(0);
    expect(response.suggestions[0].metadata.personalizationReason).toBeUndefined();
  });

  it('explains simulated profile boosts for matching candidates only', () => {
    const baseline = suggest(testDataset, { q: 'cafe', limit: 5 });
    const personalized = suggest(testDataset, { q: 'cafe', userId: 'coffee-loyal', limit: 5 });
    const baselineCoffee = baseline.suggestions.find((suggestion) => suggestion.text === 'Highlands Coffee Nguyễn Huệ');
    const boostedCoffee = personalized.suggestions.find((suggestion) => suggestion.text === 'Highlands Coffee Nguyễn Huệ');

    expect(boostedCoffee?.metadata.factors.personalization).toBe(1);
    expect(boostedCoffee?.metadata.personalizationReason).toBe('Coffee loyalist: coffee category and cafe-brand preference');
    expect(boostedCoffee?.score ?? 0).toBeGreaterThan(baselineCoffee?.score ?? 0);

    const unknown = suggest(testDataset, { q: 'cafe', userId: 'unknown-profile', limit: 3 });
    expect(unknown.suggestions[0].metadata.factors.personalization).toBe(0);
    expect(unknown.suggestions[0].metadata.personalizationReason).toBeUndefined();
  });

  it('keeps personalization independent from the optional agentic path', () => {
    const response = suggest(testDataset, { q: 'caphe', userId: 'coffee-loyal', limit: 5, agentic: false });

    expect(response.diagnostics.agentic.provider).toBe('disabled');
    expect(response.suggestions[0].metadata.factors.personalization).toBe(1);
    expect(response.suggestions[0].metadata.personalizationReason).toContain('Coffee loyalist');
  });

  it('uses local behavior events as personalization evidence for repeated selections', () => {
    const response = suggest(testDataset, {
      q: 'cafe',
      userId: 'local-demo',
      limit: 5,
      behaviorEvents: [
        {
          userId: 'local-demo',
          query: 'cafe',
          selectedText: 'Highlands Coffee Nguyễn Huệ',
          selectedType: 'POI Search',
          brand: 'Highlands Coffee',
          city: 'TP.HCM',
          occurredAt: '2026-07-03T00:00:00.000Z',
        },
      ],
    });
    const highlands = response.suggestions.find((suggestion) => suggestion.text === 'Highlands Coffee Nguyễn Huệ');

    expect(highlands?.metadata.factors.personalization).toBeGreaterThan(0);
    expect(highlands?.metadata.personalizationReason).toContain('Local learner');
  });

  it('accepts explicit ranking weights without changing the default ranking contract', () => {
    const baseline = suggest(testDataset, {
      q: 'cafe',
      userId: 'local-demo',
      limit: 5,
      behaviorEvents: [
        {
          userId: 'local-demo',
          query: 'cafe',
          selectedText: 'Highlands Coffee Nguyễn Huệ',
          selectedType: 'POI Search',
          brand: 'Highlands Coffee',
          occurredAt: '2026-07-03T00:00:00.000Z',
        },
      ],
    });
    const weighted = suggest(testDataset, {
      q: 'cafe',
      userId: 'local-demo',
      limit: 5,
      rankingWeights: {
        lexical: 0.2,
        intent: 0.15,
        source: 0.1,
        popularity: 0.05,
        poiQuality: 0.05,
        locality: 0.05,
        personalization: 0.35,
        diversity: 0.05,
      },
      behaviorEvents: [
        {
          userId: 'local-demo',
          query: 'cafe',
          selectedText: 'Highlands Coffee Nguyễn Huệ',
          selectedType: 'POI Search',
          brand: 'Highlands Coffee',
          occurredAt: '2026-07-03T00:00:00.000Z',
        },
      ],
    });
    const baselineHighlands = baseline.suggestions.find((suggestion) => suggestion.text === 'Highlands Coffee Nguyễn Huệ');
    const weightedHighlands = weighted.suggestions.find((suggestion) => suggestion.text === 'Highlands Coffee Nguyễn Huệ');

    expect(weightedHighlands?.score ?? 0).toBeGreaterThan(baselineHighlands?.score ?? 0);
  });

  it('extracts entities for category, brand, city, and attribute queries', () => {
    const hotelResponse = suggest(testDataset, { q: 'ks da nang', limit: 5 });
    expect(hotelResponse.diagnostics.entities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'category', value: 'Khách sạn' }),
        expect.objectContaining({ kind: 'city', value: 'Đà Nẵng' }),
      ]),
    );

    const atmResponse = suggest(testDataset, { q: 'atm vcb', limit: 5 });
    expect(atmResponse.diagnostics.entities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'category', value: 'ATM' }),
        expect.objectContaining({ kind: 'brand', value: 'Vietcombank' }),
      ]),
    );

    const cafeResponse = suggest(testDataset, { q: 'cafe wifi', limit: 5 });
    expect(cafeResponse.intent.type).toBe('Attribute Search');
    expect(cafeResponse.diagnostics.entities).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'attribute', value: 'Wi-Fi' })]),
    );
  });

  it('uses data-derived pattern generation before falling back to hand-authored templates', () => {
    const response = suggest(testDataset, { q: 'cafe wifi', limit: 5 });
    const wifiSuggestion = response.suggestions.find((suggestion) => suggestion.text === 'Quán cà phê có Wi-Fi');

    expect(wifiSuggestion).toEqual(
      expect.objectContaining({
        source: 'generated',
        metadata: expect.objectContaining({
          reason: 'data-derived category, attribute, and location phrase',
        }),
      }),
    );
  });

  it('uses enriched POI attributes in ranking explanations', () => {
    const response = suggest(testDataset, { q: 'highlands', limit: 5 });
    const poiSuggestion = response.suggestions.find((suggestion) => suggestion.text === 'Highlands Coffee Nguyễn Huệ');

    expect(poiSuggestion).toEqual(
      expect.objectContaining({
        source: 'poi',
        metadata: expect.objectContaining({
          reason: expect.stringContaining('enriched evidence'),
          enrichedAttributes: expect.arrayContaining([
            expect.objectContaining({ key: 'tag:wifi', label: 'Có Wi-Fi' }),
            expect.objectContaining({ key: 'quality:good-rating' }),
          ]),
        }),
      }),
    );
  });

  it('classifies coordinate-style prefixes', () => {
    const response = suggest(testDataset, { q: '10.77', limit: 3 });
    expect(response.intent.type).toBe('Coordinate Search');
    expect(response.suggestions[0].text).toBe('10.7769,106.7009');
  });
});
