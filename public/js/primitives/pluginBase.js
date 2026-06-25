/**
 * @typedef {import("lightweight-charts").DataChangedScope} DataChangedScope
 * @typedef {import("lightweight-charts").IChartApi} IChartApi
 * @typedef {import("lightweight-charts").ISeriesApi} ISeriesApi
 * @typedef {import("lightweight-charts").ISeriesPrimitive} ISeriesPrimitive
 * @typedef {import("lightweight-charts").SeriesAttachedParameter} SeriesAttachedParameter
 * @typedef {import("lightweight-charts").Time} Time
 */

/**
 * Base for ISeriesPrimitive plugins — mirrors the official lightweight-charts plugin pattern.
 * @implements {ISeriesPrimitive<Time>}
 */
export class PluginBase {
  constructor() {
    /** @type {IChartApi | undefined} */
    this._chart = undefined;
    /** @type {ISeriesApi | undefined} */
    this._series = undefined;
    /** @type {(() => void) | undefined} */
    this._requestUpdate = undefined;
    /** @type {(scope: DataChangedScope) => void} */
    this._fireDataUpdated = (scope) => {
      this.dataUpdated?.(scope);
    };
  }

  /** @param {SeriesAttachedParameter<Time>} param */
  attached({ chart, series, requestUpdate }) {
    this._chart = chart;
    this._series = series;
    this._requestUpdate = requestUpdate;
    series.subscribeDataChanged(this._fireDataUpdated);
    this.requestUpdate();
  }

  detached() {
    this._series?.unsubscribeDataChanged(this._fireDataUpdated);
    this._chart = undefined;
    this._series = undefined;
    this._requestUpdate = undefined;
  }

  requestUpdate() {
    this._requestUpdate?.();
  }

  /** @returns {IChartApi} */
  get chart() {
    if (!this._chart) throw new Error("Plugin is not attached to a chart");
    return this._chart;
  }

  /** @returns {ISeriesApi} */
  get series() {
    if (!this._series) throw new Error("Plugin is not attached to a series");
    return this._series;
  }

  /** @param {DataChangedScope} _scope */
  dataUpdated(_scope) {
    // Optional — override in subclasses.
  }
}
