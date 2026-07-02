import { describe, expect, it } from 'vitest';
import { expandQuery, normalizeText, stripVietnameseAccents } from './normalize';
import { testDataset } from './testDataset';

describe('Vietnamese normalization', () => {
  it('removes accents and normalizes spacing', () => {
    expect(stripVietnameseAccents('Đà Nẵng Nguyễn Huệ')).toBe('Da Nang Nguyen Hue');
    expect(normalizeText('  Cà   phê---gần đây  ')).toBe('ca phe gan day');
  });

  it('expands abbreviation dictionary entries and common aliases', () => {
    const expanded = expandQuery('ks d', testDataset.abbreviations);
    expect(expanded.expanded).toContain('khach san');
    expect(expanded.expansions).toContain('ks -> Khách sạn');
  });

  it('handles typo aliases from the evaluation set', () => {
    const expanded = expandQuery('nguyen huee', testDataset.abbreviations);
    expect(expanded.expanded).toBe('nguyen hue');
    expect(expanded.expansions).toContain('nguyen huee -> nguyễn huệ');
  });
});
