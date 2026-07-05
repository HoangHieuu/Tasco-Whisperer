# US-017 Submission README And Example Gallery

## Status

implemented

## Lane

normal

## Product Contract

Judges should be able to understand, run, and evaluate Tasco Whisperer from the
repository without reverse-engineering the Harness history or source code. The
submission package must explain the problem, architecture, setup, demo flow,
methods, examples, personalization, intent prediction, limitations, and
synthetic-data assumptions.

## Relevant Product Docs

- `Problem.md`
- `SPEC.md`
- `README.md`
- `docs/product/overview.md`
- `docs/TEST_MATRIX.md`
- `docs/stories/backlog.md`
- `docs/submission/example-gallery.md`

## Acceptance Criteria

- README explains the problem, architecture, setup, run commands, demo flow,
  technologies, and methodology.
- README includes at least 10 example inputs and generated suggestions.
- README documents personalization and intent prediction approach.
- README documents known limitations and synthetic-data assumptions.
- Commands are provided for macOS/Linux and Windows where applicable.

## Design Notes

- Commands: documentation points to existing `npm` and Harness commands.
- Queries: example outputs are generated from the current CSV-backed
  `suggest()` engine.
- API: README keeps `/api/suggest` and TASCO facade routes visible.
- Domain rules: examples emphasize Vietnamese normalization, abbreviation
  expansion, compact syllable handling, semantic retrieval, ranking, grounded
  explanations, and personalization.
- UI surfaces: README demo flow explains the local browser demo and iPhone
  Mirroring presentation path.

## Validation

| Layer | Expected proof |
| --- | --- |
| Unit | Not required; docs-only package slice. |
| Integration | Example gallery generated from the real CSV-backed engine. |
| E2E | README/demo flow points to existing browser proof and run commands. |
| Platform | Cross-platform macOS/Linux and Windows commands are documented. |
| Release | README, example gallery, test matrix, and backlog are updated. |

## Harness Delta

Intake #16 records this as a normal spec slice for US-017.

## Evidence

- Example gallery generated with `npx tsx -e` using `buildDatasetFromCsvs()`
  over `data/*.csv` and `suggest()` from `src/lib/engine.ts`.
- `npm run check` passed 18 test files and 108 tests, evaluation top1 96.7%,
  top3/top5 100%, intent 98.3%, API smoke, and production build.
- `README.md` now includes the submission checklist, technology stack,
  architecture, methodology, personalization/intent notes, demo flow,
  limitations, and at least 10 generated examples.
- Harness story update:
  `scripts/bin/harness-cli story update --id US-017 --status implemented --unit 0 --integration 1 --e2e 0 --platform 1`.
