# Architecture

Tasco Whisperer is an agentic Vietnamese autocomplete and query suggestion
engine for T Maps. The current implementation is a React/Vite TypeScript demo
with a deterministic TypeScript autocomplete engine, a local Node HTTP API
wrapper, and an offline public evaluation runner.

The implementation should preserve a fast deterministic autocomplete path and
keep optional agentic or LLM behavior outside the per-keystroke critical path.

## Product Shape

Implemented surfaces:

- Autocomplete API at `GET /api/suggest` through `npm run api:dev`.
- T Maps-style demo UI through `npm run dev`.
- Offline public evaluation command through `npm run eval`.

Expected future surfaces:

- Optional agentic failure-analysis and explanation tools.
- Optional agentic correction provider for low-confidence query rewrites.

Expected core domains:

- Query normalization.
- Abbreviation and typo handling.
- Intent/entity extraction.
- Candidate retrieval.
- Ranking and personalization.
- Evaluation metrics.

## Discovery Before Stack Selection

Before proposing implementation shape, identify:

- Product surfaces: browser, mobile, desktop, CLI, API, worker, or service.
- Runtime stack: language, framework, database, queues, providers, and hosting.
- Core domains: the product concepts that deserve stable names and contracts.
- Boundary inputs: user input, API requests, jobs, files, credentials, provider
  payloads, and environment configuration.
- Validation ladder: the smallest checks that can prove the selected stack.

Record stack choices in `docs/decisions/` when they meaningfully constrain
future work.

## Default Layering

```text
domain
  <- application
      <- infrastructure
          <- interface
              <- app surfaces
```

## Candidate Structure

```text
src/
  domain/
    query/
    suggestion/
    intent/
    ranking/
    personalization/

  application/
    suggest/
    evaluate/
    tune/

  infrastructure/
    csv/
    indexes/
    config/
    optional-llm/

  interface/
    api/
    demo/
    presenters/

scripts/
  eval/
  demo/
```

This is a thinking template, not a scaffold. Create real folders only when a
story enters implementation and the selected stack needs them.

## Dependency Rule

Inner layers must not depend on outer layers.

| Layer | May depend on | Must not depend on |
| --- | --- | --- |
| domain | nothing project-external except tiny pure utilities | framework, database, UI, provider, process/env |
| application | domain | framework, UI, provider, database concrete clients |
| infrastructure | domain, application | interface controllers or UI |
| interface | all backend layers | UI state or platform shell assumptions |
| app surfaces | API contracts and app-facing clients | domain internals directly |

## Parse-First Boundary Rule

Unknown data must be parsed at boundaries before it enters inner code.

Boundaries include:

- HTTP request bodies, params, and query strings.
- Environment variables.
- CSV rows and imported dataset records.
- Session or simulated user-profile payloads.
- Platform shell payloads.
- Optional provider responses.

Target flow:

```text
unknown input
  -> parser
  -> typed DTO or command
  -> application use case
  -> domain object/value object
```

Inner layers should work with meaningful product types such as `QueryPrefix`,
`Suggestion`, `Intent`, `PoiId`, `City`, `RankingScore`, and `UserProfile`,
rather than repeatedly validating raw strings.

## Command/Query Boundary

If the product has both reads and writes, keep command/query separation clear at
the code level even when the storage layer is simple:

- Commands mutate state and own personalization or tuning side effects.
- Queries read state and format suggestions for consumers.
- Shared domain rules live in domain/application, not controllers.

## Real-Time Rule

Autocomplete must remain responsive even when optional agentic features are
disabled or unavailable.

```text
keystroke
  -> deterministic normalization/retrieval/ranking
  -> suggestion response
  -> optional asynchronous explanation/tuning/failure analysis
```

Do not add a remote LLM call to the required request path unless latency proof
shows it still meets the SPEC targets and the system has a deterministic
fallback.

## Agentic Correction Rule

Use the agentic layer for low-confidence correction, not for every keystroke.

```text
keystroke
  -> deterministic autocomplete
  -> confident result: return immediately
  -> low confidence/no result:
       optional rewrite agent
       -> validate structured JSON
       -> rerun deterministic autocomplete with rewrites
       -> store accepted correction as alias memory
```

The agent may propose rewrites such as `caphe -> cà phê`, but final
suggestions still come from the deterministic retrieval and ranking engine.

Provider choices are pluggable:

- disabled deterministic-only mode
- hosted low-latency structured-output model
- optional local Hermes-class model if Vietnamese rewrite quality is proven
- offline stronger reasoner for evaluation/tuning only

Federated learning is a future privacy-preserving direction. Current hackathon
scope should use local alias memory and validated global alias promotion.

## Observability Contract

The future server should emit one canonical JSON log line per request with:

- timestamp
- level
- request_id
- user_id when a simulated or local profile is used
- action
- query
- duration_ms
- status_code
- message

Evaluation reports should also record dataset version, row counts, metric
values, and failed cases.
