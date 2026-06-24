import { safePriceToY } from "../coords/timeScale.js";
import { orderLineOverlayState } from "./orderLinePriceLineSync.js";
import {
  layoutOrderLineGeometry,
  orderLineCenterY,
  ORDER_LINE_ROW_H,
} from "./rowLayout.js";

/** Layout-only primitive — lines render via custom price line sync. */
export class OrderLinesPrimitive {
  /**
   * @param {() => import("./types.js").OrderLineState[]} getStates
   * @param {(layouts: import("./types.js").OrderLineLayout[]) => void} [onAfterLayout]
   */
  constructor(getStates, onAfterLayout) {
    this._getStates = getStates;
    this._onAfterLayout = onAfterLayout ?? null;
    /** @type {import("lightweight-charts").IChartApi | null} */
    this._chart = null;
    /** @type {import("lightweight-charts").ISeriesApi | null} */
    this._series = null;
    /** @type {(() => void) | null} */
    this._requestUpdate = null;
    /** @type {(() => void) | null} */
    this._unsub = null;
  }

  /** @param {import("lightweight-charts").SeriesAttachedParameter} param */
  attached(param) {
    this._chart = param.chart;
    this._series = param.series;
    this._requestUpdate = param.requestUpdate;
    const ts = this._chart.timeScale();
    const onRange = () => this._requestUpdate?.();
    ts.subscribeVisibleLogicalRangeChange(onRange);
    this._unsub = () => ts.unsubscribeVisibleLogicalRangeChange(onRange);
    const kick = () => this._requestUpdate?.();
    queueMicrotask(kick);
    requestAnimationFrame(kick);
  }

  detached() {
    this._unsub?.();
    this._unsub = null;
    this._chart = null;
    this._series = null;
    this._requestUpdate = null;
  }

  requestRefresh() {
    this._requestUpdate?.();
  }

  updateAllViews() {}

  paneViews() {
    return [new OrderLinesLayoutPaneView(this)];
  }

  priceAxisPaneViews() {
    return [];
  }

  /** @returns {import("./types.js").OrderLineLayout[]} */
  layoutAll() {
    const chart = this._chart;
    const series = this._series;
    if (!chart || !series) return [];

    const paneSize = chart.paneSize();
    const paneW = paneSize.width;
    const paneH = paneSize.height;
    const scaleW = chart.priceScale("right").width();
    if (scaleW <= 0) return [];

    /** @type {import("./types.js").OrderLineLayout[]} */
    const out = [];
    for (const state of this._getStates()) {
      if (state.removed) continue;
      if (!Number.isFinite(state.price)) continue;
      const y = safePriceToY(series, state.price);
      if (y == null || y < -ORDER_LINE_ROW_H || y > paneH + ORDER_LINE_ROW_H) continue;

      const overlayState = orderLineOverlayState(state);
      const geom = layoutOrderLineGeometry(overlayState, paneW, scaleW);

      out.push({
        state,
        y,
        lineStartX: 0,
        lineEndX: paneW,
        ...geom,
        paneW,
        scaleW,
        paneH,
      });
    }
    return out;
  }
}

class OrderLinesLayoutPaneView {
  /** @param {OrderLinesPrimitive} source */
  constructor(source) {
    this._source = source;
  }
  zOrder() {
    return "top";
  }
  renderer() {
    return new OrderLinesLayoutPaneRenderer(this._source);
  }
}

class OrderLinesLayoutPaneRenderer {
  /** @param {OrderLinesPrimitive} source */
  constructor(source) {
    this._source = source;
  }
  draw() {
    const layouts = this._source.layoutAll();
    this._source._onAfterLayout?.(layouts);
  }
}

/**
 * @typedef {object} OrderLineLayout
 * @property {import("./types.js").OrderLineState} state
 * @property {number} y
 * @property {number} lineStartX
 * @property {number} lineEndX
 * @property {number} rowLeft
 * @property {number} totalW
 * @property {number} plotEdge
 * @property {number} paneW
 * @property {number} scaleW
 * @property {number} paneH
 */
