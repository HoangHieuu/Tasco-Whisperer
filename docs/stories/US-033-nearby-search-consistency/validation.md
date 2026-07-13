# US-033 Nearby Search Consistency Validation

## Required Proof

| Layer | Proof |
| --- | --- |
| Unit | Multi-token segmentation and guarded semantic token matching. |
| Integration | Engine and facade exact-query regression tests. |
| Evaluation | Public, MiniLM, and robustness metrics remain acceptable. |
| E2E | Public Vercel query shows only coffee-relevant nearby suggestions. |
| Platform | Railway and Vercel production deployments are healthy. |

## Commands

```text
npm run check
npm run eval:minilm
npm run eval:robust
```

## Acceptance Evidence

- `npm run check` passed 22 test files and 135 tests, API smoke, and the
  production build.
- Public and MiniLM evaluations retained 93.3% top-1, 100% top-3/top-5,
  98.3% intent accuracy, and 0.967 MRR; MiniLM used the model artifact for all
  60 cases with zero degraded cases.
- Read-only robustness evaluation passed all 192 cases at 100% top-3/top-5,
  including 53/53 compact variants.
- Railway deployment `c2724bb6-eeb6-4eb1-b775-eb0b5356d793` is `SUCCESS` and
  `/health` returns `{"ok":true}`.
- The public facade expands `caphe gan day` to `ca phe gan day`, returns four
  coffee-only suggestions, and exposes `suggestionType: Nearby Search`.
- Vercel deployment `dpl_9ZnaEx8t4oh3BKfouXS8ENumNvKP` is `Ready` and aliased
  to `https://tasco-whisperer.vercel.app/`.
- Browser QA on the production alias showed four `Nearby Search` result cards,
  no `Bệnh viện Bạch Mai`, `8/8 TASCO APIs`, and no console errors or warnings.
