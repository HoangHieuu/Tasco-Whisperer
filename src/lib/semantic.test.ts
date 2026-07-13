import { describe, expect, it } from 'vitest';
import { suggest } from './engine';
import { buildEmbeddingIndex, hasStrongSemanticEvidence, searchEmbeddingIndex, semanticSimilarity, voteIntentFromNeighbors } from './semantic';
import { testDataset } from './testDataset';
import type { TascoDataset } from './types';

describe('semantic retrieval', () => {
  it('scores related discovery language above unrelated text', () => {
    expect(semanticSimilarity('cafe song ao', 'quán cà phê check-in đẹp để chụp hình')).toBeGreaterThan(
      semanticSimilarity('cafe song ao', 'ATM Vietcombank gần nhất'),
    );
  });

  it('does not treat short Vietnamese prefixes as category evidence', () => {
    expect(hasStrongSemanticEvidence('ca phe gan day', 'Bệnh viện Bạch Mai cấp cứu ở Đống Đa')).toBe(false);
    expect(hasStrongSemanticEvidence('ca phe gan day', 'Quán cà phê gần đây')).toBe(true);
  });

  it('adds vector candidates from dataset evidence without a hand-authored template', () => {
    const dataset: TascoDataset = {
      ...testDataset,
      pois: [
        ...testDataset.pois,
        {
          poiId: 'POI999',
          poiName: 'Studio Sân Thượng Hội An',
          category: 'Studio ảnh',
          brand: '',
          address: '1 Trần Phú, Hội An',
          city: 'Hội An',
          latitude: 11.9404,
          longitude: 108.4583,
          rating: 4.6,
          reviewCount: 800,
          popularityScore: 89,
          tags: ['check-in', 'chụp hình', 'đẹp'],
        },
      ],
    };

    const response = suggest(dataset, { q: 'song ao', limit: 8 });

    expect(response.suggestions.map((suggestion) => suggestion.text)).toContain('Studio Sân Thượng Hội An');
    expect(response.suggestions.find((suggestion) => suggestion.text === 'Studio Sân Thượng Hội An')?.source).toBe('embedding');
  });

  it('builds a local embedding index for kNN retrieval and intent voting', () => {
    const index = buildEmbeddingIndex(testDataset);
    const neighbors = searchEmbeddingIndex('cafe lam viec wifi', index, 5);
    const intentVote = voteIntentFromNeighbors(neighbors);

    expect(index.length).toBeGreaterThan(testDataset.autocomplete.length);
    expect(neighbors[0].similarity).toBeGreaterThan(0.3);
    expect(neighbors.map((neighbor) => neighbor.document.text).join(' ').toLowerCase()).toContain('cafe');
    expect(intentVote).toEqual(
      expect.objectContaining({
        type: expect.any(String),
        confidence: expect.any(Number),
      }),
    );
  });

  it('feeds embedding candidates and diagnostics through suggest', () => {
    const dataset: TascoDataset = {
      ...testDataset,
      pois: [
        ...testDataset.pois,
        {
          poiId: 'POI998',
          poiName: 'Không Gian Sáng Tạo Hội An',
          category: 'Studio ảnh',
          brand: '',
          address: '2 Trần Phú, Hội An',
          city: 'Hội An',
          latitude: 15.8801,
          longitude: 108.338,
          rating: 4.7,
          reviewCount: 400,
          popularityScore: 81,
          tags: ['check-in', 'chụp hình', 'đẹp'],
        },
      ],
    };

    const response = suggest(dataset, { q: 'song ao', limit: 8 });

    expect(response.diagnostics.embedding?.neighbors.length).toBeGreaterThan(0);
    expect(response.suggestions.map((suggestion) => suggestion.source)).toContain('embedding');
    expect(response.suggestions.map((suggestion) => suggestion.text)).toContain('Không Gian Sáng Tạo Hội An');
  });
});
