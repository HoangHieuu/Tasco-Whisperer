# Agent Instructions

This repository is Tasco Whisperer: an agentic Vietnamese autocomplete and query
suggestion engine for T Maps, built for Agentic AI Build Week in Vietnam.

Before product work, read:

- `SPEC.md`
- `Problem.md`
- `docs/product/overview.md`
- `docs/TEST_MATRIX.md`
- `docs/stories/backlog.md`
- The CSV files in `data/` when the task touches ingestion, evaluation, ranking,
  or examples.

The current repo is Harness-wired but has no application implementation yet.
Do not treat the generic Harness template text as product truth when it
conflicts with `SPEC.md`.

For T Maps UX context, Computer Use with iPhone Mirroring may inspect the
opened iOS app. Do not click, type, submit, or alter app state unless the user
explicitly asks for that interaction.

<!-- HARNESS:BEGIN -->
## Harness

This repo uses Harness. Before work, read:

- `README.md`
- `docs/HARNESS.md`
- `docs/FEATURE_INTAKE.md`
- `docs/ARCHITECTURE.md`
- `docs/CONTEXT_RULES.md`
- `docs/TOOL_REGISTRY.md`
- `scripts/bin/harness-cli query matrix` on macOS/Linux, or `.\scripts\bin\harness-cli.exe query matrix` on Windows

Use the Rust Harness CLI at `scripts/bin/harness-cli` on macOS/Linux or
`scripts/bin/harness-cli.exe` on Windows as the main operational tool. Before a
step that could use an external tool, run `scripts/bin/harness-cli query tools
--capability <name> --status present` to see what is equipped; an absent
capability is a clean skip.
<!-- HARNESS:END -->
