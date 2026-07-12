# Indicators

Detailed per-indicator function inventory lives in `docs/indicators-reference.md`.

Add a custom indicator by extending **`BarScriptIndicator`** (per-bar / Pine-style) or **`ComputeIndicator`** (batch math). Use **`builders.js`** for plots, fills, and inputs.

## Programmatic add / remove

After `bootChart()`, use the widget API (also exposed as `window.bwc`):

```javascript
bwc.indicators.add("ema")
bwc.indicators.add("rsi", { inputs: { length: 21 } })
bwc.indicators.remove("ema")       // all EMA instances, or pass an instance id
bwc.indicators.clear()             // remove every indicator
bwc.indicators.list()              // active instances
bwc.indicators.available()         // [{ id, title, shortTitle }, ...]
```

Built-in ids include `ema`, `rsi`, `macd`, `volume`, `pivot_points_hl`, `smt` (plus any host-registered studies).

## Adding an indicator (one command)

```bash
npm run new:indicator myStudy
```

This creates `public/js/indicators/definitions/mystudy/MyStudyIndicator.js` from a working `ComputeIndicator` template and registers it in `definitions/index.js` — the **single** manifest (the top-level `indicators/index.js` re-exports from it). Implement `computeSeries()`; the library listing, settings dialog, defaults, serialization, and rendering are derived automatically from the plot/input schema. Band plots can declare `{ band: true, level: 70, lineStyle: 2 }` and get dashed level rows in settings for free.

---

## Pine-style: `BarScriptIndicator` (recommended)

```javascript
import { BarScriptIndicator } from "../../BarScriptIndicator.js";
import { createInput, plot } from "../../builders.js";

export class MyIndicator extends BarScriptIndicator {
  constructor() {
    super("my_study", "MY", "My Study");
    this.setPrimaryPlot("line");
    this.setPlots([plot("line", "Line", "#2962ff")]);
    this.setInputs([
      createInput("int", "length", "Length", 14),
      createInput("source", "source", "Source", "close"),
    ]);
  }

  onBar() {
    this.plot("line", this.source());
  }
}

BarScriptIndicator.define(MyIndicator);
```

Add to `definitions/index.js`, reload — it appears in the **Indicators** library.

Legacy `defineIndicator(class …)` still works for one-off studies but new code should extend the base classes directly.

### `this` inside `onBar()` / `init()`

| Property / method | Pine equivalent | Description |
|-------------------|-----------------|-------------|
| `this.bar` | `open`, `high`, `low`, `close` | Current OHLCV bar |
| `this.index` | `bar_index` | 0-based bar index |
| `this.inputs` | `input.*` | Study inputs (raw object) |
| `this.getInput(key, def?)` | `input.*` | Single input value with optional default |
| `this.inputInt(key, def, min?)` | `input.int` | Parsed integer input |
| `this.inputFloat(key, def, min?)` | `input.float` | Parsed float input |
| `this.source(fieldKey?)` | `close`, `hl2`, etc. | Price source for current bar |
| `this.style` | input colors | Style tab values |
| `this.state` | `var` | Object that persists across bars |
| `this.plot(key, value)` | `plot()` | Set plot value for this bar |
| `this.drawLabel({...})` | `label.new()` | Draw on chart (needs `overlayPrimitive`). Use `barIndex` for pivot bar time when confirming `right` bars later. |
| Graphic objects toggle | `graphicObjects: [{ styleKey, label, overlay? }]` |
| `this.math.pivotHigh(left, right)` | `ta.pivothigh` | Pivot high at current bar |
| `this.math.pivotLow(left, right)` | `ta.pivotlow` | Pivot low at current bar |
| `this.math.source(bar, field)` | `close`, `hl2`, etc. | Read price source |
| `this.format.price(n)` | `str.tostring` | Format price for labels |
| `this.bars` | full series | All bars (for custom lookback) |

Optional `init()` runs once before the bar loop (setup).

---

## Example: Pivot Points High Low

```javascript
export const PivotPointsHlIndicator = defineIndicator({
  title: "Pivot Points High Low",
  shortTitle: "Pivots HL",
  overlayPrimitive: "labels",
  graphicObjects: [{ styleKey: "paneLabels", label: "Pane labels", overlay: "labels" }],

  inputs: [
    { id: "leftLenH", type: "int", title: "Pivot High", defval: 10, inline: true },
    { id: "rightLenH", type: "int", title: "/", defval: 10, inline: true },
  ],

  onBar() {
    const ph = this.math.pivotHigh(this.inputs.leftLenH, this.inputs.rightLenH);
    if (ph != null) {
      this.drawLabel({
        price: ph,
        kind: "high",
        text: this.format.price(ph),
        textColor: this.style.textColorH,
        bgColor: this.style.labelColorH,
      });
    }
  },
});
```

Full source: `definitions/pivot/PivotPointsHlIndicator.js`

---

## Batch mode: `ComputeIndicator`

For vectorized math, extend **`ComputeIndicator`** and implement `static computeSeries(bars, inputs, style, instance)`:

```javascript
export class RsiIndicator extends ComputeIndicator {
  static computeSeries(bars, inputs, style) {
    return computeRsiIndicator(bars, inputs, style);
  }
}
```

Or use `overlay(utcBars, chartBars, ...)` for batch labels. Legacy `defineIndicator({ compute })` still works.

---

## Folder layout

```
definitions/                    # shipped built-ins (public/js/indicators/definitions/)
  ema/EMAIndicator.js + rings.js
  rsi/RsiIndicator.js
  ...

testing_web/frontend/js/indicators/   # app overlay studies (register in testing_web/frontend/js/main.js)
  myStudy/MyStudyIndicator.js + MyStudyEngine.js + init.js + …

public/js/indicators/script/          # shared Pine-style helpers (any overlay study)
  barIndex.js + liquidityMatrix.js + overlayEngine.js
```

Input helper: `createInput("int", "length", "Length", 9)` — type is `int`, `float`, `bool`, `source`, `select`, `timeframe`, etc.

## Config reference

| Field | Use for |
|-------|---------|
| `onBar(bar)` | **Pine-style** — one bar per call |
| `init()` | Runs once before bar loop |
| `compute(bars, inputs, style)` | Batch lines / histograms |
| `overlay(utcBars, chartBars, ...)` | Batch labels on price chart |
| `overlayPrimitive` | Canvas primitive id (`labels`, `lines`, …) |
| `graphicObjects` | Style tab: **Graphic objects** + **Input values** only |
| `stylePlotRows()` | Extra style rows for line/histogram studies (not shown when `graphicObjects` is set) |
| `studyPaneOrder` | RSI / MACD style pane below chart |
| `legendParams(instance)` | Status line params (instance method); default: inputs with `showInStatusLine` |

Input types: `int`, `float`, `bool`, `source`, `select`, `timeframe`, `text`, `color`  
Layout: `section` (group title), `inline: true` (legacy same-row numbers), `type: "row"` (checkbox + field), `type: "inlinePair"` (two fields side by side, e.g. Bullish | Bearish colors)

**Status line** — each input can set `showInStatusLine` (default `true` for `int`, `float`, `select`, `source`, `timeframe`, `text`; default `false` for `bool` and `color` unless set to `true`). Values appear as chips after the study title (TradingView-style). Override with instance method `legendParams(instance)`. Global toggle: Style → **Inputs in status line**.

```javascript
static inputs = [
  { id: "length", type: "int", title: "Length", defval: 14 }, // shown: "14"
  { id: "showLabels", type: "bool", title: "Show labels", defval: true }, // hidden unless showInStatusLine: true
  { id: "tf2", type: "timeframe", title: "TF2", defval: "15", showInStatusLine: false },
];
```

Graphic studies (`graphicObjects`) — Style tab shows **Graphic objects** + **Input values** only (no line color rows). Put box/label colors in Inputs via `type: "color"`.

```javascript
// Box/label overlay (Style tab = Graphic objects + Input values only)
inputs: [
  { id: "showBoxes", type: "bool", title: "Show boxes", defval: true, section: "Display" },
  {
    type: "inlinePair",
    section: "Box colors",
    left: { id: "bullBox", type: "color", title: "Bullish", defval: { color: "#00e676", opacity: 10 } },
    right: { id: "bearBox", type: "color", title: "Bearish", defval: { color: "#f23645", opacity: 10 } },
  },
],
graphicObjects: [
  { styleKey: "graphicBoxes", label: "Boxes", overlay: "boxes" },
  { styleKey: "graphicLabels", label: "Labels" },
],
```

---

## Pine → BetterWeightChart

| Pine | BetterWeightChart |
|------|-------------------|
| `indicator()` | `defineIndicator({ title, shortTitle, ... })` |
| script body (per bar) | `onBar() { ... }` |
| `input.*` | `inputs: [...]` → `this.inputs` |
| `plot()` | `this.plot("key", value)` |
| `label.new()` | `this.drawLabel({...})` + `overlayPrimitive: "labels"` |
| `ta.pivothigh` / `ta.pivotlow` | `this.math.pivotHigh()` / `this.math.pivotLow()` |
| `var x = 0` | `this.state.x = ...` |
| `overlay=true` | `overlayPrimitive: "labels"` |

---

## Built-in indicators

EMA, Volume, RSI, MACD, **Pivot Points High Low**

Copy an existing indicator folder (e.g. `definitions/ema/`) to get started.

---

## Troubleshooting

- **Not in library** — `enabled: true` and listed in `definitions/index.js`
- **No labels** — need `onBar` + `this.drawLabel()` + `overlayPrimitive: "labels"`
- **No lines** — `this.plot("plotId", value)` must match a `plots[].id`

See also: [README.md](../README.md)
