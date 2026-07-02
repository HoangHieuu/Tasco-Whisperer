import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildDatasetFromCsvs, DATA_FILES, type DatasetCsvText } from '../src/lib/dataset';

export function loadDatasetFromDisk(root = process.cwd()) {
  const dataDir = join(root, 'data');
  const csvs = Object.fromEntries(
    Object.values(DATA_FILES).map((fileName) => [fileName, readFileSync(join(dataDir, fileName), 'utf8')]),
  ) as DatasetCsvText;
  return buildDatasetFromCsvs(csvs);
}
