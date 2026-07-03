# Agentic Evaluation And Tuning Report

Generated: 2026-07-03T03:26:48.828Z

## Baseline

- Cases: 60
- Top-1 accuracy: 90%
- Top-3 recall: 100%
- Top-5 recall: 100%
- Intent accuracy: 66.7%
- MRR: 0.933
- P95 latency: 26 ms

## Weak Cases

### PUB001: vin

- Difficulty: Easy
- Expected intent: Brand Search
- Predicted intent: POI Search
- Expected suggestions: Vincom Center | Vinmec | Vinpearl
- Returned suggestions: Vinpearl | vincom đồng khởi | Vincom Center | Vinmec | Vincom Center Đồng Khởi
- Failure reasons: intent mismatch: expected Brand Search, predicted POI Search
- Agentic diagnosis: deterministic result is strong enough

### PUB007: bv bach

- Difficulty: Easy
- Expected intent: POI Search
- Predicted intent: Nearby Search
- Expected suggestions: Bệnh viện Bạch Mai
- Returned suggestions: Bệnh viện Bạch Mai | Bệnh viện Trần Duy Hưng Đà Nẵng | Bệnh viện Trần Duy Hưng TP.HCM | Vinmec Times City | Bệnh viện Trần Duy Hưng Hải Phòng
- Failure reasons: intent mismatch: expected POI Search, predicted Nearby Search
- Agentic diagnosis: deterministic result is strong enough

### PUB010: coffee near

- Difficulty: Medium
- Expected intent: Discovery Search
- Predicted intent: Category Search
- Expected suggestions: Coffee near me | Quán cà phê gần đây
- Returned suggestions: Quán cà phê gần đây | Coffee near me | Khách sạn gần đây | Vincom Quán cà phê Phan Chu Trinh TP.HCM | Phở gần đây
- Failure reasons: intent mismatch: expected Discovery Search, predicted Category Search
- Agentic diagnosis: deterministic result is strong enough

### PUB016: hotel da n

- Difficulty: Medium
- Expected intent: Discovery Search
- Predicted intent: Category Search
- Expected suggestions: Khách sạn Đà Nẵng gần biển | Hotel Đà Nẵng
- Returned suggestions: Khách sạn Đà Nẵng gần biển | Khách sạn Đà Nẵng | Khách sạn gần biển Đà Nẵng | Hotel Đà Nẵng | Khách sạn gần biển Mỹ Khê
- Failure reasons: intent mismatch: expected Discovery Search, predicted Category Search
- Agentic diagnosis: deterministic result is strong enough

### PUB021: quan cafe hoc

- Difficulty: Hard
- Expected intent: Discovery Search
- Predicted intent: Category Search
- Expected suggestions: Quán cà phê phù hợp học tập | Cafe có Wi-Fi
- Returned suggestions: Quán cà phê phù hợp học tập | Cafe có Wi-Fi | Quán cà phê có Wi-Fi | Cafe làm việc | Quán cà phê yên tĩnh
- Failure reasons: intent mismatch: expected Discovery Search, predicted Category Search
- Agentic diagnosis: deterministic result is strong enough

### PUB022: 12 ngu

- Difficulty: Medium
- Expected intent: Address Suggestion
- Predicted intent: POI Search
- Expected suggestions: 12 Nguyễn Huệ, Quận 1, TP.HCM
- Returned suggestions: Nguyễn Huệ, Quận 1, TP.HCM | Highlands Coffee Nguyễn Huệ | 12 Nguyễn Huệ, Quận 1, TP.HCM | Bãi biển Mỹ Khê | Vincom Quán cà phê Phan Chu Trinh TP.HCM
- Failure reasons: intent mismatch: expected Address Suggestion, predicted POI Search
- Agentic diagnosis: deterministic result is strong enough

### PUB026: lotte

- Difficulty: Medium
- Expected intent: Brand Search
- Predicted intent: Address Suggestion
- Expected suggestions: Lotte Mart | Lotteria | Lotte Cinema
- Returned suggestions: Lotte Mart | Lotteria | Lotte Cinema | Lotte Mart Cây xăng Hai Bà Trưng Hải Phòng | Lotteria Nguyễn Văn Linh
- Failure reasons: intent mismatch: expected Brand Search, predicted Address Suggestion
- Agentic diagnosis: deterministic result is strong enough

### PUB027: ha noi an

- Difficulty: Medium
- Expected intent: Discovery Search
- Predicted intent: POI Search
- Expected suggestions: Quán ăn Hà Nội | Ăn đêm Hà Nội
- Returned suggestions: Quán ăn Hà Nội | Ăn đêm Hà Nội | Quán ăn mở cửa khuya | Ăn đêm gần đây | Nhà hàng phù hợp cho trẻ em
- Failure reasons: intent mismatch: expected Discovery Search, predicted POI Search
- Agentic diagnosis: deterministic result is strong enough

### PUB028: da lat check

- Difficulty: Medium
- Expected intent: Discovery Search
- Predicted intent: POI Search
- Expected suggestions: Địa điểm check-in đẹp ở Đà Lạt
- Returned suggestions: Địa điểm check-in đẹp ở Đà Lạt | Petrolimex Quán cà phê Phan Chu Trinh Đà Lạt | Nhà hàng Phan Chu Trinh Đà Lạt | Khách sạn Võ Nguyên Giáp Đà Lạt | CGV Trung tâm thương mại Nguyễn Huệ Đà Lạt
- Failure reasons: intent mismatch: expected Discovery Search, predicted POI Search
- Agentic diagnosis: deterministic result is strong enough

### PUB029: rooftop q1

- Difficulty: Hard
- Expected intent: Discovery Search
- Predicted intent: Category Search
- Expected suggestions: Rooftop Quận 1 | Quán bar rooftop Quận 1
- Returned suggestions: Rooftop Quận 1 | Quán bar rooftop Quận 1 | Rooftop Chill Skybar
- Failure reasons: intent mismatch: expected Discovery Search, predicted Category Search
- Agentic diagnosis: deterministic result is strong enough

### PUB030: cafe wifi

- Difficulty: Medium
- Expected intent: Attribute Search
- Predicted intent: Attribute Search
- Expected suggestions: Quán cà phê có Wi-Fi | Cafe làm việc
- Returned suggestions: Quán cà phê phù hợp học tập | Cafe có Wi-Fi | Quán cà phê có Wi-Fi | Cafe làm việc | Quán cà phê yên tĩnh
- Failure reasons: expected suggestion was not ranked first
- Agentic diagnosis: deterministic result is strong enough

### PUB032: halal hcm

- Difficulty: Hard
- Expected intent: Category Search
- Predicted intent: POI Search
- Expected suggestions: Nhà hàng halal TP.HCM
- Returned suggestions: Nhà hàng halal TP.HCM | Chợ Bến Thành | Vincom Center Đồng Khởi | Nhà hàng Pizza 4P's Bến Nghé | Vincom Quán cà phê Phan Chu Trinh TP.HCM
- Failure reasons: intent mismatch: expected Category Search, predicted POI Search
- Agentic diagnosis: deterministic result is strong enough

### PUB034: my khe hotel

- Difficulty: Hard
- Expected intent: Discovery Search
- Predicted intent: Category Search
- Expected suggestions: Khách sạn gần biển Mỹ Khê
- Returned suggestions: Khách sạn Đà Nẵng gần biển | Khách sạn Đà Nẵng | Khách sạn gần biển Mỹ Khê | Khách sạn gần biển Đà Nẵng | Hotel Đà Nẵng
- Failure reasons: intent mismatch: expected Discovery Search, predicted Category Search; expected suggestion was not ranked first
- Agentic diagnosis: deterministic result is strong enough

### PUB039: ho guom cafe

- Difficulty: Medium
- Expected intent: Discovery Search
- Predicted intent: Category Search
- Expected suggestions: Quán cà phê gần Hồ Gươm
- Returned suggestions: Quán cà phê gần Hồ Gươm | Quán cà phê gần đây | Cà phê mở cửa 24/7 | Cộng Cà Phê Hồ Gươm | Highlands Coffee
- Failure reasons: intent mismatch: expected Discovery Search, predicted Category Search
- Agentic diagnosis: deterministic result is strong enough

### PUB041: sua xe gan

- Difficulty: Medium
- Expected intent: Category Search
- Predicted intent: Discovery Search
- Expected suggestions: Tiệm sửa xe gần đây
- Returned suggestions: Trà sữa gần đây | Trà sữa ngon | Tiệm sửa xe gần đây
- Failure reasons: intent mismatch: expected Category Search, predicted Discovery Search; expected suggestion was not ranked first
- Agentic diagnosis: local rewrite agent found no validated rewrite

### PUB046: xang tren duong

- Difficulty: Hard
- Expected intent: Discovery Search
- Predicted intent: Nearby Search
- Expected suggestions: Cây xăng trên đường đi | Trạm dừng có cây xăng
- Returned suggestions: Cây xăng gần đây | Trạm xăng gần đây | Cây xăng trên đường đi | Lotte Mart Cây xăng Hai Bà Trưng Hải Phòng | Cây xăng Petrolimex Nguyễn Trãi
- Failure reasons: intent mismatch: expected Discovery Search, predicted Nearby Search; expected suggestion was not ranked first
- Agentic diagnosis: deterministic result is strong enough

### PUB048: cf lam viec

- Difficulty: Hard
- Expected intent: Discovery Search
- Predicted intent: Discovery Search
- Expected suggestions: Cà phê làm việc | Quán cà phê có Wi-Fi
- Returned suggestions: Quán cà phê phù hợp học tập | Cafe có Wi-Fi | Quán cà phê có Wi-Fi | Cafe làm việc | Quán cà phê yên tĩnh
- Failure reasons: expected suggestion was not ranked first
- Agentic diagnosis: deterministic result is strong enough

### PUB051: spa gan day

- Difficulty: Easy
- Expected intent: Category Search
- Predicted intent: Nearby Search
- Expected suggestions: Spa gần đây
- Returned suggestions: Spa gần đây | cây xăng gần đây | Trạm xăng gần đây | ATM BIDV gần đây | quán cà phê gần đây
- Failure reasons: intent mismatch: expected Category Search, predicted Nearby Search
- Agentic diagnosis: deterministic result is strong enough

### PUB055: cafe yen tinh

- Difficulty: Medium
- Expected intent: Discovery Search
- Predicted intent: Category Search
- Expected suggestions: Quán cà phê yên tĩnh
- Returned suggestions: Quán cà phê yên tĩnh | Quán cà phê phù hợp học tập | Cafe có Wi-Fi | Quán cà phê có Wi-Fi | Cafe làm việc
- Failure reasons: intent mismatch: expected Discovery Search, predicted Category Search
- Agentic diagnosis: deterministic result is strong enough

### PUB056: hotel near beach danang

- Difficulty: Hard
- Expected intent: Discovery Search
- Predicted intent: Nearby Search
- Expected suggestions: Khách sạn gần biển Đà Nẵng
- Returned suggestions: Khách sạn Đà Nẵng | Khách sạn Đà Nẵng gần biển | Khách sạn gần biển Đà Nẵng | Hotel Đà Nẵng | Khách sạn gần biển Mỹ Khê
- Failure reasons: intent mismatch: expected Discovery Search, predicted Nearby Search; expected suggestion was not ranked first
- Agentic diagnosis: deterministic result is strong enough

### PUB058: hoc vien gan day

- Difficulty: Medium
- Expected intent: Category Search
- Predicted intent: Nearby Search
- Expected suggestions: Học viện gần đây | Trung tâm đào tạo gần đây
- Returned suggestions: Học viện gần đây | Trung tâm đào tạo gần đây | Bệnh viện Trần Duy Hưng Đà Nẵng | Trường Đại học Bách Khoa Hà Nội | Petrolimex Quán cà phê Phan Chu Trinh Đà Lạt
- Failure reasons: intent mismatch: expected Category Search, predicted Nearby Search
- Agentic diagnosis: deterministic result is strong enough

### PUB059: do an vat

- Difficulty: Medium
- Expected intent: Category Search
- Predicted intent: Discovery Search
- Expected suggestions: Quán ăn vặt gần đây
- Returned suggestions: Quán ăn vặt gần đây | Quán ăn mở cửa khuya | Ăn đêm gần đây | Quán ăn Hà Nội | Nhà hàng phù hợp cho trẻ em
- Failure reasons: intent mismatch: expected Category Search, predicted Discovery Search
- Agentic diagnosis: local rewrite agent found no validated rewrite


## Proposed Tuning Actions

### intent-rebalance-highest-mismatch

- Type: intent-rule
- Title: Review Category Search cases that should be Discovery Search
- Confidence: 0.76
- Requires developer acceptance: yes
- Affected cases: PUB010, PUB016, PUB021, PUB029, PUB034, PUB039, PUB055
- Rationale: 7 weak cases share the same intent mismatch pattern.
- Evidence: PUB010: "coffee near" | PUB016: "hotel da n" | PUB021: "quan cafe hoc" | PUB029: "rooftop q1" | PUB034: "my khe hotel"

```json
{
  "expectedIntent": "Discovery Search",
  "currentPredictedIntent": "Category Search",
  "action": "inspect entity and template votes before changing runtime intent rules"
}
```

### ranking-promote-expected-present

- Type: ranking-weight
- Title: Review ranking weights where expected suggestions are present but not first
- Confidence: 0.88
- Requires developer acceptance: yes
- Affected cases: PUB001, PUB007, PUB010, PUB016, PUB021, PUB022, PUB026, PUB027, PUB028, PUB029, PUB030, PUB032, PUB034, PUB039, PUB041, PUB046, PUB048, PUB051, PUB055, PUB056, PUB058, PUB059
- Rationale: 22 cases retrieved an expected suggestion but ranked another candidate first.
- Evidence: PUB001: expected [Vincom Center | Vinmec | Vinpearl], got [Vinpearl | vincom đồng khởi | Vincom Center] | PUB007: expected [Bệnh viện Bạch Mai], got [Bệnh viện Bạch Mai | Bệnh viện Trần Duy Hưng Đà Nẵng | Bệnh viện Trần Duy Hưng TP.HCM] | PUB010: expected [Coffee near me | Quán cà phê gần đây], got [Quán cà phê gần đây | Coffee near me | Khách sạn gần đây] | PUB016: expected [Khách sạn Đà Nẵng gần biển | Hotel Đà Nẵng], got [Khách sạn Đà Nẵng gần biển | Khách sạn Đà Nẵng | Khách sạn gần biển Đà Nẵng] | PUB021: expected [Quán cà phê phù hợp học tập | Cafe có Wi-Fi], got [Quán cà phê phù hợp học tập | Cafe có Wi-Fi | Quán cà phê có Wi-Fi]

```json
{
  "action": "compare lexical, intent, source, popularity, and diversity factors for expected-present cases",
  "guardrail": "do not lower top3/top5 recall while improving top1"
}
```

### alias-memory-candidates

- Type: alias
- Title: Promote repeated compact or typo forms into alias-memory candidates
- Confidence: 0.80
- Requires developer acceptance: yes
- Affected cases: PUB010, PUB016, PUB022, PUB026, PUB051, PUB058
- Rationale: 6 weak cases look like compact prefixes or typo variants of expected dataset terms.
- Evidence: PUB010: "coffee near" can map toward "Coffee near me" | PUB016: "hotel da n" can map toward "Khách sạn Đà Nẵng gần biển" | PUB022: "12 ngu" can map toward "12 Nguyễn Huệ, Quận 1, TP.HCM" | PUB026: "lotte" can map toward "Lotte Mart" | PUB051: "spa gan day" can map toward "Spa gần đây"

```json
{
  "action": "create candidate alias-memory records for developer review",
  "candidates": [
    {
      "rawQuery": "coffee near",
      "rewrite": "Coffee near me",
      "expectedIntent": "Discovery Search"
    },
    {
      "rawQuery": "hotel da n",
      "rewrite": "Khách sạn Đà Nẵng gần biển",
      "expectedIntent": "Discovery Search"
    },
    {
      "rawQuery": "12 ngu",
      "rewrite": "12 Nguyễn Huệ, Quận 1, TP.HCM",
      "expectedIntent": "Address Suggestion"
    },
    {
      "rawQuery": "lotte",
      "rewrite": "Lotte Mart",
      "expectedIntent": "Brand Search"
    },
    {
      "rawQuery": "spa gan day",
      "rewrite": "Spa gần đây",
      "expectedIntent": "Category Search"
    }
  ]
}
```

### watch-hard-cases

- Type: evaluation-watch
- Title: Track hard-case failures separately during tuning
- Confidence: 0.72
- Requires developer acceptance: yes
- Affected cases: PUB021, PUB029, PUB032, PUB034, PUB046, PUB048, PUB056
- Rationale: 7 weak cases are marked Hard and should remain visible during ranking or alias changes.
- Evidence: PUB021: intent mismatch: expected Discovery Search, predicted Category Search | PUB029: intent mismatch: expected Discovery Search, predicted Category Search | PUB032: intent mismatch: expected Category Search, predicted POI Search | PUB034: intent mismatch: expected Discovery Search, predicted Category Search; expected suggestion was not ranked first | PUB046: intent mismatch: expected Discovery Search, predicted Nearby Search; expected suggestion was not ranked first

```json
{
  "action": "preserve a hard-case watchlist in future before/after reports"
}
```


## Guardrails

- This report is advisory. Proposals require developer acceptance before code or config changes.
- The deterministic autocomplete path remains the runtime source of truth.

