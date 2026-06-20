import { safePriceToY } from "../coords/timeScale.js";
import { lineStyleDashPattern } from "../line/style.js";

const FONT =
  "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif";
const ROW_H = 20;
const CANCEL_W = 20;
const GAP = 2;
const PAD_X = 8;

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @param {number} r
 */
function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} fontSize
 */
function textWidth(ctx, text, fontSize) {
  ctx.font = `600 ${fontSize}px ${FONT}`;
  return ctx.measureText(text).width;
}

export class OrderLinesPrimitive {
  /** @param {() => import("./types.js").OrderLineState[]} getStates */
  constructor(getStates) {
    this._getStates = getStates;
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
    const scaleId = "right";
    const scaleW = chart.priceScale(scaleId).width();
    if (scaleW <= 0) return [];

    const range = chart.timeScale().getVisibleLogicalRange();
    const plotRight = paneW;

    /** @type {import("./types.js").OrderLineLayout[]} */
    const out = [];
    for (const state of this._getStates()) {
      if (state.removed) continue;
      const y = safePriceToY(series, state.price);
      if (y == null || y < -ROW_H || y > paneH + ROW_H) continue;

      let lineStartX = 0;
      if (range && Number.isFinite(range.to)) {
        const logical = range.to - state.lineLength;
        const coord = chart.timeScale().logicalToCoordinate(logical);
        if (coord != null && Number.isFinite(coord)) {
          lineStartX = Math.max(0, Math.min(plotRight, coord));
        }
      }

      out.push({
        state,
        y,
        lineStartX,
        plotRight,
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
    if (!layouts.length) return;

    target.useBitmapCoordinateSpace(({ context: ctx, horizontalPixelRatio, verticalPixelRatio }) => {
      for (const layout of layouts) {
        const { state, y, lineStartX, plotRight } = layout;
        const lineWidth = 1;
        const yy =
          Math.round(y * verticalPixelRatio) + ((lineWidth * verticalPixelRatio) % 2 ? 0.5 : 0);
        const x1 = Math.round(lineStartX * horizontalPixelRatio);
        const x2 = Math.round(plotRight * horizontalPixelRatio);
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
    return new OrderLinesAxisRenderer(this._source);
  }
}

class OrderLinesAxisRenderer {
  /** @param {OrderLinesPrimitive} source */
  constructor(source) {
    this._source = source;
  }
  draw(target) {
    const layouts = this._source.layoutAll();
    if (!layouts.length) return;

    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      const scaleW = mediaSize.width;
      for (const layout of layouts) {
        drawOrderLineAxisRow(ctx, layout, scaleW);
      }
    });
  }
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import("./types.js").OrderLineLayout} layout
 * @param {number} scaleW
 */
function drawOrderLineAxisRow(ctx, layout, scaleW) {
  const { state, y } = layout;
  const fontSize = 11;
  const bodyText = state.text || " ";
  const qtyText = state.quantity || "";

  ctx.font = `600 ${fontSize}px ${FONT}`;
  const bodyW = Math.max(36, textWidth(ctx, bodyText, fontSize) + PAD_X * 2);
  const qtyW = qtyText ? Math.max(28, textWidth(ctx, qtyText, fontSize) + PAD_X * 2) : 0;
  const totalW = bodyW + (qtyW ? GAP + qtyW : 0) + GAP + CANCEL_W;
  const top = Math.round(y - ROW_H / 2);
  let x = scaleW - totalW;

  ctx.save();

  ctx.fillStyle = state.bodyBackgroundColor;
  ctx.strokeStyle = state.bodyBorderColor;
  ctx.lineWidth = 1;
  roundRect(ctx, x, top, bodyW, ROW_H, 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = state.bodyTextColor;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(bodyText, x + bodyW / 2, top + ROW_H / 2);
  x += bodyW + GAP;

  if (qtyW) {
    ctx.fillStyle = state.quantityBackgroundColor;
    ctx.strokeStyle = state.quantityBorderColor;
    roundRect(ctx, x, top, qtyW, ROW_H, 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = state.quantityTextColor;
    ctx.fillText(qtyText, x + qtyW / 2, top + ROW_H / 2);
    x += qtyW + GAP;
  }

  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = state.cancelButtonBorderColor;
  roundRect(ctx, x, top, CANCEL_W, ROW_H, 2);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = state.cancelButtonIconColor;
  ctx.lineWidth = 1.5;
  const cx = x + CANCEL_W / 2;
  const cy = top + ROW_H / 2;
  const s = 4;
  ctx.beginPath();
  ctx.moveTo(cx - s, cy - s);
  ctx.lineTo(cx + s, cy + s);
  ctx.moveTo(cx + s, cy - s);
  ctx.lineTo(cx - s, cy + s);
  ctx.stroke();

  ctx.restore();
}

/**
 * @typedef {object} OrderLineLayout
 * @property {import("./types.js").OrderLineState} state
 * @property {number} y
 * @property {number} lineStartX
 * @property {number} plotRight
 * @property {number} scaleW
 * @property {number} paneH
 */
