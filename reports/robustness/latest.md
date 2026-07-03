# Robustness Evaluation Report

Generated: 2026-07-03T16:16:50.184Z

This report is generated only from the provided hackathon CSVs. It adds
metamorphic variants such as accentless, compact, uppercase, spacing,
truncated-prefix, and abbreviation forms to reduce overfitting to the 60 public
rows without importing any outside dataset.

## Summary

- Cases: 192
- Top-3 recall: 97.4%
- Top-5 recall: 97.4%
- P95 latency: 72 ms

| Transform | Cases | Top-3 | Top-5 |
| --- | ---: | ---: | ---: |
| uppercase | 59 | 100% | 100% |
| truncated | 21 | 100% | 100% |
| compact | 53 | 90.6% | 90.6% |
| spaced | 53 | 100% | 100% |
| abbreviation | 4 | 100% | 100% |
| accentless | 2 | 100% | 100% |

## Top-3 Misses

- PUB006-compact (compact, `ksd`): expected Khách sạn Đà Nẵng | Khách sạn gần biển Đà Nẵng, got 
- PUB010-compact (compact, `coffeenear`): expected Coffee near me | Quán cà phê gần đây, got 
- PUB011-compact (compact, `nguyenhuee`): expected Nguyễn Huệ, Quận 1, TP.HCM, got 
- PUB023-compact (compact, `12nguyenhueq`): expected 12 Nguyễn Huệ, Quận 1, TP.HCM, got 
- PUB036-compact (compact, `dhbk`): expected Đại học Bách Khoa, got 
