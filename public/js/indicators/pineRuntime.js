import { barSourceValue } from "./math/source.js";
import { pivotHighAt, pivotLowAt } from "./math/pivots.js";
import { formatSymbolPrice } from "./symbol.js";
import { getSecuritySeries } from "./security/htfAccess.js";

/**
 * Pine-style bar script context — one bar per callback, `this.plot()` / `this.drawLabel()`.
 *
 * @param {object} opts
 * @param {object[]} opts.utcBars
 * @param {object[]} opts.chartBars
 * @param {object} opts.inputs
 * @param {object} opts.style
 * @param {string[]} opts.plotIds
 * @param {object | null} [opts.symbolInfo]
 */
export function createBarScriptContext(opts) {
  const {
    utcBars,
    chartBars,
    inputs,
    style,
    plotIds,
    symbolInfo = null,
    overlayCtx = null,
    instance = null,
  } = opts;

  /** @type {Record<string, Array<number | null>>} */
  const plots = Object.fromEntries(plotIds.map((id) => [id, []]));
  /** @type {object[]} */
  const labels = [];
  /** @type {object[]} */
  const boxes = [];
  /** @type {object[]} */
  const lines = [];
  /** @type {Record<string, unknown>} */
  const state = {};

  /** @type {BarScriptContext} */
  const ctx = {
    index: 0,
    bar: /** @type {object} */ ({}),
    inputs,
    style,
    state,
    bars: utcBars,
    chartBars,
    overlayCtx,
    instance,
    labels,
    boxes,
    lines,

    math: {
      pivotHigh(left, right) {
        return pivotHighAt(utcBars, ctx.index, left, right);
      },
      pivotLow(left, right) {
        return pivotLowAt(utcBars, ctx.index, left, right);
      },
      source(bar, field = "close") {
        return barSourceValue(bar ?? ctx.bar, field);
      },
    },

    format: {
      price: (n) => formatSymbolPrice(n, symbolInfo),
    },

    plot(key, value) {
      if (!plots[key]) plots[key] = [];
      plots[key][ctx.index] = value ?? null;
    },

    drawLabel(label) {
      const barIndex = label.barIndex ?? ctx.index;
      const time = chartBars[barIndex]?.time;
      if (time == null) return;
      const { barIndex: _barIndex, ...rest } = label;
      labels.push({ ...rest, time });
    },

    drawBox(box) {
      boxes.push(box);
    },

    drawLine(line) {
      lines.push(line);
    },

    /** @param {string} key @param {unknown} [def] */
    getInput(key, def) {
      const v = this.inputs[key];
      return v === undefined || v === null ? def : v;
    },

    /** @param {string} key @param {boolean} [def] */
    getBool(key, def = false) {
      const v = this.inputs[key];
      if (v === undefined || v === null) return def;
      return v !== false;
    },

    /** @param {string} key @param {number} [def] @param {number} [min] */
    getInt(key, def = 1, min = 1) {
      return Math.max(min, Math.floor(Number(this.getInput(key, def)) || def));
    },

    /** @param {string} key @param {number} [def] @param {number} [min] */
    getFloat(key, def = 0, min = 0) {
      return Math.max(min, Number(this.getInput(key, def)) || def);
    },

    /** @param {string} key @param {string} [def] */
    getString(key, def = "") {
      const v = this.getInput(key, def);
      return v == null ? def : String(v);
    },

    /** @param {string} key @param {string} [def] */
    getSource(key, def = "close") {
      return String(this.getInput(key, def) ?? def);
    },

    /** @param {string} key @param {number} [def] @param {number} [min] */
    inputInt(key, def = 1, min = 1) {
      return this.getInt(key, def, min);
    },

    /** @param {string} key @param {number} [def] @param {number} [min] */
    inputFloat(key, def = 0, min = 0) {
      return this.getFloat(key, def, min);
    },

    /** @param {string} [fieldKey] input id for a source field, or omit for default "source" */
    source(fieldKey) {
      const key = fieldKey ?? "source";
      const field = this.getSource(key, "close");
      return this.math.source(this.bar, field);
    },

    request: {
      security(symbol, resolution, countBack = 300) {
        const fn = overlayCtx?.request?.security ?? overlayCtx?.lookupSecurity;
        if (typeof fn === "function") {
          return fn(symbol, resolution, countBack);
        }
        return getSecuritySeries(overlayCtx ?? {}, symbol, resolution);
      },
    },
  };

  return { ctx, plots, labels, boxes, lines };
}

/**
 * @typedef {object} BarScriptContext
 * @property {number} index — 0-based bar index (Pine `bar_index`)
 * @property {object} bar — current OHLCV bar
 * @property {object} inputs — study inputs
 * @property {object} style — study style colors
 * @property {Record<string, unknown>} state — persists across bars (Pine `var`)
 * @property {object[]} bars — full series for lookback
 * @property {object[]} chartBars — chart-time bars (aligned with bars)
 * @property {object | null} overlayCtx — HTF/datafeed helpers (`request.security`, `getHtfBars`, …)
 * @property {{ security: (symbol?: string, resolution?: string, countBack?: number) => object | null }} request
 * @property {object[]} labels — labels collected this run (overlay mode)
 * @property {object[]} boxes — boxes collected this run (overlay mode)
 * @property {object[]} lines — lines collected this run (overlay mode)
 * @property {{ pivotHigh: (left: number, right: number) => number | null, pivotLow: (left: number, right: number) => number | null, source: (bar?: object, field?: string) => number | null }} math
 * @property {{ price: (n: number) => string }} format
 * @property {(plotKey: string, value: number | null) => void} plot
 * @property {(key: string, def?: unknown) => unknown} getInput
 * @property {(key: string, def?: boolean) => boolean} getBool
 * @property {(key: string, def?: number, min?: number) => number} getInt
 * @property {(key: string, def?: number, min?: number) => number} getFloat
 * @property {(key: string, def?: string) => string} getString
 * @property {(key: string, def?: string) => string} getSource
 * @property {(key: string, def?: number, min?: number) => number} inputInt
 * @property {(key: string, def?: number, min?: number) => number} inputFloat
 * @property {(fieldKey?: string) => number | null} source
 * @property {(label: object) => void} drawLabel
 * @property {(box: object) => void} drawBox
 * @property {(line: object) => void} drawLine
 */

/**
 * Run a per-bar script over all bars.
 *
 * @param {object} opts
 * @param {object[]} opts.utcBars
 * @param {object[]} opts.chartBars
 * @param {object} opts.inputs
 * @param {object} opts.style
 * @param {string[]} opts.plotIds
 * @param {object | null} [opts.symbolInfo]
 * @param {import("./types.js").IndicatorInstance} [opts.instance]
 * @param {() => void} [opts.init]
 * @param {(this: BarScriptContext, bar: object, index: number) => void} opts.onBar
 * @param {"plots" | "labels" | "boxes" | "lines"} [opts.collect]
 */
export function runBarScript(opts) {
  const { utcBars, chartBars, init, onBar, collect = "plots", instance } = opts;
  const { ctx, plots, labels, boxes, lines } = createBarScriptContext(opts);

  init?.call(ctx);
  if (instance && init) {
    instance._initPending = ctx.state?.loading === true;
  }

  for (let i = 0; i < utcBars.length; i++) {
    ctx.index = i;
    ctx.bar = utcBars[i];
    for (const id of opts.plotIds) {
      if (!plots[id]) plots[id] = [];
      if (plots[id].length <= i) plots[id].length = i + 1;
      if (plots[id][i] === undefined) plots[id][i] = null;
    }
    onBar.call(ctx, utcBars[i], i);
  }

  for (const id of opts.plotIds) {
    while (plots[id].length < utcBars.length) plots[id].push(null);
  }

  if (collect === "labels") return labels;
  if (collect === "boxes") return boxes;
  if (collect === "lines") return lines;
  return plots;
}
