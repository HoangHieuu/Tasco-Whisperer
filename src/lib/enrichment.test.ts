import { describe, expect, it } from 'vitest';
import {
  deriveEnrichedAttributes,
  deriveOpeningHours,
  placeInputFromPoi,
  reconcilePlaceFields,
  vietnameseSummaryForPlace,
} from './enrichment';
import { testDataset } from './testDataset';

describe('POI enrichment', () => {
  it('derives Vietnamese summaries only from known POI fields', () => {
    const poi = testDataset.pois.find((item) => item.poiId === 'POI001');
    expect(poi).toBeDefined();

    const summary = vietnameseSummaryForPlace(placeInputFromPoi(poi!));

    expect(summary.value).toContain('Highlands Coffee Nguyễn Huệ là quán cà phê');
    expect(summary.value).toContain('86 Nguyễn Huệ, Quận 1, TP.HCM');
    expect(summary.value).toContain('điểm 4.3/5');
    expect(summary.value).toContain('wifi');
    expect(summary.provenance).toEqual(
      expect.objectContaining({
        source: 'local-derived',
        generated: true,
        verifiedRealWorld: false,
      }),
    );
    expect(summary.value).not.toContain(' is a ');
  });

  it('derives deterministic attributes and field confidence from dataset evidence', () => {
    const poi = testDataset.pois.find((item) => item.poiId === 'POI001')!;
    const place = placeInputFromPoi(poi);
    const attributes = deriveEnrichedAttributes(place);
    const hours = deriveOpeningHours(place);

    expect(attributes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'tag:wifi', label: 'Có Wi-Fi', source: 'provided-dataset' }),
        expect.objectContaining({ key: 'tag:yen-tinh', label: 'Yên tĩnh', source: 'provided-dataset' }),
        expect.objectContaining({ key: 'quality:good-rating', confidence: expect.any(Number) }),
        expect.objectContaining({ key: 'quality:many-reviews', value: 1250 }),
        expect.objectContaining({ key: 'popularity:high', value: 88 }),
      ]),
    );
    expect(hours).toEqual(
      expect.objectContaining({
        value: '07:00-22:00',
        provenance: expect.objectContaining({
          source: 'local-derived',
          confidence: expect.any(Number),
          generated: true,
        }),
      }),
    );
  });

  it('records live/local disagreements as reconciliation evidence', () => {
    const local = placeInputFromPoi(testDataset.pois[0]);
    const live = {
      ...local,
      address: 'Live upstream address',
      rating: 4.8,
    };

    const reconciliations = reconcilePlaceFields(local, live);

    expect(reconciliations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'address', winner: 'live' }),
        expect.objectContaining({ field: 'rating', winner: 'live' }),
      ]),
    );
  });
});
