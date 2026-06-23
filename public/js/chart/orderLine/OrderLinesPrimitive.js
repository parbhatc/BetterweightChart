import { safePriceToY } from "../coords/timeScale.js";
import { lineStyleDashPattern } from "../line/style.js";
import {
  drawOrderLineAxisPriceBadge,
  layoutOrderLineGeometry,
  orderLineCenterY,
  ORDER_LINE_ROW_H,
  ORDER_LINE_WIDTH,
  resolveOrderLineAxisBadgePositions,
} from "./rowLayout.js";

export class OrderLinesPrimitive {
  /**
   * @param {() => import("./types.js").OrderLineState[]} getStates
   * @param {(layouts: import("./types.js").OrderLineLayout[]) => void} [onAfterLayout]
   * @param {() => { useStacked?: boolean, getReservedAnchors?: () => { price: number, labelHeight?: number }[] }} [getAxisLabelConfig]
   */
  constructor(getStates, onAfterLayout, getAxisLabelConfig) {
    this._getStates = getStates;
    this._onAfterLayout = onAfterLayout ?? null;
    this._getAxisLabelConfig = getAxisLabelConfig ?? (() => ({ useStacked: false }));
    /** @type {import("lightweight-charts").IChartApi | null} */
    this._chart = null;
    /** @type {import("lightweight-charts").ISeriesApi | null} */
    this._series = null;
    /** @type {(() => void) | null} */
    this._requestUpdate = null;
    this._paneView = new OrderLinesPaneView(this);
    this._axisPaneView = new OrderLinesAxisPaneView(this);
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
    return [this._paneView];
  }

  priceAxisPaneViews() {
    return [this._axisPaneView];
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

    const range = chart.timeScale().getVisibleLogicalRange();

    /** @type {import("./types.js").OrderLineLayout[]} */
    const out = [];
    for (const state of this._getStates()) {
      if (state.removed) continue;
      if (!Number.isFinite(state.price)) continue;
      const y = safePriceToY(series, state.price);
      if (y == null || y < -ORDER_LINE_ROW_H || y > paneH + ORDER_LINE_ROW_H) continue;

      const geom = layoutOrderLineGeometry(state, paneW, scaleW);

      let lineStartX = 0;
      let lineEndX = paneW;
      if (!state.lineFullWidth && range && Number.isFinite(range.to)) {
        const logical = range.to - (state.lineLength ?? 8);
        const coord = chart.timeScale().logicalToCoordinate(logical);
        if (coord != null && Number.isFinite(coord)) {
          lineStartX = Math.max(0, coord);
        }
      }
      if (state.pillSide === "left") {
        lineStartX = Math.max(lineStartX, geom.rowLeft + geom.totalW);
      } else if (geom.rowLeft > 0 && lineStartX >= geom.rowLeft) {
        lineStartX = 0;
      }

      out.push({
        state,
        y,
        lineStartX,
        ...geom,
        lineEndX,
        paneW,
        scaleW,
        paneH,
      });
    }
    return out;
  }
}

class OrderLinesPaneView {
  /** @param {OrderLinesPrimitive} source */
  constructor(source) {
    this._source = source;
  }
  zOrder() {
    return "top";
  }
  renderer() {
    return new OrderLinesPaneRenderer(this._source);
  }
}

class OrderLinesPaneRenderer {
  /** @param {OrderLinesPrimitive} source */
  constructor(source) {
    this._source = source;
  }
  draw(target) {
    const layouts = this._source.layoutAll();
    this._source._onAfterLayout?.(layouts);
    if (!layouts.length) return;

    target.useBitmapCoordinateSpace(({ context: ctx, horizontalPixelRatio, verticalPixelRatio }) => {
      for (const layout of layouts) {
        const { state, y, lineStartX, lineEndX } = layout;
        if (lineEndX <= lineStartX) continue;
        const lineWidth = ORDER_LINE_WIDTH;
        const yy = Math.round(orderLineCenterY(y) * verticalPixelRatio);
        const x1 = Math.round(lineStartX * horizontalPixelRatio);
        const x2 = Math.round(lineEndX * horizontalPixelRatio);
        const dash = lineStyleDashPattern(state.lineStyle === 2 ? 2 : 0, lineWidth).map(
          (n) => n * horizontalPixelRatio,
        );

        ctx.save();
        ctx.strokeStyle = state.lineColor;
        ctx.lineWidth = lineWidth * verticalPixelRatio;
        ctx.lineCap = "butt";
        ctx.setLineDash(dash);
        ctx.beginPath();
        ctx.moveTo(x1, yy);
        ctx.lineTo(x2, yy);
        ctx.stroke();
        ctx.restore();
      }
    });
  }
}

class OrderLinesAxisPaneView {
  /** @param {OrderLinesPrimitive} source */
  constructor(source) {
    this._source = source;
  }
  zOrder() {
    return "top";
  }
  renderer() {
    return new OrderLinesAxisPaneRenderer(this._source);
  }
}

class OrderLinesAxisPaneRenderer {
  /** @param {OrderLinesPrimitive} source */
  constructor(source) {
    this._source = source;
  }
  draw(target) {
    const layouts = this._source.layoutAll();
    if (!layouts.length) return;

    const axisConfig = this._source._getAxisLabelConfig?.() ?? {};
    const useStacked = Boolean(axisConfig.useStacked);
    const series = this._source._series;
    const stackedCenters =
      useStacked && series
        ? resolveOrderLineAxisBadgePositions(
            series,
            layouts,
            axisConfig.getReservedAnchors?.() ?? [],
          )
        : null;

    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      for (const layout of layouts) {
        const centerY = stackedCenters?.get(layout.state.id);
        drawOrderLineAxisPriceBadge(
          ctx,
          layout.state,
          layout.y,
          mediaSize.width,
          centerY,
        );
      }
    });
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
