import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildPlaceEnrichment,
  deriveOpeningHours,
  placeInputFromPoi,
  vietnameseSummaryForPlace,
} from '../src/lib/enrichment';
import type { EnrichmentSource } from '../src/lib/types';
import { loadDatasetFromDisk } from './loadDataset';

interface EnrichmentCoverageRow {
  poiId: string;
  label: string;
  fieldCount: number;
  attributeCount: number;
  hasVietnameseSummary: boolean;
  hasOpeningHours: boolean;
  summaryConfidence: number;
  openingHoursConfidence: number;
  sources: EnrichmentSource[];
}

const dataset = loadDatasetFromDisk();
const rows: EnrichmentCoverageRow[] = dataset.pois.map((poi) => {
  const place = placeInputFromPoi(poi);
  const enrichment = buildPlaceEnrichment(place, 'provided-dataset');
  const summary = vietnameseSummaryForPlace(place);
  const hours = deriveOpeningHours(place);
  const sources = new Set<EnrichmentSource>([
    ...Object.values(enrichment.fields).map((field) => field.source),
    ...enrichment.attributes.map((attribute) => attribute.source),
    summary.provenance.source,
    hours.provenance.source,
  ]);

  return {
    poiId: poi.poiId,
    label: poi.poiName,
    fieldCount: Object.keys(enrichment.fields).length + 2,
    attributeCount: enrichment.attributes.length,
    hasVietnameseSummary: hasVietnameseEvidenceSummary(summary.value),
    hasOpeningHours: Boolean(hours.value),
    summaryConfidence: summary.provenance.confidence,
    openingHoursConfidence: hours.provenance.confidence,
    sources: [...sources].sort(),
  };
});

const sourceCounts = rows.reduce<Record<string, number>>((counts, row) => {
  for (const source of row.sources) {
    counts[source] = (counts[source] ?? 0) + 1;
  }
  return counts;
}, {});

const report = {
  generatedAt: new Date().toISOString(),
  dataset: {
    pois: dataset.pois.length,
    note: 'Uses only provided hackathon CSV fields; no outside POI or enrichment corpus is imported.',
  },
  coverage: {
    poiRows: rows.length,
    vietnameseSummaryRows: rows.filter((row) => row.hasVietnameseSummary).length,
    openingHoursRows: rows.filter((row) => row.hasOpeningHours).length,
    minAttributeCount: Math.min(...rows.map((row) => row.attributeCount)),
    averageAttributeCount: round(rows.reduce((sum, row) => sum + row.attributeCount, 0) / rows.length),
    minSummaryConfidence: Math.min(...rows.map((row) => row.summaryConfidence)),
    minOpeningHoursConfidence: Math.min(...rows.map((row) => row.openingHoursConfidence)),
    sourceCounts,
  },
  weakestRows: [...rows]
    .sort((a, b) => a.attributeCount - b.attributeCount || a.summaryConfidence - b.summaryConfidence)
    .slice(0, 10),
};

const reportDir = join(process.cwd(), 'reports', 'enrichment');
mkdirSync(reportDir, { recursive: true });
writeFileSync(join(reportDir, 'latest.json'), `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(join(reportDir, 'latest.md'), markdown(report));

console.log(
  `Enrichment coverage: ${report.coverage.vietnameseSummaryRows}/${report.coverage.poiRows} summaries, ` +
    `${report.coverage.openingHoursRows}/${report.coverage.poiRows} hours, ` +
    `${report.coverage.averageAttributeCount} avg attributes.`,
);

function hasVietnameseEvidenceSummary(value: string): boolean {
  return value.includes(' là ') && value.includes('Dữ liệu hackathon') && !value.includes(' is a ');
}

function markdown(value: typeof report): string {
  const sourceLines = Object.entries(value.coverage.sourceCounts)
    .map(([source, count]) => `- ${source}: ${count}`)
    .join('\n');
  const weakRows = value.weakestRows
    .map((row) => `| ${row.poiId} | ${row.label} | ${row.attributeCount} | ${row.summaryConfidence} | ${row.openingHoursConfidence} |`)
    .join('\n');

  return `# Enrichment Coverage Report

Generated at: ${value.generatedAt}

Dataset note: ${value.dataset.note}

## Coverage

- POI rows: ${value.coverage.poiRows}
- Vietnamese evidence-based summaries: ${value.coverage.vietnameseSummaryRows}/${value.coverage.poiRows}
- Derived opening-hours rows: ${value.coverage.openingHoursRows}/${value.coverage.poiRows}
- Average deterministic attributes per POI: ${value.coverage.averageAttributeCount}
- Minimum deterministic attributes per POI: ${value.coverage.minAttributeCount}
- Minimum summary confidence: ${value.coverage.minSummaryConfidence}
- Minimum opening-hours confidence: ${value.coverage.minOpeningHoursConfidence}

## Source Counts

${sourceLines}

## Weakest Rows

| POI | Label | Attributes | Summary confidence | Hours confidence |
| --- | --- | ---: | ---: | ---: |
${weakRows}
`;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
