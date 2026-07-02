# iPhone Mirroring Demo Script

This script connects Tasco Whisperer to the real T Maps iOS search experience
for a hackathon presentation. It does not claim production integration with the
closed-source T Maps app. The correct claim is: Tasco Whisperer is an
integration-ready autocomplete service and companion demo that can be shown next
to T Maps and exposed through `/api/suggest`.

## Presenter Setup

Run the browser demo:

```bash
npm run dev -- --host 127.0.0.1 --port 5173
```

Run the local API:

```bash
npm run api:dev -- --host 127.0.0.1 --port 8787
```

Open:

- T Maps in iPhone Mirroring.
- Tasco Whisperer at `http://127.0.0.1:5173/`.

Optional API proof:

```bash
curl "http://127.0.0.1:8787/api/suggest?q=cafe%20wifi&city=TP.HCM&userId=coffee-loyal&limit=3"
```

## Observed T Maps Entry Point

Observed through iPhone Mirroring on 2026-07-02:

- T Maps opens to a map-first screen.
- The top search field is labeled `Tìm kiếm`.
- Category chips include `Nhà hàng`, `Khách sạn`, `Cà phê`, and `Tạp hoá`.
- Bottom tabs include `Khám phá`, `Chỉ đường`, `Thời tiết`, and `Đóng góp`.

Use this first screen to make the connection clear: Tasco Whisperer is designed
for the search box and category-discovery workflow already visible in T Maps.

## Demo Flow

### 1. Native Context

Show iPhone Mirroring with T Maps open.

Narration:

```text
This is the real T Maps search entry point. The app already has a map-first
flow, a search box, and quick categories. Our project focuses on the
autocomplete intelligence behind this search experience.
```

Point to:

- `Tìm kiếm` search box.
- Category chips.
- Bottom navigation.

### 2. Problem Statement

Switch to Tasco Whisperer.

Narration:

```text
Vietnamese map search is messy: people type without accents, use abbreviations,
mix English and Vietnamese, and often stop before finishing the query. Tasco
Whisperer predicts intent, expands abbreviations, extracts entities, and ranks
suggestions in real time.
```

### 3. Easy Product Examples

Type these in the Tasco Whisperer demo search box:

| Input | Point To |
| --- | --- |
| `vin` | Brand completions such as Vincom, Vinmec, Vinpearl. |
| `cafe` | Category and nearby cafe suggestions. |
| `atm` | Nearby ATM intent. |
| `nguyen h` | Address and POI completion for Nguyễn Huệ. |
| `ben th` | Landmark completion for Chợ Bến Thành. |

Narration:

```text
These examples show the base autocomplete behavior: brand, category, nearby,
address, and POI search all share one suggestion pipeline.
```

### 4. Hard Vietnamese Search Examples

Type these next:

| Input | Point To |
| --- | --- |
| `ks da nang` | Abbreviation expansion from `ks` to hotel and city entity extraction. |
| `bv bach` | Missing accents and hospital POI completion. |
| `cay x` | Incomplete gas-station query and nearby intent. |
| `coffee near` | Mixed English/Vietnamese nearby discovery. |
| `cafe wifi` | Attribute intent plus `Wi-Fi` entity chip. |
| `10.77` | Coordinate-style prefix classification. |

Narration:

```text
These are the cases that matter for Vietnamese search quality: abbreviations,
missing accents, mixed language, attributes, and coordinates. The debug panel
shows normalized text, expansions, entities, intent confidence, and ranking
factors.
```

### 5. API Readiness

Show the terminal or copy this command into the README/API section:

```bash
curl "http://127.0.0.1:8787/api/suggest?q=cafe%20wifi&city=TP.HCM&userId=coffee-loyal&limit=3"
```

Narration:

```text
The same deterministic engine is available through a clean HTTP endpoint. That
is the integration path for a T Maps prototype: the iOS search box could call
this service and render the returned suggestions.
```

### 6. Evaluation Proof

Show `npm run eval` output or quote the current README metrics:

```text
Public evaluation: 60 cases, top-1 accuracy 88.3%, top-3 recall 100%, top-5
recall 100%, MRR 0.922.
```

Narration:

```text
The demo is not just a hand-picked search box. It is measured against the
provided public evaluation dataset and runs locally without paid services.
```

## Non-Overclaim Language

Use:

```text
Tasco Whisperer is a companion autocomplete service and demo for the T Maps
search experience.
```

Use:

```text
The current prototype is integration-ready through `/api/suggest`.
```

Do not say:

```text
This is already integrated into the production T Maps iOS app.
```

Do not say:

```text
This uses private or production T Maps user data.
```

## Recording Checklist

Capture a 90-120 second recording:

1. Start with iPhone Mirroring on T Maps.
2. Zoom or point to `Tìm kiếm` and the category chips.
3. Switch to Tasco Whisperer.
4. Type `vin`, `ks da nang`, `cafe wifi`, and `10.77`.
5. For `cafe wifi`, pause on the debug panel showing `Attribute Search` and
   `Wi-Fi`.
6. Show terminal API response for `/api/suggest` if time allows.
7. End on the public evaluation metrics.

Recommended screenshots:

- T Maps first screen in iPhone Mirroring.
- Tasco Whisperer with `cafe wifi`.
- Tasco Whisperer with `ks da nang`.
- API curl response.
- `npm run eval` metrics.

## Backup Plan

If iPhone Mirroring disconnects during the pitch:

1. Use the observed T Maps screenshot or describe the search entry point from
   this document.
2. Continue with the browser demo at `http://127.0.0.1:5173/`.
3. Show the API curl command to prove the integration surface still works.
4. State clearly that the live native app connection is visual context, while
   the implemented deliverable is the autocomplete engine, API, and demo UI.
