import { describe, expect, it } from 'vitest';
import { explainSuggestion } from './suggestionNarrator';
import type { Suggestion } from './types';

const baseSuggestion: Suggestion = {
  id: 'poi:POI001',
  text: 'Highlands Coffee Nguyễn Huệ',
  normalizedText: 'highlands coffee nguyen hue',
  type: 'Category Search',
  source: 'poi',
  matched: ['Quán cà phê', 'Highlands Coffee'],
  poiId: 'POI001',
  score: 0.91,
  metadata: {
    reason: 'matched Quán cà phê in TP.HCM',
    city: 'TP.HCM',
    address: '86 Nguyễn Huệ, Quận 1, TP.HCM',
    brand: 'Highlands Coffee',
    category: 'Quán cà phê',
    personalizationReason: 'Coffee loyalist: coffee category and cafe-brand preference',
    enrichedAttributes: [
      {
        key: 'tag:wifi',
        label: 'Có Wi-Fi',
        value: 'wifi',
        source: 'provided-dataset',
        confidence: 0.84,
        evidence: ['tag=wifi'],
      },
    ],
    factors: {
      lexical: 0.9,
      intent: 1,
      source: 0.8,
      popularity: 0.88,
      poiQuality: 0.68,
      locality: 1,
      personalization: 1,
      diversity: 0.66,
    },
  },
};

describe('suggestion narrator', () => {
  it('builds a short explanation only from suggestion metadata', () => {
    const explanation = explainSuggestion(baseSuggestion);

    expect(explanation.summary).toContain('Highlands Coffee Nguyễn Huệ');
    expect(explanation.summary).toContain('POI dataset row');
    expect(explanation.summary).toContain('Category Search');
    expect(explanation.evidence).toEqual(
      expect.arrayContaining([
        'Source: POI dataset row',
        'Matched query evidence: Quán cà phê, Highlands Coffee',
        'Ranking reason: matched Quán cà phê in TP.HCM',
        'Brand: Highlands Coffee',
        'Category: Quán cà phê',
        'City: TP.HCM',
        'Address: 86 Nguyễn Huệ, Quận 1, TP.HCM',
      ]),
    );
    expect(explanation.evidence.join(' ')).toContain('Coffee loyalist');
    expect(explanation.evidence.join(' ')).toContain('Có Wi-Fi');
    expect(explanation.groundedFields).toEqual(expect.arrayContaining(['source', 'matched', 'metadata.factors']));
  });

  it('does not require optional POI, personalization, or enrichment fields', () => {
    const explanation = explainSuggestion({
      ...baseSuggestion,
      source: 'autocomplete',
      matched: ['cafe'],
      metadata: {
        reason: 'historical autocomplete pair',
        factors: {
          lexical: 0.97,
          intent: 1,
          source: 0.95,
          popularity: 0.42,
          poiQuality: 0.68,
          locality: 0.7,
          personalization: 0,
          diversity: 0.66,
        },
      },
    });

    expect(explanation.summary).toContain('historical autocomplete pair');
    expect(explanation.evidence).toEqual(expect.arrayContaining(['Ranking reason: historical autocomplete pair']));
    expect(explanation.evidence.join(' ')).not.toContain('undefined');
  });
});
