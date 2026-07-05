import { normalizeText } from './normalize';
import type { ScoreFactors, Suggestion, SuggestionExplanation } from './types';

const SOURCE_LABELS: Record<Suggestion['source'], string> = {
  autocomplete: 'historical autocomplete pair',
  poi: 'POI dataset row',
  'popular-query': 'popular query trend',
  generated: 'data-derived query pattern',
  predicted: 'prefix-completion language model',
  template: 'curated semantic fallback',
  semantic: 'semantic retrieval evidence',
  embedding: 'embedding kNN neighbor',
};

const FACTOR_LABELS: Record<keyof ScoreFactors, string> = {
  lexical: 'text match',
  intent: 'intent fit',
  source: 'source reliability',
  popularity: 'popularity',
  poiQuality: 'POI quality',
  locality: 'location context',
  personalization: 'personalization',
  diversity: 'result diversity',
};

export function explainSuggestion(suggestion: Suggestion): SuggestionExplanation {
  const evidence: string[] = [];
  const fields = new Set<string>();
  const sourceLabel = SOURCE_LABELS[suggestion.source];
  const matched = suggestion.matched.filter(Boolean).slice(0, 3);
  const topFactors = topScoreFactors(suggestion.metadata.factors, 3);

  addEvidence(evidence, fields, `Source: ${sourceLabel}`, 'source');
  if (matched.length) {
    addEvidence(evidence, fields, `Matched query evidence: ${matched.join(', ')}`, 'matched');
  }
  addEvidence(evidence, fields, `Ranking reason: ${suggestion.metadata.reason}`, 'metadata.reason');

  if (suggestion.metadata.brand) {
    addEvidence(evidence, fields, `Brand: ${suggestion.metadata.brand}`, 'metadata.brand');
  }
  if (suggestion.metadata.category) {
    addEvidence(evidence, fields, `Category: ${suggestion.metadata.category}`, 'metadata.category');
  }
  if (suggestion.metadata.city) {
    addEvidence(evidence, fields, `City: ${suggestion.metadata.city}`, 'metadata.city');
  }
  if (suggestion.metadata.address) {
    addEvidence(evidence, fields, `Address: ${suggestion.metadata.address}`, 'metadata.address');
  }
  if (suggestion.metadata.personalizationReason) {
    addEvidence(evidence, fields, `Personalization: ${suggestion.metadata.personalizationReason}`, 'metadata.personalizationReason');
  }

  const enriched = suggestion.metadata.enrichedAttributes?.slice(0, 3) ?? [];
  if (enriched.length) {
    addEvidence(
      evidence,
      fields,
      `Enrichment: ${enriched.map((attribute) => `${attribute.label} (${attribute.source})`).join(', ')}`,
      'metadata.enrichedAttributes',
    );
  }

  if (topFactors.length) {
    addEvidence(
      evidence,
      fields,
      `Top score factors: ${topFactors.map((factor) => `${FACTOR_LABELS[factor.key]} ${Math.round(factor.value * 100)}%`).join(', ')}`,
      'metadata.factors',
    );
  }

  return {
    summary: summaryForSuggestion(suggestion, sourceLabel, matched, topFactors),
    evidence: evidence.slice(0, 10),
    groundedFields: [...fields],
  };
}

export function withSuggestionExplanation(suggestion: Suggestion): Suggestion {
  return {
    ...suggestion,
    metadata: {
      ...suggestion.metadata,
      explanation: explainSuggestion(suggestion),
    },
  };
}

function summaryForSuggestion(
  suggestion: Suggestion,
  sourceLabel: string,
  matched: string[],
  topFactors: Array<{ key: keyof ScoreFactors; value: number }>,
): string {
  const parts = [`${suggestion.text} is ranked from ${sourceLabel}`];
  if (matched.length) {
    parts.push(`matching ${matched.slice(0, 2).join(', ')}`);
  }
  parts.push(`as ${suggestion.type}`);
  if (topFactors.length) {
    parts.push(`with strongest signals from ${topFactors.map((factor) => FACTOR_LABELS[factor.key]).join(', ')}`);
  }
  if (suggestion.metadata.personalizationReason) {
    parts.push('and local profile evidence');
  }
  return `${parts.join(', ')}.`;
}

function topScoreFactors(factors: ScoreFactors, limit: number): Array<{ key: keyof ScoreFactors; value: number }> {
  return (Object.entries(factors) as Array<[keyof ScoreFactors, number]>)
    .filter(([, value]) => Number.isFinite(value) && value > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([key, value]) => ({ key, value }));
}

function addEvidence(evidence: string[], fields: Set<string>, line: string, field: string): void {
  const normalized = normalizeText(line);
  if (!normalized || evidence.some((item) => normalizeText(item) === normalized)) {
    return;
  }
  evidence.push(line);
  fields.add(field);
}
