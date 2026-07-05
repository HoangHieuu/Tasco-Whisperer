# Pairwise Learning-To-Rank Report

Generated: 2026-07-05T04:46:17.305Z

This is a dependency-free pairwise logistic learning-to-rank model over the
existing transparent score factors. It trains on metamorphic robustness
perturbations plus optional server-side behavior selections, while the public
evaluation rows are held out for validation.

- Runtime config: `config/ranking-weights.json`
- Robustness rows: 1626
- Behavior rows: 0
- Behavior log: `data/behavior-events.local.json`

## Metrics

| Split | Cases | Top-1 | Top-3 | MRR | NDCG@5 |
| --- | ---: | ---: | ---: | ---: | ---: |
| train | 192 | 94.3% | 100% | 0.969 | 0.952 |
| validation | 60 | 96.7% | 100% | 0.983 | 0.955 |

## Learned Weights

```json
{
  "lexical": 0.3620541218189766,
  "intent": 0.26300701175166596,
  "source": 0.09314885834125675,
  "popularity": 0.058682762499052445,
  "poiQuality": 0,
  "locality": 0.005362823769400796,
  "personalization": 0.005362823769400796,
  "diversity": 0.21238159805024667
}
```

## Note

Pairwise logistic linear ranker trained on robustness perturbations plus optional behavior selections; public evaluation rows are held out for validation.
