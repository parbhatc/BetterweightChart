import { barSourceValue } from "./math/source.js";
import { pivotHighAt, pivotLowAt } from "./math/pivots.js";

/** @param {number} price @param {object | null | undefined} symbolInfo */
function formatPrice(price, symbolInfo) {
  const scale = symbolInfo?.pricescale ?? 100;
  const minmov = symbolInfo?.minmov ?? 1;
  const decimals = Math.max(2, Math.round(Math.log10(scale / minmov)));
  return Number(price).toFixed(decimals);
}

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
  const { utcBars, chartBars, inputs, style, plotIds, symbolInfo = null } = opts;

  /** @type {Record<string, Array<number | null>>} */
  const plots = Object.fromEntries(plotIds.map((id) => [id, []]));
  /** @type {object[]} */
  const labels = [];
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
    labels,

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
      price: (n) => formatPrice(n, symbolInfo),
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
  };

  return { ctx, plots, labels };
}

/**
 * @typedef {object} BarScriptContext
 * @property {number} index — 0-based bar index (Pine `bar_index`)
 * @property {object} bar — current OHLCV bar
 * @property {object} inputs — study inputs
 * @property {object} style — study style colors
 * @property {Record<string, unknown>} state — persists across bars (Pine `var`)
 * @property {object[]} bars — full series for lookback
 * @property {object[]} labels — labels collected this run (overlay mode)
 * @property {{ pivotHigh: (left: number, right: number) => number | null, pivotLow: (left: number, right: number) => number | null, source: (bar?: object, field?: string) => number | null }} math
 * @property {{ price: (n: number) => string }} format
 * @property {(plotKey: string, value: number | null) => void} plot
 * @property {(label: object) => void} drawLabel
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
 * @param {() => void} [opts.init]
 * @param {(this: BarScriptContext, bar: object, index: number) => void} opts.onBar
 * @param {"plots" | "labels"} [opts.collect]
 */
export function runBarScript(opts) {
  const { utcBars, chartBars, init, onBar, collect = "plots" } = opts;
  const { ctx, plots, labels } = createBarScriptContext(opts);

  init?.call(ctx);

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

  return collect === "labels" ? labels : plots;
}
