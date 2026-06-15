import { safePriceToY } from "../../chart/coords/timeScale.js";
import { formatBarCloseCountdown, secondsUntilBarClose } from "../../chart/bar/countdown.js";
import { lineStyleDashPattern, SYMBOL_PRICE_LINE_STYLE } from "../../chart/line/style.js";

const PRICE_ROW_H = 18;
const COUNTDOWN_ROW_H = 16;
const FONT =
  "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif";

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @param {number} rtl
 * @param {number} rtr
 * @param {number} rbr
 * @param {number} rbl
 */
function roundRect(ctx, x, y, w, h, rtl, rtr, rbr, rbl) {
  const maxR = Math.min(w / 2, h / 2);
  const tl = Math.min(rtl, maxR);
  const tr = Math.min(rtr, maxR);
  const br = Math.min(rbr, maxR);
  const bl = Math.min(rbl, maxR);
  ctx.beginPath();
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + tr);
  ctx.lineTo(x + w, y + h - br);
  ctx.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
  ctx.lineTo(x + bl, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - bl);
  ctx.lineTo(x, y + tl);
  ctx.quadraticCurveTo(x, y, x + tl, y);
  ctx.closePath();
}

export class PriceLineLabelPrimitive {
  constructor() {
    /** @type {import("lightweight-charts").IChartApi | null} */
    this._chart = null;
    /** @type {import("lightweight-charts").ISeriesApi | null} */
    this._series = null;
    /** @type {(() => void) | null} */
    this._requestUpdate = null;
    /** @type {() => object} */
    this._getState = () => ({ enabled: false });
    this._paneView = new PriceLinePaneView(this);
    this._axisPaneView = new PriceLineAxisPaneView(this);
    /** @type {(() => void) | null} */
    this._unsub = null;
    /** @type {ReturnType<typeof setInterval> | null} */
    this._tickTimer = null;
  }

  /** @param {() => object} fn */
  setStateProvider(fn) {
    this._getState = fn;
  }

  requestRefresh() {
    this._requestUpdate?.();
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
    this._tickTimer = window.setInterval(() => this._requestUpdate?.(), 1000);
  }

  detached() {
    this._unsub?.();
    this._unsub = null;
    if (this._tickTimer) {
      clearInterval(this._tickTimer);
      this._tickTimer = null;
    }
    this._chart = null;
    this._series = null;
    this._requestUpdate = null;
  }

  updateAllViews() {}

  paneViews() {
    return [this._paneView];
  }

  priceAxisPaneViews() {
    return [this._axisPaneView];
  }

  layoutData() {
    const state = this._getState();
    const chart = this._chart;
    const series = this._series;
    if (!state.enabled || !state.scaleVisible || !chart || !series) {
      return { visible: false };
    }

    const price = state.price;
    if (price == null || !Number.isFinite(price)) return { visible: false };

    const y = safePriceToY(series, price);
    if (y == null) return { visible: false };

    const paneSize = chart.paneSize();
    const paneH = paneSize.height;
    const paneW = paneSize.width;
    if (y < 0 || y > paneH) return { visible: false };

    const scaleId = state.scaleId ?? "right";
    const scaleW = chart.priceScale(scaleId).width();
    if (scaleW <= 0) return { visible: false };

    return {
      visible: true,
      y,
      color: state.color,
      priceText: state.priceText,
      countdownText: formatBarCloseCountdown(secondsUntilBarClose(state.barSec)),
      lineVisible: Boolean(state.lineVisible),
      lineWidth: Math.max(1, Number(state.lineWidth) || 1),
      scaleId,
      plotLeft: 0,
      plotRight: paneW,
      scaleW,
      paneH,
    };
  }
}

class PriceLinePaneView {
  /** @param {PriceLineLabelPrimitive} source */
  constructor(source) {
    this._source = source;
  }

  zOrder() {
    return "top";
  }

  renderer() {
    return new PriceLinePaneRenderer(this._source);
  }
}

class PriceLinePaneRenderer {
  /** @param {PriceLineLabelPrimitive} source */
  constructor(source) {
    this._source = source;
  }

  draw(target) {
    const data = this._source.layoutData();
    if (!data.visible || !data.lineVisible) return;

    target.useBitmapCoordinateSpace(({ context: ctx, horizontalPixelRatio, verticalPixelRatio }) => {
      const lineWidth = data.lineWidth;
      const y =
        Math.round(data.y * verticalPixelRatio) + ((lineWidth * verticalPixelRatio) % 2 ? 0.5 : 0);
      const x1 = Math.round(data.plotLeft * horizontalPixelRatio);
      const x2 = Math.round(data.plotRight * horizontalPixelRatio);
      const dash = lineStyleDashPattern(SYMBOL_PRICE_LINE_STYLE, lineWidth).map(
        (n) => n * horizontalPixelRatio,
      );

      ctx.save();
      ctx.strokeStyle = data.color;
      ctx.lineWidth = lineWidth * verticalPixelRatio;
      ctx.lineCap = "butt";
      ctx.setLineDash(dash);
      ctx.beginPath();
      ctx.moveTo(x1, y);
      ctx.lineTo(x2, y);
      ctx.stroke();
      ctx.restore();
    });
  }
}

class PriceLineAxisPaneView {
  /** @param {PriceLineLabelPrimitive} source */
  constructor(source) {
    this._source = source;
  }

  zOrder() {
    return "top";
  }

  renderer() {
    return new PriceLineAxisPaneRenderer(this._source);
  }
}

class PriceLineAxisPaneRenderer {
  /** @param {PriceLineLabelPrimitive} source */
  constructor(source) {
    this._source = source;
  }

  draw(target) {
    const data = this._source.layoutData();
    if (!data.visible) return;

    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      const width = mediaSize.width;
      const top = Math.round(data.y - PRICE_ROW_H / 2);
      const totalH = PRICE_ROW_H + COUNTDOWN_ROW_H;
      const onRight = data.scaleId !== "left";
      const rtl = onRight ? 2 : 0;
      const rtr = onRight ? 0 : 2;
      const rbr = onRight ? 0 : 2;
      const rbl = onRight ? 2 : 0;

      ctx.save();
      ctx.fillStyle = data.color;
      roundRect(ctx, 0, top, width, totalH, rtl, rtr, rbr, rbl);
      ctx.fill();

      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      ctx.font = `600 12px ${FONT}`;
      ctx.fillText(data.priceText, width / 2, top + PRICE_ROW_H / 2);

      ctx.font = `600 11px ${FONT}`;
      ctx.fillText(data.countdownText, width / 2, top + PRICE_ROW_H + COUNTDOWN_ROW_H / 2);
      ctx.restore();
    });
  }
}

/**
 * Attach TradingView-style price line + countdown primitive to a series.
 * @param {object} opts
 * @param {import("lightweight-charts").ISeriesApi} opts.series
 * @param {() => object} opts.getState
 */
export function attachPriceLineLabelPrimitive(opts) {
  const primitive = new PriceLineLabelPrimitive();
  primitive.setStateProvider(opts.getState);
  opts.series.attachPrimitive(primitive);
  return {
    requestRefresh: () => primitive.requestRefresh(),
    destroy: () => {
      try {
        opts.series.detachPrimitive(primitive);
      } catch {
        //
      }
    },
  };
}
