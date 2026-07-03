# Ranking Tuning Report

Generated: 2026-07-03T03:37:57.779Z

Best preset by top-3, top-1, MRR, intent, and latency tie-breakers: `semantic-diverse`.

| Preset | Top-1 | Top-3 | Top-5 | MRR | Intent | p95 ms | Notes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| default-v1 | 90% | 100% | 100% | 0.933 | 66.7% | 36 | Current transparent scoring formula from SPEC.md. |
| lexical-intent-heavy | 90% | 100% | 100% | 0.933 | 66.7% | 25 | Prioritizes prefix fit and predicted intent for short typeahead prefixes. |
| semantic-diverse | 90% | 100% | 100% | 0.933 | 66.7% | 24 | Gives more room to semantic and embedding sources through source and diversity factors. |
| popularity-quality | 83.3% | 98.3% | 100% | 0.895 | 66.7% | 25 | Favors popular queries and higher quality POIs for broad ambiguous inputs. |

## Weights

### default-v1

```json
{
  "lexical": 0.3,
  "intent": 0.2,
  "source": 0.15,
  "popularity": 0.1,
  "poiQuality": 0.1,
  "locality": 0.05,
  "personalization": 0.05,
  "diversity": 0.05
}
```

### lexical-intent-heavy

```json
{
  "lexical": 0.38,
  "intent": 0.24,
  "source": 0.12,
  "popularity": 0.08,
  "poiQuality": 0.06,
  "locality": 0.04,
  "personalization": 0.03,
  "diversity": 0.05
}
```

### semantic-diverse

```json
{
  "lexical": 0.24,
  "intent": 0.18,
  "source": 0.2,
  "popularity": 0.08,
  "poiQuality": 0.08,
  "locality": 0.04,
  "personalization": 0.04,
  "diversity": 0.14
}
```

### popularity-quality

```json
{
  "lexical": 0.24,
  "intent": 0.18,
  "source": 0.12,
  "popularity": 0.18,
  "poiQuality": 0.14,
  "locality": 0.05,
  "personalization": 0.04,
  "diversity": 0.05
}
```

