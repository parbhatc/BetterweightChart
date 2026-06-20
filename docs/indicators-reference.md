# Indicator Reference

This document lists each built-in indicator, what it does, and the functions/methods it defines.

## Registry

- Indicator registry file: `public/js/indicators/definitions/index.js`
- Active built-ins:
  - `ema` (`EmaIndicator`)
  - `volume` (`VolumeIndicator`)
  - `rsi` (`RsiIndicator`)
  - `macd` (`MacdIndicator`)
  - `pivot_points_hl` (`PivotPointsHlIndicator`)
  - `fvg` (`FvgIndicator`)
  - `smt` (`SmtIndicator`)
  - `levels` (`LevelsIndicator`)

---

## `EmaIndicator` (`public/js/indicators/definitions/ema/EMAIndicator.js`)

**Purpose**
- Exponential moving average with optional secondary smoothing and optional Bollinger bands around the smoothed output.

**Functions / methods**
- `constructor()`
  - Declares plots (`ema`, `smoothed`, `upper`, `lower`), fill (`bbFill`), and inputs (length/source/offset/smoothing settings).
- `init()`
  - Creates and stores `EmaRings` in `this.state.rings` using current input values.
- `onBar(bar)`
  - Pushes EMA value each bar.
  - Optionally computes smoothed line.
  - Optionally computes Bollinger upper/lower around smoothed line.
- `legendParams(instance)`
  - Returns status params: EMA length and source.
- `mergeStyleDefaults(style, inputs = {})`
  - Applies style defaults, including BB-specific defaults when BB smoothing mode is selected.
- `handleInputChange(inputs, style, changedKey)`
  - Auto-enables related style toggles when smoothing mode changes.

---

## `VolumeIndicator` (`public/js/indicators/definitions/volume/VolumeIndicator.js`)

**Purpose**
- Draws volume histogram with up/down colors and optional moving average line.

**Functions / methods**
- `constructor()`
  - Defines histogram + MA plots and volume inputs.
- `defaultStyle()`
  - Returns full default style config for histogram and MA.
- `computeSeries(bars, inputs, style)`
  - Builds volume array, volume MA (`smoothSeries`), and per-bar histogram colors.
- `formatPlotValue(plotKey, raw)`
  - Human-friendly volume formatting (K/M).
- `legendParams(instance)`
  - Returns MA length for legend.
- `plotStyle(instance, plotKey)`
  - Custom style handling for histogram plot and MA line.
- `valueLabels(instance)`
  - Returns value labels shown in legend/value area.
- `stylePlotRows(_inputValues, _style)`
  - Returns style dialog row definitions.

---

## `RsiIndicator` (`public/js/indicators/definitions/rsi/RsiIndicator.js`)

**Purpose**
- RSI oscillator with optional smoothing, configurable levels, and fill/background rendering.

**Internal helper functions**
- `rsiFromAvg(avgGain, avgLoss)`
  - Converts average gain/loss into RSI value.
- `computeRsi(bars, length, source)`
  - Wilder RSI implementation.

**Class methods**
- `constructor()`
  - Configures RSI plots/fill/inputs and study-pane defaults.
- `defaultStyle()`
  - Full RSI/smoothed/bands/fill style defaults.
- `computeSeries(bars, inputs, style)`
  - Computes RSI line, optional smoothing line, and band level arrays.
- `formatPlotValue(plotKey, raw)`
  - Formats RSI values to 2 decimals.
- `legendParams(instance)`
  - Returns RSI length and source.
- `valueLabels(instance)`
  - Returns label entries for RSI and optional smoothed line.
- `stylePlotRows(inputValues, _style)`
  - Returns style rows for line, bands, and fill controls.
- `getBandFills(instance, chartBars)`
  - Produces pane background fill segments.
- `handleInputChange(inputValues, style, changedKey)`
  - Ensures smoothed line visibility when smoothing is enabled.

---

## `MacdIndicator` (`public/js/indicators/definitions/macd/MacdIndicator.js`)

**Purpose**
- MACD with configurable MA types for oscillator and signal, plus 4-state histogram coloring.

**Internal helper functions**
- `normalizeMaType(type)`
  - Restricts MA type to known valid values.

**Class methods**
- `constructor()`
  - Defines histogram/MACD/signal/zero plots and inputs.
- `defaultStyle()`
  - Returns default style for histogram buckets and lines.
- `computeSeries(bars, inputs, style)`
  - Computes MACD, signal, histogram, histogram colors, and zero-level series.
- `formatPlotValue(plotKey, raw)`
  - Formats MACD/signal/histogram values; hides zero label.
- `legendParams(instance)`
  - Returns source and fast/slow/signal lengths.
- `valueLabels(instance)`
  - Controls which value labels appear (histogram can be hidden).
- `plotStyle(instance, plotKey)`
  - Custom style output for histogram, default for other plots.
- `stylePlotRows(_inputValues, _style)`
  - Style rows for histogram color buckets and MACD/signal/zero lines.

---

## `PivotPointsHlIndicator` (`public/js/indicators/definitions/pivot/PivotPointsHlIndicator.js`)

**Purpose**
- Detects pivot highs/lows and draws labels at confirmed pivot bars.

**Class methods**
- `constructor()`
  - Configures label overlay and pivot left/right inputs for highs and lows.
- `mergeStyleDefaults(style)`
  - Ensures label/text color defaults for high/low labels.
- `legendParams(instance)`
  - Returns left/right settings for high and low pivots.
- `onBar()`
  - Computes pivots and draws high/low labels at `barIndex - rightLen`.

---

## `FvgIndicator` (`public/js/indicators/definitions/fvg/FvgIndicator.js`)

**Purpose**
- Detects and renders fair value gaps (and related states) using a dedicated engine.

**Class methods**
- `constructor()`
  - Configures box/label overlays and FVG input schema.
- `mergeStyleDefaults(style)`
  - Applies sensible defaults for box/label graphics toggles.
- `inputSchema(inputs = {}, chartResolution = "1")`
  - Injects dynamic correlated timeframe options into schema.
- `requiredChartBars(inputs, chartResolution)`
  - Returns required chart bars for FVG logic.
- `collectDataNeeds(instance, pane)`
  - Declares HTF and optional correlated-symbol compare data needs.
- `legendParams(instance, ctx = {})`
  - Legend text for enabled timeframes and optional correlation config.
- `overlayRecomputeExtra(instance, ctx)`
  - Recompute key containing forming OHLC, size filter config, labels config, and compare key.
- `init()`
  - Constructs and initializes `FvgEngine`.
- `onBar()`
  - Delegates per-bar logic to `FvgEngine.onBar()`.

---

## `SmtIndicator` (`public/js/indicators/definitions/smt/SmtIndicator.js`)

**Purpose**
- SMT divergence indicator between primary symbol and compare symbol using pivot highs/lows.

**Class methods**
- `constructor()`
  - Configures line/label overlays and SMT inputs (compare symbol, pivots, visibility, styling).
- `mergeStyleDefaults(style)`
  - Default flags and colors/prefixes for high/low divergence drawings.
- `legendParams(instance, ctx = {})`
  - Returns compare ticker and pivot lengths.
- `overlayRecomputeExtra(instance, ctx)`
  - Recompute key including compare cache key and style-driven rendering fields.
- `collectDataNeeds(instance, pane)`
  - Requests compare symbol chart bars needed for SMT evaluation.
- `init()`
  - Aligns compare series, validates readiness, initializes runtime state fields.
- `onBar()`
  - Detects high/low divergences and draws divergence lines/labels.

---

## `LevelsIndicator` (`public/js/indicators/definitions/levels/LevelsIndicator.js`)

**Purpose**
- Multi-source structural levels indicator (time/session/news/HTF) rendered as overlay lines and labels.

**Class methods**
- `constructor()`
  - Configures line/label graphics and all levels inputs (time, session, pivots, limits, confluence).
- `mergeStyleDefaults(style)`
  - Ensures graphics toggles are enabled by default.
- `requiredChartBars(inputs, chartResolution)`
  - Returns minimum chart bars needed by levels HTF subsystem.
- `collectDataNeeds(instance, pane)`
  - Requests HTF series requirements based on enabled levels/timeframes.
- `overlayPending(instance, ctx)`
  - Returns pending state from HTF and global-news loading.
- `legendParams(instance)`
  - Returns enabled level names (including global enabled news event types).
- `overlayRecomputeExtra(instance, ctx)`
  - Builds overlay cache key from time/session/news state, HTF key, and style/input knobs.
- `overlay(utcBars, chartBars, inputs, style, ctx = {})`
  - Delegates full overlay computation to `LevelsEngine.computeOverlay(...)`.

**Global News Event Types UI (shared with Levels)**

The global **News → Event types** control that Levels uses for PPI/CPI/FOMC release High/Low lines has the same structure as the per-indicator time/session rules:

```html
<div class="tv-ind-settings__tf-rules tv-ind-settings__news-rules" data-news-levels-root data-news-levels-field="global">
  <div class="tv-ind-settings__tf-rules-head">
    <span class="tv-set__field-label">Event types</span>
    <button type="button" class="tv-ind-settings__tf-rule-add" data-news-add>
      <span class="tv-ind-settings__tf-rule-add-icon" aria-hidden="true">+</span>
      Add
    </button>
  </div>
  <div class="tv-ind-settings__news-cols" aria-hidden="true">
    <span></span><span>Label</span><span></span>
  </div>
  <div class="tv-ind-settings__tf-rules-list" data-news-levels-list>
    <!-- Default rows -->
    <div class="tv-ind-settings__news-rule-row" data-news-level-row data-news-id="ppi">
      <div class="tv-ind-settings__tf-rule-enable">
        <button type="button" class="tv-set__check tv-set__check--on" data-news-enabled role="checkbox" aria-checked="true" aria-label="Enable">
          <span class="tv-set__check-box"><!-- CHECK_SVG injected here --></span>
        </button>
      </div>
      <input type="text" class="tv-drawing-settings__input tv-ind-settings__tf-rule-label" data-news-label placeholder="Event type" value="PPI" />
      <button type="button" class="tv-ind-settings__tf-rule-remove" data-news-remove aria-label="Remove">✕</button>
    </div>
    <div class="tv-ind-settings__news-rule-row" data-news-level-row data-news-id="cpi">
      <!-- same structure, value="CPI" -->
    </div>
    <div class="tv-ind-settings__news-rule-row" data-news-level-row data-news-id="fomc">
      <!-- same structure, value="FOMC" -->
    </div>
  </div>
</div>
```

This HTML is generated by `renderNewsLevelsPanel(...)` and is backed by the global news settings store (`public/js/news/settings.js`). Levels reads the resulting enabled rows to decide which releases should birth High/Low lines.

---

## Supporting registries and APIs

### `public/js/indicators/catalog.js`
- `listIndicators()`
  - Returns enabled indicators sorted by title.
- `getIndicatorClass(id)`
  - Gets indicator class by id.
- `registerIndicator(Indicator)`
  - Registers indicator class in runtime registry.
- `createIndicatorInstance(defId, paneIndex)`
  - Creates instance from registered class.
- `getIndicatorDefinition(id)`
  - Deprecated alias to `getIndicatorClass`.

---

## Notes for adding new indicators

- Add new class file under `public/js/indicators/definitions/<name>/`.
- Register it in `public/js/indicators/definitions/index.js`.
- If it needs external data (HTF/compare/news), implement `collectDataNeeds(...)`.
- If output depends on extra runtime context, include `overlayRecomputeExtra(...)` so cache invalidates correctly.
