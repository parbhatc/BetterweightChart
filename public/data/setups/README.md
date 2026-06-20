# Setup JSON

Each file defines one trading setup: checklist steps, confluence rules, and optional cycle behavior.

```
data/setups/
  manifest.json   [1, 2, …] — ids to load at startup
  1.json          Setup #1 (HTF sweep backbone)
  2.json          Setup #2 (FVG tap backbone)
  3.json          Setup #3 (last candle sweep)
```

Loaded by `frontend/lib/setups/registry/loadSetups.js`. UI copy (panel titles, feed headings, idle hints) is **derived from `name` and checklist labels** — you usually do not need a separate `text` block.

---

## File shape

```json
{
  "id": 2,
  "name": "Setup #2",
  "cycle": { "reset_on_opposite_fvg_tap": true },
  "checklist": [ … ]
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `id` | yes | Numeric id. Must match filename and `manifest.json` entry. |
| `name` | yes | Display name in panels and markers. |
| `checklist` | yes | Ordered confluence steps (see below). |
| `cycle` | no | FVG-tap backbone only. Controls re-arm after completion. |
| `engine` | no | Force `"htfSweep"`, `"fvgTap"`, or `"lastCandleSweep"` when auto-detection is ambiguous. |
| `slug` | no | Internal registry key. Defaults from engine. |
| `ui` | no | Panel preset: `"htfSweep"`, `"fvgTap"`, or `"lastCandleSweep"`. Defaults from engine. |
| `text` | no | Optional copy overrides (feeds, idle hints). Rarely needed. |

### Engine (backbone) selection

Inferred from checklist step ids unless `engine` is set:

| First / dominant steps | Engine | Example |
|------------------------|--------|---------|
| `sweep` (HTF) | `htfSweep` | Setup #1 |
| `fvg_tap` + `internal_sweep` (+ optional `smt`) | `fvgTap` | Setup #2 |
| `last_candle_sweep` + `close_above_sweep` | `lastCandleSweep` | Setup #3 |

---

## Checklist

Array of step objects, sorted by `step` when present.

```json
{
  "step": 1,
  "id": "fvg_tap",
  "label": "{tf} FVG Tapped",
  "accept": ["15m"],
  "freshMax": { "type": "candles", "value": 60 }
}
```

### Common fields

| Field | Applies to | Description |
|-------|------------|-------------|
| `step` | all | Sequence number (`1` = first). |
| `id` | all | Step key — drives engine logic and done checks. |
| `label` | all | UI template. Tokens: `{tf}`, `{internalTf}`. |
| `labelFrom` | all | Dynamic label instead of `label`. See below. |
| `accept` | `sweep`, `fvg_tap` | Allowlist of tags or timeframes. |
| `freshMax` | most steps | Max confluence age before step goes stale. Omit = no limit. |
| `freshMaxSec` | most steps | Legacy seconds form of `freshMax`. Prefer `freshMax`. |

### Step ids

| `id` | Aliases | Role |
|------|---------|------|
| `sweep` | `htfSweep` | HTF liquidity sweep (15m / 1h / 4h / PPI / CPI). |
| `fvg_tap` | — | Fair value gap tap on allowed TF. |
| `internal_sweep` | `internal` | Internal liquidity sweep on chart TF. |
| `smt` | — | Smart money technique divergence. |
| `ifvg` | — | Inverse FVG entry zone. |
| `close_tapped_fvg` | — | Close through the tapped FVG (bias-dependent label). |
| `last_candle_sweep` | — | Session-open HTF candle swept by next bucket (`accept`: `15m`, …). |
| `close_above_sweep` | — | Close above/below sweep candle extreme (Setup #3 entry). |
| `smt_ifvg` | — | Combined SMT + IFVG (specialized flows). |

### `labelFrom`

| Value | Behavior |
|-------|----------|
| `"close_tapped_fvg"` | Label follows trade bias (e.g. “Close above tapped FVG”). |
| `"internalSweep"` | Bias-dependent internal sweep label. |

### `accept`

**`sweep`** — tags matched against sweep labels (case-insensitive):

`15m`, `1h`, `4h`, `ppi`, `cpi`, etc.

**`fvg_tap`** — chart timeframes with FVG data:

`15m` (default if omitted), `1h`, `4h`, …

### `freshMax` (confluence freshness)

Per-step max age. Stale confluence does not satisfy the step.

```json
{ "type": "candles", "value": 60 }
```

60 bars on the **active chart timeframe**.

```json
{ "type": "time", "value": 3600 }
```

3600 seconds (1 hour).

Used on: `sweep`, `fvg_tap`, `internal_sweep`, `ifvg`, `close_tapped_fvg`, `smt`.

---

## Step-specific options

### `sweep` / HTF sweep

| Field | Description |
|-------|-------------|
| `accept` | Which HTF sweeps qualify (see above). |
| `freshMax` | Max age for the anchor HTF sweep. |
| `pivot_left` / `pivot_right` | Pivot bars for sweep detection. Default `1` / `1`. |

### `fvg_tap`

| Field | Description |
|-------|-------------|
| `accept` | Allowed FVG timeframes. First entry sets primary `{tf}` in labels. |
| `freshMax` | Max age for the tap event. |

### `last_candle_sweep`

| Field | Description |
|-------|-------------|
| `accept` | HTF for last + sweep candles (`15m`, `1h`, …). First entry sets `{tf}` in labels. |
| `freshMax` | Max age for the sweep event. |

### `internal_sweep`

Two modes — use **one**, not both:

| Field | Setup | Description |
|-------|-------|-------------|
| `pivot_lookback` | #1 | Pivots may confirm up to N **before** the FVG tap. `{ "type": "time", "value": 180 }` = 180 seconds. |
| `pivots_after_start` | #2 | When `true`, pivots must confirm **after** tap / regime start. |
| `pivot_left` / `pivot_right` | both | Pivot bars. Default `1` / `1`. |
| `freshMax` | both | Max age for internal sweep confluence. |

### `smt`

| Field | Default | Description |
|-------|---------|-------------|
| `pivot_left` | `1` | Left pivot bars. |
| `pivot_right` | `1` | Right pivot bars. |
| `require_before_ifvg` | `true` when IFVG step exists | SMT must complete before IFVG qualifies. Set `false` to relax. |
| `freshMax` | — | Max age for SMT signal. |

### `ifvg`

| Field | Description |
|-------|-------------|
| `freshMax` | Max age for IFVG zone. |
| `qualify` | Optional regime rules (Setup #1). Omit or `false` = off. `true` = all defaults on. |

#### `qualify` block

```json
"qualify": {
  "floorAfterOppositeTap": true,
  "requireInternalBetween": true,
  "maxAfterSameSide": { "type": "candles", "value": 35 }
}
```

| Field | Description |
|-------|-------------|
| `floorAfterOppositeTap` | IFVG floor must form after opposite-side FVG tap. |
| `requireInternalBetween` | Internal sweep required between tap and IFVG. |
| `maxAfterSameSide` | Latest same-side IFVG relative to tap (duration spec). |

### `close_tapped_fvg`

| Field | Description |
|-------|-------------|
| `labelFrom` | `"close_tapped_fvg"` (recommended). |
| `freshMax` | Max age for the close-through event. |

---

## Setup-level `cycle`

Only meaningful for **FVG tap** backbones (Setup #2).

```json
"cycle": {
  "reset_on_opposite_fvg_tap": true
}
```

| Field | Default | Description |
|-------|---------|-------------|
| `reset_on_opposite_fvg_tap` | `true` | After a completed setup, wait for an opposite 15m FVG tap before arming again. |

---

## Examples

### Setup #1 — HTF sweep first

[`1.json`](./1.json): sweep → 15m FVG tap → internal sweep (lookback) → IFVG (qualify) → close through.

### Setup #2 — FVG tap first

[`2.json`](./2.json): 15m FVG tap → internal sweep (after start) → SMT → IFVG → close through. Resets on opposite tap.

### Setup #3 — Last candle sweep

[`3.json`](./3.json): After the session-open `{tf}` candle closes (from `accept`, e.g. `15m`), wait for the next `{tf}` candle to sweep the last candle low and close back above the last candle close. Sweep of low = **bullish**; the sweep candle high must stay below the last candle high. Entry when a chart-TF candle closes fully above the sweep candle high.

**Example (bullish):**

| Candle | Close | Low | High |
|--------|-------|-----|------|
| 9:30 15m (ref) | 29279.25 | 29263.50 | 29501.00 |
| 9:45 15m (sweep) | 29349.50 | 29230.00 | 29407.50 |

- 9:45 low 29230.00 swept 9:30 low 29263.50 ✓
- 9:45 close 29349.50 closed above 9:30 close 29279.25 ✓
- 9:45 high 29407.50 is below 9:30 high 29501.00 ✓ (required on low sweep)
- Entry: any chart-TF candle closes above 9:45 high 29407.50

---

## Adding Setup #4

1. Copy `1.json`, `2.json`, or `3.json` → `4.json`. Set `"id": 4` and edit `name` + `checklist`.
2. Add `4` to [`manifest.json`](./manifest.json): `[1, 2, 3, 4]`.
3. Import in [`loadSetups.js`](../../frontend/lib/setups/registry/loadSetups.js):

   ```js
   import setup4 from "../../../../data/setups/4.json" with { type: "json" };

   const BY_ID = { 1: setup1, 2: setup2, 3: setup3, 4: setup4 };
   ```

4. Restart the chart server. New setup appears automatically.

For a genuinely new flow (unknown step sequence), add an engine bundle in `frontend/lib/setups/registry/setupEngineRegistry.js`.

---

## Related code

| Module | Role |
|--------|------|
| `setupChecklist.js` | Checklist types and label resolution |
| `setupStepTypes.js` | Canonical step ids |
| `setupStepFresh.js` | `freshMax` → seconds |
| `setupInternalSweep.js` | `pivot_lookback` / `pivots_after_start` |
| `setupIfvg.js` | `qualify` rules + duration parsing |
| `setupGlobal.js` | Reads `data/settings.json` |
