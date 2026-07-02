import { buildDatasetFromCsvs, DATA_FILES } from './dataset';

const rawCsvModules = import.meta.glob('../../data/*.csv', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

export const browserDataset = buildDatasetFromCsvs({
  [DATA_FILES.abbreviations]: rawCsv(DATA_FILES.abbreviations),
  [DATA_FILES.autocomplete]: rawCsv(DATA_FILES.autocomplete),
  [DATA_FILES.pois]: rawCsv(DATA_FILES.pois),
  [DATA_FILES.popularQueries]: rawCsv(DATA_FILES.popularQueries),
  [DATA_FILES.evaluation]: rawCsv(DATA_FILES.evaluation),
  [DATA_FILES.readme]: rawCsv(DATA_FILES.readme),
});

function rawCsv(fileName: string): string {
  const match = Object.entries(rawCsvModules).find(([path]) => path.endsWith(fileName));
  if (!match) {
    throw new Error(`Missing browser dataset CSV: ${fileName}`);
  }
  return match[1];
}
