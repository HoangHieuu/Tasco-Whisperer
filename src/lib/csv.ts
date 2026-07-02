export type CsvRow = Record<string, string>;

export function parseCsv(csvText: string): CsvRow[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i += 1) {
    const char = csvText[i];
    const next = csvText[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      field += '"';
      i += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === ',' && !inQuotes) {
      row.push(field);
      field = '';
      continue;
    }
    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') {
        i += 1;
      }
      row.push(field);
      if (row.some((value) => value.trim().length > 0)) {
        rows.push(row);
      }
      row = [];
      field = '';
      continue;
    }
    field += char;
  }

  row.push(field);
  if (row.some((value) => value.trim().length > 0)) {
    rows.push(row);
  }

  const [headers, ...records] = rows;
  if (!headers) {
    return [];
  }
  const normalizedHeaders = headers.map((header) => header.replace(/^\uFEFF/, '').trim());
  return records.map((record) =>
    Object.fromEntries(normalizedHeaders.map((header, index) => [header, record[index]?.trim() ?? ''])),
  );
}

export function requireColumns(fileName: string, rows: CsvRow[], columns: string[]): void {
  const present = new Set(Object.keys(rows[0] ?? {}));
  const missing = columns.filter((column) => !present.has(column));
  if (missing.length > 0) {
    throw new Error(`${fileName} is missing required column(s): ${missing.join(', ')}`);
  }
}

export function parseNumber(fileName: string, rowLabel: string, field: string, value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${fileName} ${rowLabel} has invalid numeric ${field}: ${value}`);
  }
  return parsed;
}
