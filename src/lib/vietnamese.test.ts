import { describe, expect, it } from 'vitest';
import {
  buildVietnameseQueryKnowledge,
  decodeTelexVni,
  proposeVietnameseRewrites,
  segmentCompactQuery,
} from './vietnamese';
import { testDataset } from './testDataset';

const knowledge = buildVietnameseQueryKnowledge(testDataset);
const universityKnowledge = buildVietnameseQueryKnowledge({
  ...testDataset,
  abbreviations: [
    ...testDataset.abbreviations,
    { abbreviation: 'dh', expandedForm: 'Đại học', type: 'category' },
  ],
  pois: [
    ...testDataset.pois,
    {
      poiId: 'POI999',
      poiName: 'Trường Đại học Bách Khoa Hà Nội',
      category: 'Đại học',
      brand: '',
      address: '1 Đại Cồ Việt, Hai Bà Trưng, Hà Nội',
      city: 'Hà Nội',
      latitude: 21.0055,
      longitude: 105.8435,
      rating: 4.6,
      reviewCount: 6100,
      popularityScore: 93,
      tags: ['đại học', 'giáo dục'],
    },
  ],
});

describe('Vietnamese query intelligence', () => {
  it('segments compact Vietnamese category forms from a reusable lexicon', () => {
    expect(segmentCompactQuery('caphe', knowledge)).toBe('ca phe');
    expect(segmentCompactQuery('cayxang', knowledge)).toBe('cay xang');
    expect(segmentCompactQuery('benhvien', knowledge)).toBe('benh vien');
    expect(segmentCompactQuery('khachsan', knowledge)).toBe('khach san');
    expect(segmentCompactQuery('nhathuoc', knowledge)).toBe('nha thuoc');
  });

  it('supports compact prefixes while the user is still typing across syllables', () => {
    expect(segmentCompactQuery('cap', knowledge)).toBe('ca phe');
    expect(segmentCompactQuery('cayx', knowledge)).toBe('cay xang');
    expect(segmentCompactQuery('benhv', knowledge)).toBe('benh vien');
  });

  it('splits compact abbreviation, typo, address, and mixed-language variants into reusable query tokens', () => {
    expect(segmentCompactQuery('ksd', knowledge, testDataset.abbreviations)).toBe('ks d');
    expect(segmentCompactQuery('coffeenear', knowledge, testDataset.abbreviations)).toBe('coffee near');
    expect(segmentCompactQuery('nguyenhuee', knowledge, testDataset.abbreviations)).toBe('nguyen huee');
    expect(proposeVietnameseRewrites('nguyenhuee', knowledge, testDataset.abbreviations).map((rewrite) => rewrite.rewrite)).toContain(
      'nguyen huee',
    );
    expect(segmentCompactQuery('12nguyenhueq', knowledge, testDataset.abbreviations)).toBe('12 nguyen hue q');
    expect(
      segmentCompactQuery('dhbk', universityKnowledge, [
        ...testDataset.abbreviations,
        { abbreviation: 'dh', expandedForm: 'Đại học', type: 'category' },
      ]),
    ).toBe('dh bk');
  });

  it('does not force over-specific unknown strings into a generic rewrite', () => {
    expect(segmentCompactQuery('capherang', knowledge)).toBeUndefined();
    expect(proposeVietnameseRewrites('caphe sua da', knowledge)).toEqual([]);
  });

  it('decodes common Telex/VNI leftovers before retrieval', () => {
    expect(decodeTelexVni('huee', knowledge)).toBe('hue');
    expect(decodeTelexVni('ddong khoi', knowledge)).toBe('dong khoi');
    expect(proposeVietnameseRewrites('nguyen huee', knowledge).map((rewrite) => rewrite.rewrite)).toContain('nguyen hue');
  });
});
