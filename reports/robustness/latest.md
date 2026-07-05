# Robustness Evaluation Report

Generated: 2026-07-05T04:41:32.241Z

This report is generated only from the provided hackathon CSVs. It adds
metamorphic variants such as accentless, compact, uppercase, spacing,
truncated-prefix, and abbreviation forms to reduce overfitting to the 60 public
rows without importing any outside dataset.

## Summary

- Cases: 192
- Top-3 recall: 100%
- Top-5 recall: 100%
- P95 latency: 28 ms

| Transform | Cases | Top-3 | Top-5 |
| --- | ---: | ---: | ---: |
| uppercase | 59 | 100% | 100% |
| truncated | 21 | 100% | 100% |
| compact | 53 | 100% | 100% |
| spaced | 53 | 100% | 100% |
| abbreviation | 4 | 100% | 100% |
| accentless | 2 | 100% | 100% |

## Top-3 Misses

- none
