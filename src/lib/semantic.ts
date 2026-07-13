import { normalizeText } from './normalize';
import { generatedPatternCorpus, type GeneratedPatternCandidate } from './generatedPatterns';
import type { AutocompleteRecord, IntentType, PoiRecord, PopularQueryRecord, TascoDataset } from './types';

export type SemanticDocument =
  | { id: string; kind: 'autocomplete'; text: string; record: AutocompleteRecord }
  | { id: string; kind: 'poi'; text: string; record: PoiRecord }
  | { id: string; kind: 'popular-query'; text: string; record: PopularQueryRecord }
  | { id: string; kind: 'generated-pattern'; text: string; record: GeneratedPatternCandidate };

export interface EmbeddingDocument {
  document: SemanticDocument;
  vector: Map<string, number>;
  intent?: IntentType;
}

export interface EmbeddingNeighbor {
  document: SemanticDocument;
  similarity: number;
  intent?: IntentType;
}

export interface EmbeddingIntentVote {
  type: IntentType;
  confidence: number;
  neighbors: Array<{ id: string; kind: SemanticDocument['kind']; similarity: number; intent?: IntentType }>;
}

export interface EmbeddingContext {
  provider: 'minilm' | 'lexical-fallback';
  model?: string;
  degraded?: boolean;
  reason?: string;
  neighbors: EmbeddingNeighbor[];
  intentVote?: EmbeddingIntentVote;
}

export interface SerializedEmbeddingDocument {
  id: string;
  kind: SemanticDocument['kind'];
  intent?: IntentType;
  vector: number[];
}

const SEMANTIC_EXPANSIONS = new Map<string, string[]>([
  ['song ao', ['check in', 'chup hinh', 'dep', 'du lich']],
  ['chup hinh', ['check in', 'song ao', 'dep']],
  ['dep', ['check in', 'song ao', 'du lich']],
  ['khuya', ['mo cua', 'an dem', '24/7']],
  ['dem', ['khuya', 'an dem', 'mo cua']],
  ['hoc', ['hoc tap', 'lam viec', 'wifi', 'yen tinh']],
  ['lam viec', ['wifi', 'yen tinh', 'hoc tap']],
  ['gan bien', ['bien', 'my khe', 'da nang']],
  ['bien', ['gan bien', 'my khe', 'du lich']],
  ['gan san bay', ['san bay', 'noi bai', 'tan son nhat']],
  ['cf', ['ca phe', 'cafe', 'coffee']],
  ['cafe', ['ca phe', 'coffee', 'quan ca phe']],
  ['hotel', ['khach san', 'gan bien', 'du lich']],
]);

export function semanticDocuments(
  dataset: TascoDataset,
  options: { includeGeneratedPatterns?: boolean } = {},
): SemanticDocument[] {
  const documents: SemanticDocument[] = [
    ...dataset.autocomplete.map((record): SemanticDocument => ({
      id: `semantic-autocomplete-${record.suggestionId}`,
      kind: 'autocomplete',
      text: `${record.inputPrefix} ${record.suggestionText} ${record.suggestionType}`,
      record,
    })),
    ...dataset.pois.map((record): SemanticDocument => ({
      id: `semantic-poi-${record.poiId}`,
      kind: 'poi',
      text: `${record.poiName} ${record.category} ${record.brand} ${record.address} ${record.city} ${record.tags.join(' ')}`,
      record,
    })),
    ...dataset.popularQueries.map((record): SemanticDocument => ({
      id: `semantic-popular-${record.queryId}`,
      kind: 'popular-query',
      text: `${record.queryText} ${record.intentType} ${record.region}`,
      record,
    })),
  ];

  if (options.includeGeneratedPatterns) {
    documents.push(
      ...generatedPatternCorpus(dataset).map((record, index): SemanticDocument => ({
        id: `semantic-generated-${index}`,
        kind: 'generated-pattern',
        text: `${record.text} ${record.type} ${record.matched.join(' ')} ${record.reason}`,
        record,
      })),
    );
  }

  return documents;
}

export function buildEmbeddingIndex(dataset: TascoDataset): EmbeddingDocument[] {
  return semanticDocuments(dataset).map((document) => ({
    document,
    vector: embedText(document.text),
    intent: intentForDocument(document),
  }));
}

export function lexicalEmbeddingContext(dataset: TascoDataset, query: string): EmbeddingContext {
  const neighbors = searchEmbeddingIndex(query, buildEmbeddingIndex(dataset), 10).filter((neighbor) => neighbor.similarity >= 0.38);
  return {
    provider: 'lexical-fallback',
    neighbors,
    intentVote: voteIntentFromNeighbors(neighbors),
  };
}

export function embedText(value: string): Map<string, number> {
  const expanded = expandSemanticText(value);
  const weights = new Map<string, number>();
  for (const token of normalizeText(expanded).split(' ').filter((item) => item.length >= 2)) {
    addWeight(weights, `tok:${token}`, token.length >= 5 ? 1.35 : 1);
  }
  for (const gram of charNgrams(expanded)) {
    addWeight(weights, `tri:${gram}`, 0.32);
  }
  return normalizeVector(weights);
}

export function searchEmbeddingIndex(query: string, index: EmbeddingDocument[], limit = 8): EmbeddingNeighbor[] {
  const queryVector = embedText(query);
  if (queryVector.size === 0) {
    return [];
  }
  return index
    .map((item) => ({
      document: item.document,
      similarity: round(cosineSimilarity(queryVector, item.vector)),
      intent: item.intent,
    }))
    .filter((neighbor) => neighbor.similarity > 0)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

export function searchSerializedEmbeddingIndex(
  dataset: TascoDataset,
  queryVector: number[],
  documents: SerializedEmbeddingDocument[],
  limit = 10,
): EmbeddingNeighbor[] {
  const byId = new Map(semanticDocuments(dataset, { includeGeneratedPatterns: true }).map((document) => [document.id, document]));
  return documents
    .flatMap((item): EmbeddingNeighbor[] => {
      const document = byId.get(item.id);
      if (!document) {
        return [];
      }
      const similarity = round(cosineArray(queryVector, item.vector));
      if (similarity <= 0) {
        return [];
      }
      const intent = item.intent ?? intentForDocument(document);
      return [{
        document,
        similarity,
        ...(intent ? { intent } : {}),
      }];
    })
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

export function voteIntentFromNeighbors(neighbors: EmbeddingNeighbor[]): EmbeddingIntentVote | undefined {
  const votes = new Map<IntentType, number>();
  for (const neighbor of neighbors.slice(0, 8)) {
    if (!neighbor.intent) {
      continue;
    }
    votes.set(neighbor.intent, (votes.get(neighbor.intent) ?? 0) + neighbor.similarity);
  }
  if (votes.size === 0) {
    return undefined;
  }
  const sorted = [...votes.entries()].sort((a, b) => b[1] - a[1]);
  const [type, score] = sorted[0];
  const total = sorted.reduce((sum, [, value]) => sum + value, 0);
  return {
    type,
    confidence: round(Math.min(0.88, Math.max(0.42, total ? score / total : 0))),
    neighbors: neighbors.slice(0, 5).map((neighbor) => ({
      id: neighbor.document.id,
      kind: neighbor.document.kind,
      similarity: neighbor.similarity,
      intent: neighbor.intent,
    })),
  };
}

export function semanticSimilarity(query: string, document: string): number {
  const expandedQuery = expandSemanticText(query);
  const expandedDocument = expandSemanticText(document);
  if (!expandedQuery || !expandedDocument) {
    return 0;
  }

  const queryTokens = tokenSet(expandedQuery);
  const documentTokens = tokenSet(expandedDocument);
  const tokenScore = weightedTokenOverlap(queryTokens, documentTokens);
  const ngramScore = diceCoefficient(charNgrams(expandedQuery), charNgrams(expandedDocument));

  return round(Math.min(1, tokenScore * 0.72 + ngramScore * 0.28));
}

export function hasStrongSemanticEvidence(query: string, document: string): boolean {
  const queryTokens = [...tokenSet(expandSemanticText(query))].filter((token) => token.length >= 3);
  const documentTokens = tokenSet(expandSemanticText(document));
  const hits = queryTokens.filter((token) => [...documentTokens].some((docToken) => semanticTokenMatches(token, docToken)));
  return hits.length >= Math.min(2, queryTokens.length);
}

export function expandSemanticText(value: string): string {
  const normalized = normalizeText(value);
  const additions: string[] = [];
  for (const [term, expansions] of SEMANTIC_EXPANSIONS) {
    if (containsPhrase(normalized, term)) {
      additions.push(...expansions);
    }
  }
  return [...new Set([normalized, ...additions.map(normalizeText)].filter(Boolean))].join(' ');
}

function weightedTokenOverlap(queryTokens: Set<string>, documentTokens: Set<string>): number {
  if (queryTokens.size === 0 || documentTokens.size === 0) {
    return 0;
  }

  let hits = 0;
  let possible = 0;
  for (const token of queryTokens) {
    if (token.length < 3) {
      continue;
    }
    possible += token.length >= 5 ? 1.25 : 1;
    if ([...documentTokens].some((docToken) => semanticTokenMatches(token, docToken))) {
      hits += token.length >= 5 ? 1.25 : 1;
    }
  }
  return possible ? hits / possible : 0;
}

function semanticTokenMatches(queryToken: string, documentToken: string): boolean {
  if (queryToken === documentToken) {
    return true;
  }
  return Math.min(queryToken.length, documentToken.length) >= 4 &&
    (documentToken.startsWith(queryToken) || queryToken.startsWith(documentToken));
}

function tokenSet(value: string): Set<string> {
  return new Set(normalizeText(value).split(' ').filter((token) => token.length >= 2));
}

function intentForDocument(document: SemanticDocument): IntentType | undefined {
  if (document.kind === 'autocomplete') {
    return document.record.suggestionType;
  }
  if (document.kind === 'popular-query') {
    return document.record.intentType;
  }
  if (document.kind === 'generated-pattern') {
    return document.record.type;
  }
  return undefined;
}

export function semanticIntentForDocument(document: SemanticDocument): IntentType | undefined {
  return intentForDocument(document);
}

function addWeight(vector: Map<string, number>, key: string, weight: number): void {
  vector.set(key, (vector.get(key) ?? 0) + weight);
}

function normalizeVector(vector: Map<string, number>): Map<string, number> {
  const norm = Math.sqrt([...vector.values()].reduce((sum, value) => sum + value * value, 0));
  if (!norm) {
    return vector;
  }
  return new Map([...vector.entries()].map(([key, value]) => [key, value / norm]));
}

function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  let score = 0;
  const [smaller, larger] = a.size < b.size ? [a, b] : [b, a];
  for (const [key, value] of smaller) {
    score += value * (larger.get(key) ?? 0);
  }
  return score;
}

function cosineArray(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length);
  if (length === 0) {
    return 0;
  }
  let dot = 0;
  let aNorm = 0;
  let bNorm = 0;
  for (let index = 0; index < length; index += 1) {
    dot += a[index] * b[index];
    aNorm += a[index] * a[index];
    bNorm += b[index] * b[index];
  }
  const denominator = Math.sqrt(aNorm) * Math.sqrt(bNorm);
  return denominator ? dot / denominator : 0;
}

function charNgrams(value: string): Set<string> {
  const compact = normalizeText(value).replace(/\s+/g, '');
  const grams = new Set<string>();
  for (let i = 0; i <= compact.length - 3; i += 1) {
    grams.add(compact.slice(i, i + 3));
  }
  return grams;
}

function diceCoefficient(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) {
    return 0;
  }
  let intersection = 0;
  for (const item of a) {
    if (b.has(item)) {
      intersection += 1;
    }
  }
  return (2 * intersection) / (a.size + b.size);
}

function containsPhrase(text: string, phrase: string): boolean {
  const normalizedText = ` ${normalizeText(text)} `;
  const normalizedPhrase = ` ${normalizeText(phrase)} `;
  return normalizedText.includes(normalizedPhrase);
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
