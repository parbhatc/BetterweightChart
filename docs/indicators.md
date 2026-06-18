# Indicators

Add a custom indicator with **one file** and **`defineIndicator()`** — Pine Script style, one bar at a time.

---

## Pine-style: `onBar()` (recommended)

Your script runs **once per bar**, like Pine. Use `this.plot()`, `this.drawLabel()`, `this.math.*`:

```javascript
import { defineIndicator } from "../defineIndicator.js";

export const MyIndicator = defineIndicator(class MyIndicator {
  constructor() {}

  static id = "My Study@tv-basicstudies";
  static type = "my_study";
  static title = "My Study";
  static shortTitle = "MY";

  static inputs = [
    { id: "length", type: "int", title: "Length", defval: 14 },
    { id: "source", type: "source", title: "Source", defval: "close" },
  ];

  static plots = [
    { id: "line", title: "Line", color: "#2962ff" },
  ];

  onBar(bar) {
    const value = this.math.source(bar, this.inputs.source);
    this.plot("line", value);
  }
});
```

Add to `definitions/index.js`, reload — it appears in the **Indicators** library.

### `this` inside `onBar()`

| Property / method | Pine equivalent | Description |
|-------------------|-----------------|-------------|
| `this.bar` | `open`, `high`, `low`, `close` | Current OHLCV bar |
| `this.index` | `bar_index` | 0-based bar index |
| `this.inputs` | `input.*` | Study inputs |
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

Full source: `definitions/PivotPointsHlIndicator.js`

---

## Batch mode (all bars at once)

For heavy vectorized math you can still use `compute(bars, inputs)` returning `{ plotKey: number[] }`, or `overlay(utcBars, chartBars, ...)` for labels. Most custom studies should use `onBar()` instead.

---

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
| `legendParams(instance)` | Status line params (override); default: inputs with `showInStatusLine` |

Input types: `int`, `float`, `bool`, `source`, `select`, `timeframe`, `text`, `color`  
Layout: `section` (group title), `inline: true` (legacy same-row numbers), `type: "row"` (checkbox + field), `type: "inlinePair"` (two fields side by side, e.g. Bullish | Bearish colors)

**Status line** — each input can set `showInStatusLine` (default `true` for `int`, `float`, `select`, `source`, `timeframe`, `text`; default `false` for `bool` and `color` unless set to `true`). Values appear as chips after the study title (TradingView-style). Override entirely with `static legendParams(instance)`. Global toggle: Style → **Inputs in status line**.

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

Copy `TemplateIndicator.js` to get started (`enabled: false` by default).

---

## Troubleshooting

- **Not in library** — `enabled: true` and listed in `definitions/index.js`
- **No labels** — need `onBar` + `this.drawLabel()` + `overlayPrimitive: "labels"`
- **No lines** — `this.plot("plotId", value)` must match a `plots[].id`

See also: [README.md](../README.md)
