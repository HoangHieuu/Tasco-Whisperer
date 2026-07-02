# US-013 iPhone Mirroring Demo Script

## Status

implemented

## Lane

normal

## Product Contract

Provide a repeatable hackathon presentation script that connects Tasco
Whisperer to the real T Maps iOS search surface through iPhone Mirroring
without claiming native production integration.

## Relevant Product Docs

- `SPEC.md`
- `docs/product/overview.md`
- `docs/demo/iphone-mirroring-demo.md`

## Acceptance Criteria

- Script explains how to open T Maps, show the native search entry point, and
  then show Tasco Whisperer suggestions.
- Script includes at least five problem-statement examples and five harder
  dataset examples.
- Script avoids claiming production integration unless a real integration is
  implemented.
- Screenshots or recording steps are documented for final presentation.

## Design Notes

- Commands: `npm run dev -- --host 127.0.0.1 --port 5173`,
  `npm run api:dev -- --host 127.0.0.1 --port 8787`
- Queries: browser demo search input and `/api/suggest` curl example.
- API: show API readiness as integration path, not as a native iOS hook.
- UI surfaces: T Maps in iPhone Mirroring plus Tasco Whisperer browser demo.

## Validation

When updating durable proof status, use numeric booleans:
`scripts/bin/harness-cli story update --id US-013 --unit 0 --integration 0 --e2e 0 --platform 1`.

| Layer | Expected proof |
| --- | --- |
| Unit | Not applicable. |
| Integration | Not applicable. |
| E2E | Optional browser QA already covered by US-012. |
| Platform | Computer Use observation of iPhone Mirroring/T Maps and repeatable demo script. |
| Release | README links to the demo script. |

## Harness Delta

No Harness changes required. The `iphone-mirroring` tool capability is not
registered in Harness, so this story records platform proof through live
Computer Use observation and documentation.

## Evidence

- Observed iPhone Mirroring with T Maps frontmost on 2026-07-02: map-first
  screen, `Tìm kiếm` search field, category chips, and bottom tabs.
- `docs/demo/iphone-mirroring-demo.md` contains the repeatable script,
  examples, narration, recording checklist, and non-overclaim language.
