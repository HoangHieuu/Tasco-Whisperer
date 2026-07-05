import { generatedPatternCorpus } from './generatedPatterns';
import { normalizeText } from './normalize';
import type { IntentType, QueryUnderstanding, TascoDataset } from './types';

type PredictionCorpusSource = 'autocomplete' | 'popular-query' | 'poi' | 'generated-pattern';

interface PredictionPhrase {
  id: string;
  text: string;
  normalized: string;
  tokens: string[];
  type: IntentType;
  source: PredictionCorpusSource;
  frequencyScore: number;
  corpusWeight: number;
}

interface TrieNode {
  count: number;
  terminalIds: string[];
  children: Map<string, TrieNode>;
}

export interface PredictionLanguageModel {
  phrases: PredictionPhrase[];
  root: TrieNode;
  transitions: Map<string, Map<string, number>>;
}

export interface PredictedCompletion {
  id: string;
  text: string;
  type: IntentType;
  matched: string[];
  baseScore: number;
  frequencyScore: number;
  reason: string;
  confidence: number;
}

const MODEL_CACHE = new WeakMap<TascoDataset, PredictionLanguageModel>();
const MAX_QUERY_FREQUENCY = 15000;

export function predictionLanguageModel(dataset: TascoDataset): PredictionLanguageModel {
  const cached = MODEL_CACHE.get(dataset);
  if (cached) {
    return cached;
  }
  const model = trainPredictionLanguageModel(dataset);
  MODEL_CACHE.set(dataset, model);
  return model;
}

export function trainPredictionLanguageModel(dataset: TascoDataset): PredictionLanguageModel {
  const phrases = predictionCorpus(dataset);
  const root = trieNode();
  const transitions = new Map<string, Map<string, number>>();

  for (const phrase of phrases) {
    addToTrie(root, phrase);
    addTransitions(transitions, phrase.tokens);
  }

  return { phrases, root, transitions };
}

export function predictQueryCompletions(
  dataset: TascoDataset,
  understanding: QueryUnderstanding,
  limit = 12,
): PredictedCompletion[] {
  if (isSingleTokenExpansion(understanding)) {
    return [];
  }

  const model = predictionLanguageModel(dataset);
  const variants = [...new Set([understanding.expanded, understanding.normalized].map(normalizeText).filter(Boolean))];
  const ranked = new Map<string, PredictedCompletion>();

  for (const variant of variants) {
    const queryTokens = tokenize(variant);
    if (!shouldPredict(queryTokens)) {
      continue;
    }
    const compactQuery = variant.replace(/\s+/g, '');

    for (const phrase of model.phrases) {
      const alignment = prefixAlignment(queryTokens, phrase.tokens);
      const compactScore =
        queryTokens.length === 1 && compactQuery.length >= 4 && phrase.normalized.replace(/\s+/g, '').startsWith(compactQuery)
          ? Math.min(0.88, compactQuery.length / Math.max(1, phrase.normalized.replace(/\s+/g, '').length) + 0.18)
          : 0;
      const prefixScore = Math.max(alignment, compactScore);
      if (prefixScore <= 0 || phrase.normalized === variant) {
        continue;
      }

      const ngramScore = suffixNgramScore(model.transitions, queryTokens, phrase.tokens);
      const confidence = round(
        Math.min(0.96, prefixScore * 0.58 + phrase.corpusWeight * 0.18 + phrase.frequencyScore * 0.14 + ngramScore * 0.1),
      );
      if (confidence < 0.38) {
        continue;
      }

      const completion: PredictedCompletion = {
        id: `predicted:${phrase.id}`,
        text: phrase.text,
        type: phrase.type,
        matched: [variant, phrase.normalized],
        baseScore: round(Math.min(0.9, 0.55 + confidence * 0.36)),
        frequencyScore: phrase.frequencyScore,
        reason: `prefix-completion language model from ${phrase.source} corpus`,
        confidence,
      };
      const key = normalizeText(completion.text);
      const existing = ranked.get(key);
      if (!existing || completion.confidence > existing.confidence) {
        ranked.set(key, completion);
      }
    }
  }

  return [...ranked.values()]
    .sort((a, b) => b.confidence - a.confidence || b.frequencyScore - a.frequencyScore || a.text.localeCompare(b.text))
    .slice(0, limit);
}

export function serializePredictionLanguageModel(model: PredictionLanguageModel): object {
  return {
    version: 1,
    phraseCount: model.phrases.length,
    phrases: model.phrases.map(({ id, text, normalized, tokens, type, source, frequencyScore, corpusWeight }) => ({
      id,
      text,
      normalized,
      tokens,
      type,
      source,
      frequencyScore,
      corpusWeight,
    })),
  };
}

function predictionCorpus(dataset: TascoDataset): PredictionPhrase[] {
  const phrases: PredictionPhrase[] = [];

  for (const record of dataset.autocomplete) {
    phrases.push(
      phrase(
        `autocomplete-${record.suggestionId}`,
        record.suggestionText,
        record.suggestionType,
        'autocomplete',
        record.queryFrequency / MAX_QUERY_FREQUENCY,
        0.96,
      ),
    );
  }

  for (const record of dataset.popularQueries) {
    phrases.push(
      phrase(
        `popular-${record.queryId}`,
        record.queryText,
        record.intentType,
        'popular-query',
        record.monthlyFrequency / MAX_QUERY_FREQUENCY,
        0.9,
      ),
    );
  }

  for (const record of dataset.pois) {
    phrases.push(
      phrase(
        `poi-${record.poiId}`,
        record.poiName,
        inferPoiPredictionType(record.category),
        'poi',
        record.popularityScore / 100,
        0.82,
      ),
    );
  }

  generatedPatternCorpus(dataset).forEach((record, index) => {
    phrases.push(
      phrase(
        `generated-${index}`,
        record.text,
        record.type,
        'generated-pattern',
        record.frequencyScore,
        0.78,
      ),
    );
  });

  return dedupePhrases(phrases);
}

function phrase(
  id: string,
  text: string,
  type: IntentType,
  source: PredictionCorpusSource,
  frequencyScore: number,
  corpusWeight: number,
): PredictionPhrase {
  const normalized = normalizeText(text);
  return {
    id,
    text,
    normalized,
    tokens: tokenize(normalized),
    type,
    source,
    frequencyScore: clamp01(frequencyScore),
    corpusWeight,
  };
}

function addToTrie(root: TrieNode, phrase: PredictionPhrase): void {
  let node = root;
  node.count += 1;
  for (const token of phrase.tokens) {
    let child = node.children.get(token);
    if (!child) {
      child = trieNode();
      node.children.set(token, child);
    }
    child.count += 1;
    node = child;
  }
  node.terminalIds.push(phrase.id);
}

function addTransitions(transitions: Map<string, Map<string, number>>, tokens: string[]): void {
  const padded = ['<s>', '<s>', ...tokens, '</s>'];
  for (let index = 2; index < padded.length; index += 1) {
    const key = `${padded[index - 2]} ${padded[index - 1]}`;
    const next = padded[index];
    const counts = transitions.get(key) ?? new Map<string, number>();
    counts.set(next, (counts.get(next) ?? 0) + 1);
    transitions.set(key, counts);
  }
}

function prefixAlignment(queryTokens: string[], phraseTokens: string[]): number {
  if (queryTokens.length === 0 || queryTokens.length > phraseTokens.length) {
    return 0;
  }
  let score = 0;
  for (let index = 0; index < queryTokens.length; index += 1) {
    const queryToken = queryTokens[index];
    const phraseToken = phraseTokens[index];
    if (!phraseToken?.startsWith(queryToken)) {
      return 0;
    }
    const prefixRatio = queryToken.length / Math.max(1, phraseToken.length);
    score += queryToken === phraseToken ? 1 : Math.max(0.38, prefixRatio * 0.9);
  }
  const average = score / queryTokens.length;
  const completionBonus = queryTokens.length < phraseTokens.length ? 0.08 : 0;
  return Math.min(1, average + completionBonus);
}

function suffixNgramScore(transitions: Map<string, Map<string, number>>, queryTokens: string[], phraseTokens: string[]): number {
  if (queryTokens.length >= phraseTokens.length) {
    return 0.5;
  }
  const paddedPrefix = ['<s>', '<s>', ...queryTokens];
  let previousTwo = paddedPrefix.slice(-2);
  let score = 0;
  let steps = 0;
  for (const next of phraseTokens.slice(queryTokens.length, Math.min(phraseTokens.length, queryTokens.length + 4))) {
    const counts = transitions.get(`${previousTwo[0]} ${previousTwo[1]}`);
    const total = counts ? [...counts.values()].reduce((sum, value) => sum + value, 0) : 0;
    const probability = counts && total > 0 ? (counts.get(next) ?? 0) / total : 0;
    score += probability;
    steps += 1;
    previousTwo = [previousTwo[1], next];
  }
  return steps ? score / steps : 0;
}

function shouldPredict(queryTokens: string[]): boolean {
  const characterCount = queryTokens.join('').length;
  if (characterCount < 3) {
    return false;
  }
  return queryTokens.length >= 2;
}

function isSingleTokenExpansion(understanding: QueryUnderstanding): boolean {
  const normalized = normalizeText(understanding.normalized);
  const expanded = normalizeText(understanding.expanded);
  return !normalized.includes(' ') && expanded.includes(' ');
}

function dedupePhrases(phrases: PredictionPhrase[]): PredictionPhrase[] {
  const deduped = new Map<string, PredictionPhrase>();
  for (const item of phrases) {
    if (!item.normalized || item.tokens.length === 0) {
      continue;
    }
    const existing = deduped.get(item.normalized);
    const itemScore = item.frequencyScore + item.corpusWeight;
    const existingScore = existing ? existing.frequencyScore + existing.corpusWeight : -1;
    if (!existing || itemScore > existingScore) {
      deduped.set(item.normalized, item);
    }
  }
  return [...deduped.values()];
}

function inferPoiPredictionType(category: string): IntentType {
  const normalized = normalizeText(category);
  if (['atm', 'benh vien', 'cay xang'].some((term) => normalized.includes(term))) {
    return 'Nearby Search';
  }
  if (['san bay', 'ben xe', 'dai hoc'].some((term) => normalized.includes(term))) {
    return 'POI Search';
  }
  return 'POI Search';
}

function tokenize(value: string): string[] {
  return normalizeText(value).split(' ').filter(Boolean);
}

function trieNode(): TrieNode {
  return { count: 0, terminalIds: [], children: new Map<string, TrieNode>() };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
