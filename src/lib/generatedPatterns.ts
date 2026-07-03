import { normalizeText } from './normalize';
import type { IntentType, QueryEntity, QueryUnderstanding, TascoDataset } from './types';

export interface GeneratedPatternCandidate {
  id: string;
  text: string;
  type: IntentType;
  matched: string[];
  baseScore: number;
  frequencyScore: number;
  reason: string;
  entityBoost?: number;
}

interface CategorySignal {
  key: string;
  label: string;
  type: IntentType;
  aliases: string[];
}

interface AttributeSignal {
  key: string;
  label: string;
  type: IntentType;
  aliases: string[];
}

interface CitySignal {
  key: string;
  label: string;
  aliases: string[];
}

const CATEGORY_LEXICON: CategorySignal[] = [
  category('cafe', 'Quán cà phê', 'Category Search', ['cafe', 'coffee', 'cf', 'ca phe', 'quan ca phe']),
  category('hotel', 'Khách sạn', 'Category Search', ['hotel', 'ks', 'khach san']),
  category('atm', 'ATM', 'Nearby Search', ['atm', 'cash machine']),
  category('hospital', 'Bệnh viện', 'Nearby Search', ['bv', 'benh vien', 'hospital']),
  category('gas', 'Cây xăng', 'Nearby Search', ['cay xang', 'tram xang', 'xang', 'gas station']),
  category('restaurant', 'Nhà hàng', 'Category Search', ['nha hang', 'restaurant']),
  category('eatery', 'Quán ăn', 'Category Search', ['quan an', 'food']),
  category('market', 'Chợ', 'Category Search', ['cho', 'market']),
  category('supermarket', 'Siêu thị', 'Category Search', ['sieu thi', 'supermarket']),
  category('cinema', 'Rạp chiếu phim', 'Category Search', ['rap phim', 'cinema', 'movie']),
  category('airport', 'Sân bay', 'POI Search', ['san bay', 'airport']),
  category('bus-station', 'Bến xe', 'POI Search', ['ben xe', 'bus station']),
  category('university', 'Đại học', 'POI Search', ['dai hoc', 'dh', 'university']),
  category('academy', 'Học viện', 'Category Search', ['hoc vien', 'academy']),
  category('pharmacy', 'Nhà thuốc', 'Category Search', ['nha thuoc', 'pharmacy']),
  category('repair', 'Tiệm sửa xe', 'Category Search', ['sua xe', 'tiem sua xe']),
  category('garage', 'Garage ô tô', 'Category Search', ['garage', 'gara', 'oto', 'o to']),
  category('spa', 'Spa', 'Category Search', ['spa']),
  category('gym', 'Phòng gym', 'Category Search', ['gym', 'phong gym']),
  category('milk-tea', 'Trà sữa', 'Category Search', ['tra sua', 'milk tea']),
];

const ATTRIBUTE_LEXICON: AttributeSignal[] = [
  attribute('nearby', 'gần đây', 'Nearby Search', ['gan day', 'gan nhat', 'near', 'near me']),
  attribute('open-24h', 'mở cửa 24/7', 'Discovery Search', ['24/7', '24h', 'mo cua', 'open now']),
  attribute('wifi', 'có Wi-Fi', 'Attribute Search', ['wifi', 'wi fi']),
  attribute('quiet', 'yên tĩnh', 'Discovery Search', ['yen tinh', 'quiet']),
  attribute('work-study', 'phù hợp học tập', 'Discovery Search', ['hoc tap', 'lam viec', 'study', 'work']),
  attribute('beach', 'gần biển', 'Discovery Search', ['gan bien', 'near beach', 'beach', 'my khe']),
  attribute('airport', 'gần sân bay', 'Nearby Search', ['gan san bay', 'near airport', 'noi bai', 'tan son nhat']),
  attribute('late-night', 'mở cửa khuya', 'Discovery Search', ['khuya', 'an dem', 'late night']),
  attribute('check-in', 'đẹp để check-in', 'Discovery Search', ['check in', 'song ao', 'chup hinh']),
  attribute('family', 'phù hợp cho trẻ em', 'Discovery Search', ['tre em', 'family', 'kid']),
  attribute('vegetarian', 'chay', 'Category Search', ['chay', 'vegetarian']),
  attribute('halal', 'halal', 'Category Search', ['halal']),
  attribute('rooftop', 'rooftop', 'Discovery Search', ['rooftop', 'view']),
  attribute('on-route', 'trên đường đi', 'Discovery Search', ['tren duong', 'duong di', 'on route']),
];

export function generatedPatternCandidates(
  dataset: TascoDataset,
  understanding: QueryUnderstanding,
  entities: QueryEntity[],
): GeneratedPatternCandidate[] {
  const query = [understanding.normalized, understanding.expanded].filter(Boolean).join(' ');
  if (!query || query.length < 3) {
    return [];
  }

  const categories = detectCategories(dataset, query, entities);
  const detectedAttributes = detectAttributes(query, entities);
  const attributes = detectedAttributes.some((item) => item.key !== 'nearby')
    ? detectedAttributes.filter((item) => item.key !== 'nearby')
    : detectedAttributes;
  const cities = detectCities(dataset, query, entities);
  const brands = entities.filter((entity) => entity.kind === 'brand').map((entity) => entity.value);
  const candidates: GeneratedPatternCandidate[] = [];

  for (const categorySignal of categories) {
    for (const city of cities) {
      candidates.push(candidate(`${categorySignal.label} ${city.label}`, categorySignal.type, categorySignal, city, undefined, 0.72));
    }

    for (const attributeSignal of attributes) {
      const targetCities = cities.length ? cities : [undefined];
      for (const city of targetCities) {
        for (const text of renderCategoryAttribute(categorySignal, attributeSignal, city)) {
        candidates.push(candidate(text, attributeSignal.type, categorySignal, city, attributeSignal, attributeSignal.key === 'nearby' ? 0.7 : 0.8));
        }
      }
    }

    if (brands.length) {
      for (const brand of brands) {
        candidates.push({
          id: stableId(`brand-${categorySignal.key}-${brand}`),
          text: `${categorySignal.label} ${brand} gần nhất`,
          type: categorySignal.type === 'Category Search' ? 'Nearby Search' : categorySignal.type,
          matched: [categorySignal.label, brand],
          baseScore: 0.84,
          frequencyScore: 0.78,
          reason: 'data-derived category plus brand phrase',
          entityBoost: 0.34,
        });
      }
    }
  }

  return dedupe(candidates).slice(0, 18);
}

function detectCategories(dataset: TascoDataset, query: string, entities: QueryEntity[]): CategorySignal[] {
  const entityCategories = entities
    .filter((entity) => entity.kind === 'category')
    .map((entity) => normalizeText(entity.value));
  const datasetCategories = [...new Set(dataset.pois.map((poi) => poi.category).filter(Boolean))]
    .map((label) => category(normalizeText(label), label, inferCategoryType(label), [label]));
  return [...CATEGORY_LEXICON, ...datasetCategories]
    .filter((item) => entityCategories.includes(normalizeText(item.label)) || item.aliases.some((alias) => phraseEvidence(query, alias)))
    .filter((item, index, all) => all.findIndex((other) => other.key === item.key) === index);
}

function detectAttributes(query: string, entities: QueryEntity[]): AttributeSignal[] {
  const entityAttributes = entities
    .filter((entity) => entity.kind === 'attribute' || entity.kind === 'proximity')
    .map((entity) => normalizeText(entity.value));
  return ATTRIBUTE_LEXICON.filter(
    (item) => entityAttributes.includes(normalizeText(item.label)) || item.aliases.some((alias) => phraseEvidence(query, alias)),
  );
}

function detectCities(dataset: TascoDataset, query: string, entities: QueryEntity[]): CitySignal[] {
  const entityCities = entities.filter((entity) => entity.kind === 'city').map((entity) => normalizeText(entity.value));
  const abbreviationCities = dataset.abbreviations.filter((item) => item.type === 'city');
  const citySignals = [...new Set(dataset.pois.map((poi) => poi.city).filter(Boolean))].map((label): CitySignal => {
    const aliases = [label, normalizeText(label).replace(/\s+/g, '')];
    for (const item of abbreviationCities) {
      if (normalizeText(item.expandedForm) === normalizeText(label)) {
        aliases.push(item.abbreviation);
      }
    }
    if (normalizeText(label).includes('da nang')) aliases.push('danang');
    if (normalizeText(label).includes('ho chi minh')) aliases.push('hcm', 'tp hcm');
    return { key: normalizeText(label), label, aliases };
  });
  return citySignals.filter(
    (item) => entityCities.includes(normalizeText(item.label)) || item.aliases.some((alias) => phraseEvidence(query, alias)),
  );
}

function renderCategoryAttribute(categorySignal: CategorySignal, attributeSignal: AttributeSignal, city?: CitySignal): string[] {
  const categoryLabel = categorySignal.label;
  const cityLabel = city?.label;
  const suffix = cityLabel ? ` ${cityLabel}` : '';

  if (attributeSignal.key === 'nearby') return [`${categoryLabel} gần đây${suffix}`];
  if (attributeSignal.key === 'wifi') return [`${categoryLabel} có Wi-Fi${suffix}`];
  if (attributeSignal.key === 'work-study' && categorySignal.key === 'cafe') {
    return [`Cà phê làm việc${suffix}`, `${categoryLabel} có Wi-Fi${suffix}`, `${categoryLabel} phù hợp học tập${suffix}`];
  }
  if (attributeSignal.key === 'work-study') return [`${categoryLabel} phù hợp học tập${suffix}`, `${categoryLabel} làm việc${suffix}`];
  if (attributeSignal.key === 'beach' && cityLabel) return [`${categoryLabel} gần biển ${cityLabel}`, `${categoryLabel} ${cityLabel} gần biển`];
  if (attributeSignal.key === 'airport') return [`${categoryLabel} gần sân bay${suffix}`];
  if (attributeSignal.key === 'on-route') return [`${categoryLabel} trên đường đi${suffix}`];
  if (['vegetarian', 'halal', 'rooftop'].includes(attributeSignal.key)) return [`${categoryLabel} ${attributeSignal.label}${suffix}`];
  return [`${categoryLabel} ${attributeSignal.label}${suffix}`];
}

function candidate(
  text: string,
  type: IntentType,
  categorySignal: CategorySignal,
  city: CitySignal | undefined,
  attributeSignal: AttributeSignal | undefined,
  frequencyScore: number,
): GeneratedPatternCandidate {
  return {
    id: stableId(`${categorySignal.key}-${attributeSignal?.key ?? 'category'}-${city?.key ?? 'global'}-${text}`),
    text,
    type,
    matched: [categorySignal.label, attributeSignal?.label, city?.label].filter((item): item is string => Boolean(item)),
    baseScore: attributeSignal ? 0.86 : 0.8,
    frequencyScore,
    reason: attributeSignal ? 'data-derived category, attribute, and location phrase' : 'data-derived category and location phrase',
    entityBoost: attributeSignal ? 0.36 : 0.2,
  };
}

function category(key: string, label: string, type: IntentType, aliases: string[]): CategorySignal {
  return { key: normalizeText(key), label, type, aliases };
}

function attribute(key: string, label: string, type: IntentType, aliases: string[]): AttributeSignal {
  return { key, label, type, aliases };
}

function inferCategoryType(label: string): IntentType {
  const normalized = normalizeText(label);
  if (['atm', 'benh vien', 'cay xang', 'tram xang'].some((value) => normalized.includes(value))) {
    return 'Nearby Search';
  }
  if (['san bay', 'ben xe', 'dai hoc'].some((value) => normalized.includes(value))) {
    return 'POI Search';
  }
  return 'Category Search';
}

function phraseEvidence(query: string, phrase: string): boolean {
  const normalizedQuery = ` ${normalizeText(query)} `;
  const normalizedPhrase = normalizeText(phrase);
  if (!normalizedPhrase) {
    return false;
  }
  if (normalizedQuery.includes(` ${normalizedPhrase} `)) {
    return true;
  }
  const rawPhraseTokens = normalizedPhrase.split(' ').filter(Boolean);
  const phraseTokens = rawPhraseTokens.length > 1 ? rawPhraseTokens.filter((token) => token.length >= 2) : rawPhraseTokens;
  if (phraseTokens.length === 0 || phraseTokens.some((token) => token.length < 3 && rawPhraseTokens.length === 1)) {
    return false;
  }
  const queryTokens = normalizedQuery.trim().split(' ').filter(Boolean);
  return phraseTokens.every((token) =>
    queryTokens.some((queryToken) => {
      if (token.length < 3) {
        return queryToken === token;
      }
      return queryToken.startsWith(token) || (queryToken.length >= 3 && token.startsWith(queryToken));
    }),
  );
}

function dedupe(candidates: GeneratedPatternCandidate[]): GeneratedPatternCandidate[] {
  const seen = new Map<string, GeneratedPatternCandidate>();
  for (const item of candidates) {
    const key = normalizeText(item.text);
    const existing = seen.get(key);
    if (!existing || item.baseScore + item.frequencyScore > existing.baseScore + existing.frequencyScore) {
      seen.set(key, item);
    }
  }
  return [...seen.values()];
}

function stableId(value: string): string {
  return `generated:${normalizeText(value).replace(/\s+/g, '-')}`;
}
