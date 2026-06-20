# Indicators

Add a custom indicator by extending **`BarScriptIndicator`** (per-bar / Pine-style) or **`ComputeIndicator`** (batch math). Use **`builders.js`** for plots, fills, and inputs.

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
definitions/
  ema/EMAIndicator.js + rings.js
  rsi/RsiIndicator.js
  volume/VolumeIndicator.js
  macd/MacdIndicator.js + constants.js
  pivot/PivotPointsHlIndicator.js + labels.js
  smt/SmtIndicator.js + compareSymbol.js + styleHelpers.js
  levels/LevelsIndicator.js + htf.js + helpers.js
  fvg/FvgIndicator.js + engine.js + init.js + inputs.js + htf.js
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
// FVG-style Inputs (Style tab = Graphic objects + Input values only)
inputs: [
  {
    type: "row",
    section: "Timeframes",
    fields: [
      { id: "tf1On", type: "bool", title: "", defval: true },
      { id: "tf1", type: "timeframe", title: "Timeframe 1", defval: "chart" },
    ],
  },
  { id: "showFvg", type: "bool", title: "Show FVG", defval: true, section: "FVG settings" },
  {
    type: "inlinePair",
    section: "Box Settings",
    left: { id: "bullBox", type: "color", title: "FVG Box Color: Bullish", defval: { color: "#00e676", opacity: 10 } },
    right: { id: "bearBox", type: "color", title: "| Bearish", defval: { color: "#f23645", opacity: 10 } },
  },
],
graphicObjects: [
  { styleKey: "boxes", label: "Boxes" },
  { styleKey: "tables", label: "Tables" },
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
