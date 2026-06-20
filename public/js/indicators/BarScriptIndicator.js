import { BaseIndicator } from "./BaseIndicator.js";
import { runBarScript } from "./pineRuntime.js";

/** @typedef {import("./types.js").IndicatorInstance} IndicatorInstance */

/**
 * Per-bar indicators (Pine-style `init` / `onBar`). Extend this class directly — no defineIndicator wrapper.
 *
 * @example
 * export class EmaIndicator extends BarScriptIndicator {
 *   constructor() {
 *     super("ema", "EMA", "Moving Average Exponential");
 *     this.setPrimaryPlot("ema")
 *       .setPlots([...])
 *       .setInputs([...]);
 *   }
 *   legendParams(instance) { return [String(instance.inputs.length)]; }
 *   init() { this.state.rings = new EmaRings({ length: this.inputInt("length", 9) }); }
 *   onBar(bar) { this.plot("ema", ...); }
 * }
 * BarScriptIndicator.define(EmaIndicator);
 */
export class BarScriptIndicator extends BaseIndicator {
  static primaryPlotKey = "main";

  static get hasBarInit() {
    return typeof this.prototype.init === "function";
  }

  /** @param {string[]} plotIds @param {IndicatorInstance} instance @param {object[]} utcBars @param {object[]} [chartBars] @param {object | null} symbolInfo @param {string} collect @param {object | null} overlayCtx */
  static _runBarScript(plotIds, instance, utcBars, chartBars, symbolInfo, collect, overlayCtx) {
    const bars = utcBars ?? instance._lastBars ?? [];
    const chart = chartBars?.length ? chartBars : bars;
    return runBarScript({
      utcBars: bars,
      chartBars: chart,
      inputs: instance.inputs,
      style: instance.style,
      plotIds,
      symbolInfo,
      overlayCtx,
      instance,
      init: this.prototype.init,
      onBar: this.prototype.onBar,
      collect,
    });
  }

  /** @param {object[]} bars @param {IndicatorInstance} instance */
  static compute(bars, instance) {
    instance._lastBars = bars;
    const plotIds = this.activePlots(instance.inputs, instance.style).map((p) => p.id);
    const primary = this.primaryPlot ?? this.primaryPlotKey ?? plotIds[0] ?? "main";

    if (typeof this.prototype.onBar !== "function") {
      return { [primary]: [] };
    }

    if (this.overlayPrimitive) {
      return plotIds.length ? { [primary]: [] } : {};
    }

    return this._runBarScript(plotIds, instance, bars, bars, null, "plots", null);
  }

  /**
   * @param {object[]} utcBars
   * @param {object[]} chartBars
   * @param {IndicatorInstance} instance
   * @param {object} [ctx]
   */
  static computeOverlay(utcBars, chartBars, instance, ctx = {}) {
    if (typeof this.prototype.onBar !== "function" || !this.overlayPrimitive) {
      if (this._hasInstanceHook("overlay")) {
        return this._definitionInstance.overlay(utcBars, chartBars, instance.inputs, instance.style, ctx);
      }
      if (typeof this.overlay === "function") {
        return this.overlay(utcBars, chartBars, instance.inputs, instance.style, ctx);
      }
      return [];
    }

    const kind = this.overlayPrimitive;
    const collect = kind === "boxes" ? "boxes" : kind === "lines" ? "lines" : "labels";
    const plotIds = this.plots.map((p) => p.id);
    return this._runBarScript(
      plotIds,
      instance,
      utcBars,
      chartBars,
      ctx.symbolInfo ?? null,
      collect,
      ctx,
    );
  }

  /** @param {object} inputs @param {string} chartResolution */
  static requiredChartBars(inputs, chartResolution) {
    if (this._hasInstanceHook("requiredChartBars")) {
      return this._definitionInstance.requiredChartBars(inputs, chartResolution);
    }
    return undefined;
  }

  /** @param {IndicatorInstance} instance @param {object} ctx */
  static overlayPending(instance, ctx) {
    if (this._hasInstanceHook("overlayPending")) {
      return this._definitionInstance.overlayPending(instance, ctx);
    }
    return undefined;
  }

  /** @param {IndicatorInstance} instance @param {object} ctx */
  static overlayRecomputeExtra(instance, ctx) {
    if (this._hasInstanceHook("overlayRecomputeExtra")) {
      return this._definitionInstance.overlayRecomputeExtra(instance, ctx);
    }
    return undefined;
  }
}