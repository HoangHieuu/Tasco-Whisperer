# Submission Example Gallery

These examples were generated from the current CSV-backed engine with
`buildDatasetFromCsvs()` and `suggest()` using the files in `data/`. Scores and
latency are local-run values and may move slightly by machine, but the rows are
grounded in the shipped datasets, generated patterns, MiniLM artifact fallback,
and deterministic ranking rules.

## Generated Examples

| Input | Intent | Top generated suggestions | What it demonstrates |
| --- | --- | --- | --- |
| `vin` | Brand Search | `Vinpearl` (0.86), `Vincom Center` (0.83), `Vinmec` (0.81) | Historical autocomplete pairs and brand ranking. |
| `cafe` | Category Search | `Quán cà phê gần đây` (0.91), `Coffee near me` (0.88), `Vincom Quán cà phê Phan Chu Trinh TP.HCM` (0.83) | Accent-insensitive category search plus coffee-loyal profile boost. |
| `caphe` | Category Search | `Quán cà phê gần đây` (0.88), `Coffee near me` (0.88), `Vincom Quán cà phê Phan Chu Trinh TP.HCM` (0.83) | Compact Vietnamese syllable handling without a remote provider call. |
| `atm` | Nearby Search | `ATM Vietcombank gần nhất` (0.86), `ATM BIDV gần đây` (0.83), `ATM gần sân bay` (0.79) | Nearby service intent and historical query frequency. |
| `ks da nang` | Discovery Search | `Khách sạn Đà Nẵng gần biển` (0.92), `Khách sạn Đà Nẵng` (0.92), `Khách sạn gần biển Đà Nẵng` (0.91) | Abbreviation expansion plus city and coastal discovery intent. |
| `nguyen hue` | Address Suggestion | `Nguyễn Huệ, Quận 1, TP.HCM` (0.92), `Highlands Coffee Nguyễn Huệ` (0.92), `12 Nguyễn Huệ, Quận 1, TP.HCM` (0.91) | Street/address completion and POI evidence on the same street. |
| `ben thanh` | POI Search | `Chợ Bến Thành` (0.92), `Khách sạn gần Chợ Bến Thành` (0.92) | Landmark completion and adjacent discovery suggestions. |
| `q1 cafe` | Category Search | `Vincom Quán cà phê Phan Chu Trinh TP.HCM` (0.85), `Quán cà phê gần đây` (0.84), `Highlands Coffee Nguyễn Huệ` (0.83) | District/city scoping plus cafe profile personalization. |
| `bv bach` | POI Search | `Bệnh viện Bạch Mai` (0.92), `Trường Đại học Bách Khoa Hà Nội` (0.79), `Bệnh viện Trần Duy Hưng Đà Nẵng` (0.70) | Vietnamese abbreviation expansion and POI/category fallback. |
| `cay x` | Nearby Search | `Cây xăng gần đây` (0.92), `Trạm xăng gần đây` (0.92), `Lotte Mart Cây xăng Hai Bà Trưng Hải Phòng` (0.70) | Low-confidence compact prefix handled by validated local rewrite agent. |
| `coffee near` | Discovery Search | `Quán cà phê gần đây` (0.97), `Coffee near me` (0.97), `Vincom Quán cà phê Phan Chu Trinh TP.HCM` (0.71) | Mixed English/Vietnamese nearby cafe intent. |
| `vincom dong k` | POI Search | `Vincom Center Đồng Khởi` (0.92), `vincom đồng khởi` (0.75) | Partial POI completion with accent recovery. |
| `dhbk` | Category Search | `Đại học Bách Khoa Hà Nội` (0.83), `Đại học Bách Khoa` (0.83), `Trường Đại học Bách Khoa Hà Nội` (0.80) | Compact abbreviation and embedding-neighbor fallback. |
| `12nguyenhueq` | Address Suggestion | `Nguyễn Huệ, Quận 1, TP.HCM` (0.92), `Highlands Coffee Nguyễn Huệ` (0.92), `12 Nguyễn Huệ, Quận 1, TP.HCM` (0.91) | Numeric compact address prefix and street completion. |
| `coffeenear` | Category Search | `Quán cà phê gần đây` (0.96), `Coffee near me` (0.88), `Vincom Quán cà phê Phan Chu Trinh TP.HCM` (0.71) | Compact mixed-language query split through generated patterns. |

## Grounding Notes

- All examples use the synthetic hackathon CSVs in `data/`.
- The top suggestions expose type, score, source, matched evidence, score
  factors, and optional grounded explanation metadata.
- Simulated profile examples use `coffee-loyal` for cafe/coffee cases. The
  browser demo also supports a `local-demo` profile stored in local browser
  storage after a user selects suggestions.
- Optional provider-backed rewrites are not required for these examples. The
  default path is deterministic, with a local validated rewrite tier for hard
  compact cases.

## Reproduce

Run the full proof:

```bash
npm run check
```

Run the local demo:

```bash
npm run api:dev -- --host 127.0.0.1 --port 8787
npm run dev -- --host 127.0.0.1 --port 5173
```

Open `http://127.0.0.1:5173/` and use the demo query buttons or type the
inputs above.
