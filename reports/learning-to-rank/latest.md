# Learning-To-Rank Baseline Report

Generated: 2026-07-03T16:16:52.017Z

This is a dependency-free linear learning-to-rank baseline over the existing
transparent score factors. It is useful as a training-ready path and regression
guard, not as a production ML-ranker claim while labels are limited to the
provided hackathon evaluation rows.

## Metrics

| Split | Cases | Top-1 | Top-3 | MRR | NDCG@5 |
| --- | ---: | ---: | ---: | ---: | ---: |
| train | 48 | 97.9% | 100% | 0.99 | 0.964 |
| validation | 12 | 75% | 100% | 0.861 | 0.866 |

## Learned Weights

```json
{
  "lexical": 0.31658092599920856,
  "intent": 0.1582904629996043,
  "source": 0.15829046299960428,
  "popularity": 0.10552697533306951,
  "poiQuality": 0.10302070966890912,
  "locality": 0.052763487666534756,
  "personalization": 0.052763487666534756,
  "diversity": 0.052763487666534756
}
```

## Note

Dependency-free linear LTR baseline over existing score factors; use larger judged logs before claiming production ML ranking.
