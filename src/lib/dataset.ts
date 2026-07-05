import { parseCsv, parseNumber, requireColumns } from './csv';
import type {
  AbbreviationRecord,
  AutocompleteRecord,
  EvaluationCase,
  IntentType,
  PoiRecord,
  PopularQueryRecord,
  TascoDataset,
} from './types';

export const DATA_FILES = {
  abbreviations: 'ai_maps_track4_dataset_participants.xlsx - Abbreviation Dictionary.csv',
  autocomplete: 'ai_maps_track4_dataset_participants.xlsx - Autocomplete Dataset.csv',
  pois: 'ai_maps_track4_dataset_participants.xlsx - POI Dataset.csv',
  popularQueries: 'ai_maps_track4_dataset_participants.xlsx - Popular Queries.csv',
  evaluation: 'ai_maps_track4_dataset_participants.xlsx - Public Evaluation.csv',
  readme: 'ai_maps_track4_dataset_participants.xlsx - README.csv',
} as const;

export type DatasetCsvText = Record<(typeof DATA_FILES)[keyof typeof DATA_FILES], string>;

export function buildDatasetFromCsvs(csvs: DatasetCsvText): TascoDataset {
  const autocompleteRows = parseCsv(csvs[DATA_FILES.autocomplete]);
  requireColumns(DATA_FILES.autocomplete, autocompleteRows, [
    'suggestion_id',
    'input_prefix',
    'suggestion_text',
    'suggestion_type',
    'score',
    'query_frequency',
  ]);

  const poiRows = parseCsv(csvs[DATA_FILES.pois]);
  requireColumns(DATA_FILES.pois, poiRows, [
    'poi_id',
    'poi_name',
    'category',
    'brand',
    'address',
    'city',
    'latitude',
    'longitude',
    'rating',
    'review_count',
    'popularity_score',
    'tags',
  ]);

  const abbreviationRows = parseCsv(csvs[DATA_FILES.abbreviations]);
  requireColumns(DATA_FILES.abbreviations, abbreviationRows, ['abbreviation', 'expanded_form', 'type']);

  const popularRows = parseCsv(csvs[DATA_FILES.popularQueries]);
  requireColumns(DATA_FILES.popularQueries, popularRows, [
    'query_id',
    'query_text',
    'intent_type',
    'monthly_frequency',
    'region',
  ]);

  const evaluationRows = parseCsv(csvs[DATA_FILES.evaluation]);
  requireColumns(DATA_FILES.evaluation, evaluationRows, [
    'case_id',
    'input_prefix',
    'expected_suggestion_type',
    'expected_top_suggestions',
    'difficulty',
    'skills_tested',
  ]);

  return {
    autocomplete: autocompleteRows.map<AutocompleteRecord>((row) => ({
      suggestionId: row.suggestion_id,
      inputPrefix: row.input_prefix,
      suggestionText: row.suggestion_text,
      suggestionType: toIntentType(row.suggestion_type),
      score: parseNumber(DATA_FILES.autocomplete, row.suggestion_id, 'score', row.score),
      queryFrequency: parseNumber(DATA_FILES.autocomplete, row.suggestion_id, 'query_frequency', row.query_frequency),
    })),
    pois: poiRows.map<PoiRecord>((row) => ({
      poiId: row.poi_id,
      poiName: row.poi_name,
      category: row.category,
      brand: row.brand,
      address: row.address,
      city: row.city,
      latitude: parseNumber(DATA_FILES.pois, row.poi_id, 'latitude', row.latitude),
      longitude: parseNumber(DATA_FILES.pois, row.poi_id, 'longitude', row.longitude),
      rating: parseNumber(DATA_FILES.pois, row.poi_id, 'rating', row.rating),
      reviewCount: parseNumber(DATA_FILES.pois, row.poi_id, 'review_count', row.review_count),
      popularityScore: parseNumber(DATA_FILES.pois, row.poi_id, 'popularity_score', row.popularity_score),
      tags: row.tags.split(';').map((tag) => tag.trim()).filter(Boolean),
    })),
    abbreviations: abbreviationRows.map<AbbreviationRecord>((row) => ({
      abbreviation: row.abbreviation,
      expandedForm: row.expanded_form,
      type: row.type,
    })),
    popularQueries: popularRows.map<PopularQueryRecord>((row) => ({
      queryId: row.query_id,
      queryText: row.query_text,
      intentType: toIntentType(row.intent_type),
      monthlyFrequency: parseNumber(DATA_FILES.popularQueries, row.query_id, 'monthly_frequency', row.monthly_frequency),
      region: row.region,
    })),
    evaluationCases: evaluationRows.map<EvaluationCase>((row) => ({
      caseId: row.case_id,
      inputPrefix: row.input_prefix,
      expectedSuggestionType: row.expected_suggestion_type,
      expectedTopSuggestions: row.expected_top_suggestions
        .split(';')
        .map((suggestion) => suggestion.trim())
        .filter(Boolean),
      difficulty: toDifficulty(row.difficulty),
      skillsTested: row.skills_tested,
    })),
  };
}

function toIntentType(value: string): IntentType {
  const aliases: Record<string, IntentType> = {
    'Brand Suggestion': 'Brand Search',
    'Brand Suggestions': 'Brand Search',
    'Category Suggestion': 'Category Search',
    'Category Suggestions': 'Category Search',
    'Nearby Suggestion': 'Nearby Search',
    'Nearby Suggestions': 'Nearby Search',
    'POI Suggestion': 'POI Search',
    'POI Suggestions': 'POI Search',
    'Address Suggestion': 'Address Suggestion',
    'Address Suggestions': 'Address Suggestion',
  };
  return (aliases[value] ?? value) as IntentType;
}

function toDifficulty(value: string): EvaluationCase['difficulty'] {
  if (value === 'Easy' || value === 'Medium' || value === 'Hard') {
    return value;
  }
  throw new Error(`Unknown evaluation difficulty: ${value}`);
}
