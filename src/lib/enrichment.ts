import { normalizeText } from './normalize';
import type {
  EnrichedAttribute,
  EnrichmentSource,
  FieldProvenance,
  FieldReconciliation,
  PlaceEnrichment,
  PoiRecord,
} from './types';

export interface EnrichmentPlaceInput {
  id: string;
  name?: string;
  label: string;
  address?: string;
  category?: string;
  brand?: string;
  coordinates?: {
    lat: number;
    lon: number;
  };
  rating?: number;
  reviewCount?: number;
  popularityScore?: number;
  tags?: string[];
  openingHours?: string;
  aiSummary?: string;
}

export interface DerivedField<T> {
  value: T;
  provenance: FieldProvenance;
}

const TAG_ATTRIBUTE_LABELS: Record<string, string> = {
  '24 7': 'Mở cửa 24/7',
  'an uong': 'Ăn uống',
  'bien': 'Gần biển',
  'benh vien': 'Bệnh viện',
  'bieu tuong': 'Địa điểm biểu tượng',
  'cap cuu': 'Có cấp cứu',
  'cafe': 'Cà phê',
  'check in': 'Phù hợp check-in',
  'dat ban': 'Có đặt bàn',
  'dau xe': 'Có đậu xe',
  'dia phuong': 'Địa phương',
  'di chuyen': 'Di chuyển',
  'du lich': 'Du lịch',
  'fast food': 'Fast food',
  'gan bien': 'Gần biển',
  'gia dinh': 'Phù hợp gia đình',
  'giai tri': 'Giải trí',
  'hen ho': 'Phù hợp hẹn hò',
  'ho boi': 'Có hồ bơi',
  'khach san': 'Khách sạn',
  'lam viec': 'Phù hợp làm việc',
  'lien tinh': 'Liên tỉnh',
  'mo cua khuya': 'Mở cửa khuya',
  'mua sam': 'Mua sắm',
  'ngan hang': 'Ngân hàng',
  'nhanh': 'Nhanh',
  'nhom': 'Phù hợp nhóm',
  'o cam': 'Có ổ cắm',
  'phim': 'Rạp phim',
  'pho': 'Phở',
  'quoc te': 'Quốc tế',
  'rooftop': 'Rooftop',
  'san bay': 'Sân bay',
  'takeaway': 'Có takeaway',
  'tien loi': 'Tiện lợi',
  'toilet': 'Có toilet',
  'tre em': 'Phù hợp trẻ em',
  'view dep': 'View đẹp',
  'wifi': 'Có Wi-Fi',
  'xang': 'Cây xăng',
  'y te': 'Y tế',
  'yen tinh': 'Yên tĩnh',
};

const CATEGORY_ATTRIBUTE_LABELS: Record<string, string> = {
  'atm': 'ATM',
  'bai bien': 'Bãi biển',
  'ben xe': 'Bến xe',
  'benh vien': 'Bệnh viện',
  'cay xang': 'Cây xăng',
  'cho': 'Chợ',
  'dai hoc': 'Đại học',
  'khach san': 'Khách sạn',
  'nha hang': 'Nhà hàng',
  'quan bar': 'Quán bar',
  'quan ca phe': 'Quán cà phê',
  'rap chieu phim': 'Rạp chiếu phim',
  'san bay': 'Sân bay',
  'trung tam thuong mai': 'Trung tâm thương mại',
};

export function placeInputFromPoi(poi: PoiRecord): EnrichmentPlaceInput {
  return {
    id: `poi:${poi.poiId}`,
    name: poi.poiName,
    label: poi.poiName,
    address: poi.address,
    category: poi.category,
    brand: poi.brand || undefined,
    coordinates: { lat: poi.latitude, lon: poi.longitude },
    rating: poi.rating,
    reviewCount: poi.reviewCount,
    popularityScore: poi.popularityScore,
    tags: poi.tags,
  };
}

export function buildPlaceEnrichment(
  place: EnrichmentPlaceInput,
  source: EnrichmentSource,
  reconciliations: FieldReconciliation[] = [],
): PlaceEnrichment {
  return {
    fields: buildKnownFieldProvenance(place, source),
    attributes: deriveEnrichedAttributes(place),
    reconciliations,
    summaryEvidence: summaryEvidence(place),
  };
}

export function buildKnownFieldProvenance(
  place: EnrichmentPlaceInput,
  source: EnrichmentSource,
): Record<string, FieldProvenance> {
  const fields: Record<string, FieldProvenance> = {};
  const direct = (field: string, evidence: string[]) => {
    fields[field] = provenance(source, source === 'live-upstream' ? 0.88 : 0.86, evidence, false, source === 'live-upstream');
  };

  if (place.id) direct('id', ['stable POI identifier']);
  if (place.name || place.label) direct('name', ['POI name']);
  if (place.address) direct('address', ['POI address']);
  if (place.category) direct('category', ['POI category']);
  if (place.brand) direct('brand', ['POI brand']);
  if (place.coordinates) direct('coordinates', ['WGS84 latitude/longitude']);
  if (typeof place.rating === 'number') direct('rating', ['POI rating']);
  if (typeof place.reviewCount === 'number') direct('reviewCount', ['POI review_count']);
  if (typeof place.popularityScore === 'number') direct('popularityScore', ['POI popularity_score']);
  if (place.tags?.length) direct('tags', ['POI tags']);
  if (place.openingHours) direct('openingHours', ['upstream opening hours']);
  if (place.aiSummary) direct('aiSummary', ['upstream summary']);

  return fields;
}

export function deriveOpeningHours(place: EnrichmentPlaceInput): DerivedField<string> {
  const haystack = normalizeText(`${place.category ?? ''} ${(place.tags ?? []).join(' ')}`);
  const evidence = [`category=${place.category ?? 'unknown'}`];
  if (place.tags?.length) evidence.push(`tags=${place.tags.join(';')}`);

  if (containsAny(haystack, ['24 7', 'atm', 'cay xang', 'benh vien', 'cap cuu', 'hospital', 'gas'])) {
    return {
      value: '00:00-24:00',
      provenance: provenance('local-derived', 0.68, evidence, true, false, 'Heuristic from category/tags, not verified hours.'),
    };
  }
  if (containsAny(haystack, ['quan ca phe', 'cafe', 'coffee', 'nha hang', 'pho', 'fast food'])) {
    return {
      value: '07:00-22:00',
      provenance: provenance('local-derived', 0.58, evidence, true, false, 'Heuristic from category/tags, not verified hours.'),
    };
  }
  if (containsAny(haystack, ['khach san', 'hotel', 'san bay', 'ben xe'])) {
    return {
      value: '00:00-24:00',
      provenance: provenance('local-derived', 0.6, evidence, true, false, 'Heuristic from category/tags, not verified hours.'),
    };
  }
  return {
    value: '09:00-22:00',
    provenance: provenance('local-derived', 0.48, evidence, true, false, 'Default local heuristic, not verified hours.'),
  };
}

export function vietnameseSummaryForPlace(place: EnrichmentPlaceInput): DerivedField<string> {
  const parts = [`${place.label} là ${lowerFirst(place.category ?? 'một địa điểm')}`];
  if (place.address) parts.push(`tại ${place.address}`);

  const metrics: string[] = [];
  if (typeof place.rating === 'number') metrics.push(`điểm ${formatNumber(place.rating)}/5`);
  if (typeof place.reviewCount === 'number') metrics.push(`${formatInteger(place.reviewCount)} lượt đánh giá`);
  if (typeof place.popularityScore === 'number') metrics.push(`độ phổ biến ${formatInteger(place.popularityScore)}/100`);

  const tagText = place.tags?.slice(0, 4).join(', ');
  const summary = [
    `${parts.join(' ')}.`,
    metrics.length ? `Dữ liệu hackathon ghi nhận ${metrics.join(', ')}.` : '',
    tagText ? `Thuộc tính nổi bật: ${tagText}.` : '',
  ]
    .filter(Boolean)
    .join(' ');

  return {
    value: summary,
    provenance: provenance(
      'local-derived',
      0.78,
      summaryEvidence(place),
      true,
      false,
      'Generated from known dataset fields only.',
    ),
  };
}

export function deriveEnrichedAttributes(place: EnrichmentPlaceInput): EnrichedAttribute[] {
  const attributes: EnrichedAttribute[] = [];
  const seen = new Set<string>();
  const add = (attribute: EnrichedAttribute) => {
    if (seen.has(attribute.key)) return;
    seen.add(attribute.key);
    attributes.push(attribute);
  };

  const categoryKey = normalizeText(place.category ?? '');
  if (categoryKey) {
    add({
      key: `category:${categoryKey.replace(/\s+/g, '-')}`,
      label: CATEGORY_ATTRIBUTE_LABELS[categoryKey] ?? place.category ?? 'Danh mục',
      value: place.category,
      source: 'provided-dataset',
      confidence: 0.86,
      evidence: [`category=${place.category}`],
    });
  }

  for (const tag of place.tags ?? []) {
    const key = normalizeText(tag);
    const label = TAG_ATTRIBUTE_LABELS[key] ?? tag;
    add({
      key: `tag:${key.replace(/[^a-z0-9]+/g, '-')}`,
      label,
      value: tag,
      source: 'provided-dataset',
      confidence: 0.84,
      evidence: [`tag=${tag}`],
    });
  }

  if (typeof place.rating === 'number') {
    if (place.rating >= 4.5) {
      add({
        key: 'quality:high-rating',
        label: 'Đánh giá rất tốt',
        value: place.rating,
        source: 'local-derived',
        confidence: 0.82,
        evidence: [`rating=${formatNumber(place.rating)}`],
      });
    } else if (place.rating >= 4) {
      add({
        key: 'quality:good-rating',
        label: 'Đánh giá tốt',
        value: place.rating,
        source: 'local-derived',
        confidence: 0.78,
        evidence: [`rating=${formatNumber(place.rating)}`],
      });
    }
  }

  if (typeof place.reviewCount === 'number' && place.reviewCount >= 1000) {
    add({
      key: 'quality:many-reviews',
      label: 'Nhiều lượt đánh giá',
      value: place.reviewCount,
      source: 'local-derived',
      confidence: 0.8,
      evidence: [`review_count=${formatInteger(place.reviewCount)}`],
    });
  }

  if (typeof place.popularityScore === 'number') {
    if (place.popularityScore >= 90) {
      add({
        key: 'popularity:very-high',
        label: 'Rất phổ biến',
        value: place.popularityScore,
        source: 'local-derived',
        confidence: 0.83,
        evidence: [`popularity_score=${formatInteger(place.popularityScore)}`],
      });
    } else if (place.popularityScore >= 75) {
      add({
        key: 'popularity:high',
        label: 'Phổ biến',
        value: place.popularityScore,
        source: 'local-derived',
        confidence: 0.77,
        evidence: [`popularity_score=${formatInteger(place.popularityScore)}`],
      });
    }
  }

  return attributes;
}

export function rankingEvidenceForPoi(poi: PoiRecord, maxItems = 6): EnrichedAttribute[] {
  const priority = ['tag:wifi', 'tag:gan-bien', 'tag:24-7', 'tag:yen-tinh', 'tag:lam-viec', 'quality:', 'popularity:'];
  return deriveEnrichedAttributes(placeInputFromPoi(poi))
    .sort((a, b) => attributePriority(a.key, priority) - attributePriority(b.key, priority) || b.confidence - a.confidence)
    .slice(0, maxItems);
}

export function reconcilePlaceFields(
  localPlace: EnrichmentPlaceInput | undefined,
  livePlace: EnrichmentPlaceInput | undefined,
): FieldReconciliation[] {
  if (!localPlace || !livePlace) return [];

  const fields: Array<keyof EnrichmentPlaceInput> = [
    'label',
    'address',
    'category',
    'brand',
    'coordinates',
    'rating',
    'reviewCount',
    'popularityScore',
    'tags',
    'openingHours',
    'aiSummary',
  ];

  return fields.flatMap((field) => {
    const localValue = localPlace[field];
    const liveValue = livePlace[field];
    if (localValue == null || liveValue == null || equivalentValue(localValue, liveValue)) {
      return [];
    }
    return [
      {
        field,
        localValue,
        liveValue,
        winner: 'live' as const,
        confidence: 0.82,
        reason: 'Live upstream value is preserved; local dataset value is retained as fallback evidence.',
      },
    ];
  });
}

export function provenance(
  source: EnrichmentSource,
  confidence: number,
  evidence: string[],
  generated: boolean,
  verifiedRealWorld: boolean,
  note?: string,
): FieldProvenance {
  return {
    source,
    confidence: roundConfidence(confidence),
    evidence,
    generated,
    verifiedRealWorld,
    note,
  };
}

export function summaryEvidence(place: EnrichmentPlaceInput): string[] {
  const evidence = ['label', 'category'].filter((field) => Boolean((place as unknown as Record<string, unknown>)[field]));
  if (place.address) evidence.push('address');
  if (typeof place.rating === 'number') evidence.push('rating');
  if (typeof place.reviewCount === 'number') evidence.push('reviewCount');
  if (typeof place.popularityScore === 'number') evidence.push('popularityScore');
  if (place.tags?.length) evidence.push('tags');
  return evidence;
}

function containsAny(value: string, needles: string[]): boolean {
  return needles.some((needle) => value.includes(needle));
}

function lowerFirst(value: string): string {
  if (!value) return value;
  return value.charAt(0).toLocaleLowerCase('vi-VN') + value.slice(1);
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatInteger(value: number): string {
  return Math.round(value).toLocaleString('vi-VN');
}

function roundConfidence(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 1000) / 1000;
}

function attributePriority(key: string, priority: string[]): number {
  const index = priority.findIndex((candidate) => key.startsWith(candidate));
  return index >= 0 ? index : priority.length;
}

function equivalentValue(left: unknown, right: unknown): boolean {
  if (typeof left === 'string' && typeof right === 'string') {
    return normalizeText(left) === normalizeText(right);
  }
  if (typeof left === 'number' && typeof right === 'number') {
    return Math.abs(left - right) < 0.000001;
  }
  return normalizeComparable(left) === normalizeComparable(right);
}

function normalizeComparable(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeComparable(item)).sort().join('|');
  }
  if (value && typeof value === 'object') {
    return JSON.stringify(
      Object.fromEntries(
        Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, item]) => [key, normalizeComparable(item)]),
      ),
    );
  }
  return normalizeText(String(value));
}
