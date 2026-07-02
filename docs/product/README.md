# Product Docs

This directory now belongs to Tasco Whisperer, an agentic Vietnamese
autocomplete and query suggestion engine for T Maps.

Start with:

- `SPEC.md`: complete product specification, phases, user stories, acceptance
  criteria, validation targets, and tool strategy.
- `docs/product/overview.md`: short product contract for future implementation
  work.
- `docs/stories/backlog.md`: candidate epics and story IDs.
- `docs/TEST_MATRIX.md`: behavior-to-proof matrix.

## Update Rule

When behavior changes:

1. Update the affected product doc.
2. Update or create the story packet.
3. Update durable proof status with `scripts/bin/harness-cli story add` or
   `scripts/bin/harness-cli story update`.
4. Record a decision if the change affects architecture, scope, risk, or a
   previously settled product rule.
