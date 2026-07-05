import { describe, expect, it } from 'vitest';
import { behaviorBoostForHaystack } from './behavior';
import type { BehaviorEvent } from './types';

describe('behavior personalization', () => {
  it('uses recency and frequency when scoring prior selections', () => {
    const recent: BehaviorEvent = {
      userId: 'local-demo',
      query: 'cafe',
      selectedText: 'Highlands Coffee Nguyễn Huệ',
      selectedType: 'POI Search',
      brand: 'Highlands Coffee',
      category: 'Quán cà phê',
      city: 'TP.HCM',
      occurredAt: '2026-07-05T00:00:00.000Z',
    };
    const old = { ...recent, occurredAt: '2026-05-01T00:00:00.000Z' };
    const haystack = 'Highlands Coffee Nguyễn Huệ Quán cà phê TP.HCM';

    const recentBoost = behaviorBoostForHaystack({
      userId: 'local-demo',
      behaviorEvents: [recent, recent],
      haystack,
      now: new Date('2026-07-05T12:00:00.000Z'),
    });
    const oldBoost = behaviorBoostForHaystack({
      userId: 'local-demo',
      behaviorEvents: [old],
      haystack,
      now: new Date('2026-07-05T12:00:00.000Z'),
    });

    expect(recentBoost.boost).toBeGreaterThan(oldBoost.boost);
    expect(recentBoost.reason).toContain('Local learner');
    expect(recentBoost.matchedTerms).toEqual(expect.arrayContaining(['Highlands Coffee Nguyễn Huệ']));
  });

  it('keeps behavior evidence inside the requested city scope', () => {
    const event: BehaviorEvent = {
      userId: 'local-demo',
      query: 'ks',
      selectedText: 'Khách sạn Mường Thanh Đà Nẵng',
      selectedType: 'POI Search',
      category: 'Khách sạn',
      city: 'Đà Nẵng',
      occurredAt: '2026-07-05T00:00:00.000Z',
    };

    expect(
      behaviorBoostForHaystack({
        userId: 'local-demo',
        behaviorEvents: [event],
        requestCity: 'TP.HCM',
        haystack: 'Khách sạn Mường Thanh Đà Nẵng',
      }).boost,
    ).toBe(0);
  });
});
