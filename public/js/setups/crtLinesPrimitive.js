/* global LightweightCharts */

import { TF_MAP } from "../core/constants.js";
import { chartXAt, chartVisibleRightX, safePriceToY } from "../utils/timeScaleCoords.js";

/** @typedef {import("../levels/levelsCalc.js").LiqLine & { dashed?: boolean }} CrtLine */

export const CRT_HIGH_COLOR = "#22d3ee";
export const CRT_LOW_COLOR = "#fb7185";
export const SWEEP_HIGH_COLOR = "#4ade80";
export const SWEEP_LOW_COLOR = "#f97316";

export class CrtLinesPrimitive {
  constructor() {
    /** @type {CrtLine[]} */
    this._lines = [];
    /** @type {any} */
    this._chart = null;
    /** @type {any} */
    this._series = null;
    /** @type {(() => void) | null} */
    this._requestUpdate = null;
    /** @type {() => { time: number }[]} */
    this._getSeriesData = () => [];
    /** @type {() => string} */
    this._getTf = () => "1m";
    this._paneView = new CrtPaneView(this);
    /** @type {(() => void) | null} */
    this._visibleRangeHandler = null;
  }

  /** @param {CrtLine[]} lines */
  setLines(lines) {
    this._lines = lines ?? [];
    this._requestUpdate?.();
  }

  /**
   * @param {() => { time: number }[]} getSeriesData
   * @param {() => string} getTf
   */
  setCoordHelpers(getSeriesData, getTf) {
    this._getSeriesData = getSeriesData;
    this._getTf = getTf;
    this._requestUpdate?.();
  }

  /** @param {import("lightweight-charts").SeriesAttachedParameter<import("lightweight-charts").Time>} param */
  attached(param) {
    this._chart = param.chart;
    this._series = param.series;
    this._requestUpdate = param.requestUpdate;
    this._visibleRangeHandler = () => this._requestUpdate?.();
    this._chart?.timeScale?.()?.subscribeVisibleLogicalRangeChange?.(this._visibleRangeHandler);
  }

  detached() {
    if (this._chart && this._visibleRangeHandler) {
      this._chart.timeScale?.()?.unsubscribeVisibleLogicalRangeChange?.(this._visibleRangeHandler);
    }
    this._chart = null;
    this._series = null;
    this._requestUpdate = null;
    this._visibleRangeHandler = null;
  }

  updateAllViews() {}

  paneViews() {
    return [this._paneView];
  }

  drawData() {
    const chart = this._chart;
    const series = this._series;
    if (!chart || !series) {
      return { lines: [], xAt: () => null, rightX: () => null, priceToY: () => null };
    }
    const ts = chart.timeScale();
    const seriesData = this._getSeriesData() ?? [];
    const tfSec = TF_MAP[this._getTf()] ?? 60;
    return {
      lines: this._lines,
      xAt: (t) => chartXAt(ts, seriesData, tfSec, null, t),
      rightX: () => chartVisibleRightX(ts),
      priceToY: (p) => safePriceToY(series, p),
    };
  }
}

class CrtPaneView {
  /** @param {CrtLinesPrimitive} source */
  constructor(source) {
    this._source = source;
  }

  zOrder() {
    return "top";
  }

  renderer() {
    return new CrtPaneRenderer(this._source);
  }
}

class CrtPaneRenderer {
  /** @param {CrtLinesPrimitive} source */
  constructor(source) {
    this._source = source;
  }

  /** @param {import("fancy-canvas").CanvasRenderingTarget2D} target */
  draw(target) {
    const { lines, xAt, rightX, priceToY } = this._source.drawData();
    if (!lines.length) return;

    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      for (const lvl of lines) {
        const x1 = xAt(lvl.startTime);
        let x2 = xAt(lvl.endTime) ?? rightX();
        if (x1 == null) continue;
        if (x2 == null) x2 = mediaSize.width - 6;

        const y = priceToY(lvl.price);
        if (y == null) continue;

        const left = Math.min(x1, x2);
        const right = Math.max(x1, x2, left + 24);
        const color = lvl.color || "#94a3b8";
        const lw = lvl.lineWidth || 2;

        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = lw;
        ctx.globalAlpha = 0.95;
        ctx.setLineDash(lvl.dashed ? [5, 4] : []);
        ctx.beginPath();
        ctx.moveTo(left, y);
        ctx.lineTo(right, y);
        ctx.stroke();

        if (lvl.label) {
          ctx.font = "600 10px system-ui,Segoe UI,sans-serif";
          ctx.fillStyle = color;
          ctx.textBaseline = "middle";
          ctx.fillText(lvl.label, right + 4, y);
        }
        ctx.restore();
      }
    });
  }
}
