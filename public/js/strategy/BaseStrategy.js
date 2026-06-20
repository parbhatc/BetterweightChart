import { BarScriptIndicator } from "../indicators/BarScriptIndicator.js";
import { runStrategyScript } from "./runtime.js";
import {
  DEFAULT_BACKTEST_RANGE_ID,
  filterBacktestBars,
  backtestRangeSatisfied,
} from "./backtestRange.js";
import { getBacktestBars } from "./backtestBarCache.js";
/** @typedef {import("../indicators/types.js").IndicatorInstance} IndicatorInstance */

/**
 * Base class for overlay strategies (Pine `strategy()`). Subclass like indicators:
 *
 * @example
 * class MyStrategy extends BaseStrategy {
 *   constructor() {
 *     super("my_strategy", "My", "My Strategy");
 *     this.setPlots([...]).setInputs([...]).setProperties([...]);
 *   }
 *   onBar(bar) { ... }
 * }
 * BaseStrategy.define(MyStrategy);
 */
export class BaseStrategy extends BarScriptIndicator {
  static kind = "strategy";
  static priceOverlay = true;

  /** @type {import("../indicators/types.js").InputFieldDef[]} */
  static propertyDefs = [];

  /** @param {import("../indicators/types.js").InputFieldDef[]} defs */
  setProperties(defs) {
    this.constructor.propertyDefs = defs;
    return this;
  }

  /** @returns {object} */
  defaultProperties() {
    const out = {};
    for (const field of this.constructor.propertyDefs) {
      if (field.defval !== undefined) out[field.id] = field.defval;
    }
    return out;
  }

  /** @returns {object} */
  static defaultProperties() {
    if (this._hasInstanceHook("defaultProperties")) {
      return this._definitionInstance.defaultProperties();
    }
    const out = {};
    for (const field of this.propertyDefs) {
      if (field.defval !== undefined) out[field.id] = field.defval;
    }
    return out;
  }

  /** @returns {import("../indicators/types.js").InputFieldDef[]} */
  static propertySchema() {
    return this.propertyDefs ?? [];
  }

  /** @param {number} paneIndex @returns {IndicatorInstance | null} */
  static createInstance(paneIndex) {
    const inst = super.createInstance(paneIndex);
    if (!inst) return null;
    return {
      ...inst,
      properties: { ...this.defaultProperties() },
      backtestRange: { id: DEFAULT_BACKTEST_RANGE_ID },
    };
  }

  /** @param {object} instance @param {object | null} symbolInfo */
  static resolveProperties(instance, symbolInfo = null) {
    const base = { ...(instance.properties ?? {}) };
    const pv = Number(symbolInfo?.pointvalue);
    if (Number.isFinite(pv) && pv > 0) base.pointValue = pv;
    else if (!Number.isFinite(Number(base.pointValue))) base.pointValue = 1;
    return base;
  }

  /** @param {string[]} plotIds @param {IndicatorInstance} instance @param {object[]} utcBars @param {object[]} chartBars @param {object | null} symbolInfo */
  static _runStrategy(plotIds, instance, utcBars, chartBars, symbolInfo) {
    const bars = utcBars ?? instance._lastBars ?? [];
    const chart = chartBars?.length ? chartBars : bars;
    return runStrategyScript({
      utcBars: bars,
      chartBars: chart,
      inputs: instance.inputs,
      style: instance.style,
      properties: this.resolveProperties(instance, symbolInfo),
      plotIds,
      symbolInfo,
      instance,
      init: this.prototype.init,
      onBar: this.prototype.onBar,
    });
  }

  /**
   * @param {object[]} bars
   * @param {IndicatorInstance} instance
   * @param {{ symbolInfo?: object | null, chartBars?: object[], chart?: import("lightweight-charts").IChartApi, symbol?: string, resolution?: string, barSec?: number, backtestLoading?: boolean }} [ctx]
   */
  static compute(bars, instance, ctx = {}) {
    const symbolInfo = ctx.symbolInfo ?? instance._symbolInfo ?? null;
    const backtestRange = instance.backtestRange ?? { id: DEFAULT_BACKTEST_RANGE_ID };
    const barSec = ctx.barSec ?? 60;
    const plotIds = this.activePlots(instance.inputs, instance.style).map((p) => p.id);
    const primary = this.primaryPlot ?? this.primaryPlotKey ?? plotIds[0] ?? "main";

    if (typeof this.prototype.onBar !== "function") {
      return { [primary]: [] };
    }

    const cached =
      ctx.symbol && ctx.resolution ? getBacktestBars(ctx.symbol, ctx.resolution) : null;
    const cacheReady =
      cached?.utcBars?.length &&
      (cached.complete || backtestRangeSatisfied(cached.utcBars, backtestRange, ctx.chart ?? null, barSec));

    if (ctx.backtestLoading && !cacheReady) {
      return instance.lastPlots ?? { [primary]: [] };
    }

    let utcBars = bars;
    let chartBars = ctx.chartBars ?? bars;
    if (cacheReady) {
      utcBars = cached.utcBars;
      chartBars = cached.chartBars;
    }

    instance._lastBars = utcBars;
    const filtered = filterBacktestBars(utcBars, chartBars, backtestRange, ctx.chart ?? null);

    if (!filtered.utcBars.length) {
      return instance.lastPlots ?? { [primary]: [] };
    }

    const result = this._runStrategy(
      plotIds,
      instance,
      filtered.utcBars,
      filtered.chartBars,
      symbolInfo,
    );
    instance.backtest = result.report;
    instance._backtestBars = filtered.utcBars;
    return result.plots;
  }
}
