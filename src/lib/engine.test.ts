import { describe, expect, it } from 'vitest';
import { buildDatasetFromCsvs, DATA_FILES } from './dataset';
import { suggest, topSuggestionTexts } from './engine';
import { testCsvs, testDataset } from './testDataset';

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

  it('keeps a nearby cafe query category-consistent', () => {
    const response = suggest(testDataset, { q: 'caphe gan day', limit: 12 });
    const visible = response.suggestions.map((suggestion) => `${suggestion.text} ${suggestion.metadata.category ?? ''}`).join(' ');

    expect(response.expandedQuery).toBe('ca phe gan day');
    expect(response.intent.type).toBe('Nearby Search');
    expect(response.suggestions[0].type).toBe('Nearby Search');
    expect(visible).toMatch(/cà phê|Coffee/i);
    expect(visible).not.toMatch(/Bệnh viện|ATM|xăng/i);
  });

  it('completes an incomplete nearby cafe query and expands matching POIs', () => {
    const response = suggest(testDataset, { q: 'caphe gan', limit: 12 });
    const visible = response.suggestions.map((suggestion) => `${suggestion.text} ${suggestion.metadata.category ?? ''}`).join(' ');

    expect(response.expandedQuery).toBe('ca phe gan day');
    expect(response.intent.type).toBe('Nearby Search');
    expect(response.diagnostics.expansions.join(' ')).toContain('contextual-completion');
    expect(response.suggestions.map((suggestion) => suggestion.text)).toContain('Highlands Coffee Nguyễn Huệ');
    expect(response.suggestions.every((suggestion) => suggestion.type === 'Nearby Search')).toBe(true);
    expect(visible).not.toMatch(/Bệnh viện|ATM|xăng/i);
  });

  it('returns and prioritizes every matching city POI when nearby location context is available', () => {
    const response = suggest(testDataset, { q: 'caphe gan', city: 'TP.HCM', limit: 12 });
    const cityPois = testDataset.pois.filter((poi) => poi.city === 'TP.HCM' && poi.category === 'Quán cà phê');
    const returnedPoiIds = response.suggestions.map((suggestion) => suggestion.poiId).filter(Boolean);

    expect(response.intent.type).toBe('Nearby Search');
    expect(response.suggestions[0].poiId).toBe('POI001');
    expect(cityPois.every((poi) => returnedPoiIds.includes(poi.poiId))).toBe(true);
    expect(response.suggestions.filter((suggestion) => suggestion.metadata.city).every((suggestion) => suggestion.metadata.city === 'TP.HCM')).toBe(true);
  });

  it('composes a compact category with a partial brand prefix', () => {
    const response = suggest(testDataset, { q: 'caphe high', limit: 12 });

    expect(response.expandedQuery).toBe('ca phe high');
    expect(response.intent.type).toBe('Brand Search');
    expect(response.diagnostics.entities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'category', value: 'cà phê' }),
        expect.objectContaining({ kind: 'brand', value: 'Highlands Coffee' }),
      ]),
    );
    expect(response.suggestions[0]).toEqual(
      expect.objectContaining({
        text: 'Highlands Coffee Nguyễn Huệ',
        type: 'Brand Search',
        poiId: 'POI001',
      }),
    );
    expect(response.suggestions.map((suggestion) => suggestion.text).join(' ')).not.toMatch(/Bệnh viện|ATM|xăng/i);
  });

  it('hard-scopes partial brand results to the selected city', () => {
    const inCity = suggest(testDataset, { q: 'caphe high', city: 'TP.HCM', limit: 12 });
    const unavailableCity = suggest(testDataset, { q: 'caphe high', city: 'Hà Nội', limit: 12 });

    expect(inCity.suggestions.map((suggestion) => suggestion.text)).toEqual(['Highlands Coffee Nguyễn Huệ']);
    expect(inCity.suggestions[0].type).toBe('Brand Search');
    expect(unavailableCity.suggestions).toEqual([]);
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

  it('hard-scopes explicit city selections instead of downranking other cities', () => {
    const response = suggest(testDataset, { q: 'caphe', city: 'TP.HCM', limit: 8 });
    const visibleText = response.suggestions
      .map((suggestion) => `${suggestion.text} ${suggestion.metadata.reason} ${suggestion.metadata.address ?? ''}`)
      .join(' ');

    expect(response.suggestions.length).toBeGreaterThan(0);
    expect(visibleText).not.toMatch(/Đà Nẵng|Đà Lạt|Hà Nội|Hải Phòng/);
    expect(
      response.suggestions
        .filter((suggestion) => suggestion.metadata.city)
        .every((suggestion) => suggestion.metadata.city === 'TP.HCM'),
    ).toBe(true);
  });

  it('filters city-specific semantic and template candidates outside the selected city', () => {
    const response = suggest(testDataset, { q: 'ks d', city: 'TP.HCM', userId: 'danang-traveler', limit: 8 });
    const visibleText = response.suggestions
      .map((suggestion) => `${suggestion.text} ${suggestion.metadata.reason} ${suggestion.metadata.address ?? ''}`)
      .join(' ');

    expect(visibleText).not.toMatch(/Đà Nẵng|Da Nang|Mỹ Khê/);
    expect(response.suggestions.every((suggestion) => suggestion.metadata.factors.personalization === 0)).toBe(true);
    expect(response.suggestions.every((suggestion) => !suggestion.metadata.personalizationReason)).toBe(true);
  });

  it('keeps profile and behavior personalization inside the selected city scope', () => {
    const mismatchedBehavior = suggest(testDataset, {
      q: 'cafe',
      city: 'TP.HCM',
      userId: 'local-demo',
      limit: 5,
      behaviorEvents: [
        {
          userId: 'local-demo',
          query: 'cafe',
          selectedText: 'Highlands Coffee Nguyễn Huệ',
          selectedType: 'POI Search',
          brand: 'Highlands Coffee',
          category: 'Quán cà phê',
          city: 'Đà Nẵng',
          occurredAt: '2026-07-03T00:00:00.000Z',
        },
      ],
    });
    const highlands = mismatchedBehavior.suggestions.find((suggestion) => suggestion.text === 'Highlands Coffee Nguyễn Huệ');

    expect(highlands?.metadata.factors.personalization).toBe(0);
    expect(highlands?.metadata.personalizationReason).toBeUndefined();

    const matchingCityProfile = suggest(testDataset, { q: 'ks d', city: 'Đà Nẵng', userId: 'danang-traveler', limit: 5 });
    expect(matchingCityProfile.suggestions.some((suggestion) => suggestion.metadata.personalizationReason?.includes('Da Nang traveler'))).toBe(
      true,
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
    expect(response.suggestions[0].metadata.explanation).toEqual(
      expect.objectContaining({
        summary: expect.stringContaining(response.suggestions[0].text),
        evidence: expect.arrayContaining([
          expect.stringContaining('Source:'),
          expect.stringContaining('Ranking reason:'),
          expect.stringContaining('Top score factors:'),
        ]),
        groundedFields: expect.arrayContaining(['source', 'metadata.reason', 'metadata.factors']),
      }),
    );
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
    const baselineHighlandsIndex = baseline.suggestions.findIndex((suggestion) => suggestion.text === 'Highlands Coffee Nguyễn Huệ');
    const weightedHighlandsIndex = weighted.suggestions.findIndex((suggestion) => suggestion.text === 'Highlands Coffee Nguyễn Huệ');

    expect(weightedHighlandsIndex).toBeGreaterThanOrEqual(0);
    expect(weightedHighlandsIndex).toBeLessThan(baselineHighlandsIndex);
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

  it('adds deterministic prefix-completion predictions as a candidate source', () => {
    const response = suggest(testDataset, { q: 'phong gym m c 2', agentic: false, limit: 5 });

    expect(response.diagnostics.agentic.provider).toBe('disabled');
    expect(response.suggestions[0]).toEqual(
      expect.objectContaining({
        text: 'Phòng gym mở cửa 24/7',
        source: 'predicted',
        type: 'Discovery Search',
      }),
    );
    expect(response.suggestions[0].metadata.reason).toContain('prefix-completion language model');
    expect(response.suggestions[0].metadata.explanation?.summary).toContain('prefix-completion language model');
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

  it('uses current coordinates for POI locality and infers city scope when city is absent', () => {
    const response = suggest(testDataset, {
      q: 'atm',
      lat: 10.7751,
      lon: 106.7035,
      limit: 5,
      agentic: false,
    });
    const nearbyAtm = response.suggestions.find((suggestion) => suggestion.text === 'ATM Vietcombank Nguyễn Huệ');

    expect(response.diagnostics.expansions).toContain('coordinate-city-inference -> TP.HCM');
    expect(nearbyAtm?.metadata.factors.locality).toBe(1);
    expect(nearbyAtm?.metadata.reason).toContain('current-location distance 0 m');
    expect(
      response.suggestions
        .filter((suggestion) => suggestion.metadata.city)
        .every((suggestion) => suggestion.metadata.city === 'TP.HCM'),
    ).toBe(true);
  });

  it('uses time-of-day context for 24/7 and open-late candidates at night', () => {
    const baseline = suggest(testDataset, { q: 'cafe', limit: 8, agentic: false });
    const nighttime = suggest(testDataset, {
      q: 'cafe',
      now: '2026-07-05T23:30:00+07:00',
      limit: 8,
      agentic: false,
    });
    const baselineOpen24 = baseline.suggestions.find((suggestion) => suggestion.text === 'Cà phê mở cửa 24/7');
    const nightOpen24 = nighttime.suggestions.find((suggestion) => suggestion.text === 'Cà phê mở cửa 24/7');

    expect(nightOpen24?.metadata.factors.locality).toBe(1);
    expect(nightOpen24?.metadata.reason).toContain('night context favors 24/7/open-late result');
    expect(nightOpen24?.score ?? 0).toBeGreaterThan(baselineOpen24?.score ?? 0);
  });

  it('uses morning context for breakfast phở without mislabeling generic cafe results', () => {
    const breakfastDataset = buildDatasetFromCsvs({
      ...testCsvs,
      [DATA_FILES.autocomplete]: `${testCsvs[DATA_FILES.autocomplete].trim()}
SUG011,pho,Phở ăn sáng,Category Search,0.92,5100`,
      [DATA_FILES.pois]: `${testCsvs[DATA_FILES.pois].trim()}
POI011,Phở Sáng Nguyễn Trãi,Phở,,"12 Nguyễn Trãi, Quận 1, TP.HCM",TP.HCM,10.77,106.697,4.5,900,82,phở;bữa sáng;ăn uống`,
    });
    const breakfast = suggest(breakfastDataset, {
      q: 'pho',
      now: '2026-07-05T07:30:00+07:00',
      limit: 8,
      agentic: false,
    });
    const breakfastPho = breakfast.suggestions.find((suggestion) => suggestion.text === 'Phở ăn sáng');
    const cafe = suggest(testDataset, {
      q: 'cafe',
      now: '2026-07-05T07:30:00+07:00',
      limit: 8,
      agentic: false,
    });

    expect(breakfastPho?.metadata.factors.locality).toBe(0.96);
    expect(breakfastPho?.metadata.reason).toContain('morning context favors breakfast/phở result');
    expect(cafe.suggestions.find((suggestion) => suggestion.text === 'Highlands Coffee Nguyễn Huệ')?.metadata.reason).not.toContain(
      'breakfast/phở',
    );
  });
});
