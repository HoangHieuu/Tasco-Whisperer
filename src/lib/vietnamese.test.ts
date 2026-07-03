import { describe, expect, it } from 'vitest';
import {
  buildVietnameseQueryKnowledge,
  decodeTelexVni,
  proposeVietnameseRewrites,
  segmentCompactQuery,
} from './vietnamese';
import { testDataset } from './testDataset';

const knowledge = buildVietnameseQueryKnowledge(testDataset);

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
