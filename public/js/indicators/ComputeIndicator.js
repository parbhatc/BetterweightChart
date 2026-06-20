import { BaseIndicator } from "./BaseIndicator.js";

/** @typedef {import("./types.js").IndicatorInstance} IndicatorInstance */

/**
 * Batch-compute indicators. Implement `static computeSeries(bars, inputs, style, instance)`.
 *
 * @example
 * export class RsiIndicator extends ComputeIndicator {
 *   static computeSeries(bars, inputs, style) {
 *   computeSeries(bars, inputs, style) { ... }
 *   }
 * }
 */
export class ComputeIndicator extends BaseIndicator {
  /** @param {object[]} bars @param {IndicatorInstance} instance */
  static compute(bars, instance) {
    if (this._hasInstanceHook("computeSeries")) {
      return this._definitionInstance.computeSeries(bars, instance.inputs, instance.style, instance);
    }
    throw new Error(`${this.name}.computeSeries() is not implemented`);
  }
}
