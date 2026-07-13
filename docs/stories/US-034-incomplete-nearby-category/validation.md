# US-034 Incomplete Nearby Category Validation

## Test Plan

| Layer | Proof |
| --- | --- |
| Unit | `caphe gan` and `ca phe gan` complete to `ca phe gan day`. |
| Integration | Engine and facade return category-consistent city POIs. |
| Evaluation | Public, MiniLM, and robustness metrics do not regress. |
| E2E | Production UI renders completed understanding and scoped POIs. |
| Platform | Railway and Vercel deployments reach healthy state. |

## Current Evidence

- `npm run check` passes 22 test files and 139 tests.
- Public evaluation remains 93.3% top-1, 100% top-3/top-5, 98.3% intent,
  and 0.967 MRR.
- MiniLM evaluation matches those metrics for all 60 cases with zero degraded
  cases.
- Read-only robustness proof passes all 192 cases at 100% top-3/top-5,
  including 53/53 compact cases.
- Railway deployment `7fa1fc1f-ae7f-405a-a062-fbeacfae7194` is `SUCCESS` and
  the exact public API query returns 11 rows: two generic completions and all
  nine mock coffee POIs, all typed `Nearby Search`.
- Vercel deployment `dpl_EYz26uPLYJZGi6y2RNksuvQQb6tc` is `Ready` and aliased
  to `https://tasco-whisperer.vercel.app/`.
- Production browser QA confirms the Any-city UI renders all 11 rows and
  expands `caphe gan` to `ca phe gan day`.
- With Hà Nội selected, the UI renders all three Hà Nội coffee POIs first,
  followed by the two generic completions; all five rows are `Nearby Search`.
- Production browser console contains no errors or warnings.
