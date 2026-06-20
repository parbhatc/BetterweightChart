/* global LightweightCharts */
import { chartXAt, safePriceToY } from "../utils/timeScaleCoords.js";

/**
 * Canvas primitive — FVG boxes + SMT/EQHL lines tied to series price scale.
 */
export class LiquidityXPrimitive {
  constructor() {
    /** @type {import("./liquidityXEngine.js").LxBox[]} */
    this._boxes = [];
    /** @type {import("./liquidityXEngine.js").LxLine[]} */
    this._lines = [];
    /** @type {number} */
    this._tfSec = 60;
    /** @type {any} */
    this._chart = null;
    /** @type {any} */
    this._series = null;
    /** @type {(() => void) | null} */
    this._requestUpdate = null;
    /** @type {(() => void) | null} */
    this._unsubVisibleRange = null;
    this._paneView = new LiquidityXPaneView(this);
  }

  /** @param {{ boxes?: import("./liquidityXEngine.js").LxBox[]; lines?: import("./liquidityXEngine.js").LxLine[]; tfSec?: number }} data */
  setData(data) {
    this._boxes = data?.boxes ?? [];
    this._lines = data?.lines ?? [];
    if (data?.tfSec != null && data.tfSec > 0) this._tfSec = data.tfSec;
    this._requestUpdate?.();
  }

  /** @param {import("lightweight-charts").SeriesAttachedParameter<import("lightweight-charts").Time>} param */
  attached(param) {
    this._chart = param.chart;
    this._series = param.series;
    this._requestUpdate = param.requestUpdate;
    this._unsubVisibleRange?.();
    this._unsubVisibleRange = param.chart.timeScale().subscribeVisibleLogicalRangeChange(() => {
      this._requestUpdate?.();
    });
  }

  detached() {
    this._unsubVisibleRange?.();
    this._unsubVisibleRange = null;
    this._chart = null;
    this._series = null;
    this._requestUpdate = null;
  }

  updateAllViews() {
    this._requestUpdate?.();
  }

  paneViews() {
    return [this._paneView];
  }

  drawData() {
    const chart = this._chart;
    const series = this._series;
    if (!chart || !series) {
      return { boxes: [], lines: [], seriesData: [], timeToX: () => null, priceToY: () => null };
    }
    const ts = chart.timeScale();
    const seriesData = typeof series.data === "function" ? series.data() : [];
    const tfSec = this._tfSec;
    return {
      boxes: this._boxes,
      lines: this._lines,
      seriesData,
      timeToX: (t) => chartXAt(ts, seriesData, tfSec, undefined, t),
      priceToY: (p) => safePriceToY(series, p),
    };
  }
}

class LiquidityXPaneView {
  /** @param {LiquidityXPrimitive} source */
  constructor(source) {
    this._source = source;
  }

  zOrder() {
    return "bottom";
  }

  renderer() {
    return new LiquidityXPaneRenderer(this._source);
  }
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} x
 * @param {number} y
 * @param {import("./liquidityXEngine.js").LxLine} ln
 */
function drawLxLineLabel(ctx, text, x, y, ln) {
  ctx.font = "600 9px system-ui,Segoe UI,sans-serif";
  ctx.textAlign = "center";
  const metrics = ctx.measureText(text);
  const padX = 4;
  const padY = 2;
  const tw = metrics.width;
  const th = 10;
  let textY;
  let bgTop;
  if (ln.labelStyle === "high") {
    ctx.textBaseline = "bottom";
    textY = y;
    bgTop = textY - th - padY;
  } else if (ln.labelStyle === "low") {
    ctx.textBaseline = "top";
    textY = y;
    bgTop = textY - padY;
  } else {
    ctx.textBaseline = "middle";
    textY = y;
    bgTop = y - th / 2 - padY;
  }
  const bgW = tw + padX * 2;
  const bgH = th + padY * 2;
  const bgLeft = x - bgW / 2;
  if (ln.labelBg) {
    ctx.fillStyle = ln.labelBg;
    ctx.fillRect(bgLeft, bgTop, bgW, bgH);
  }
  ctx.fillStyle = ln.labelColor ?? ln.color;
  ctx.fillText(text, x, textY);
}

class LiquidityXPaneRenderer {
  /** @param {LiquidityXPrimitive} source */
  constructor(source) {
    this._source = source;
  }

  /** @param {import("fancy-canvas").CanvasRenderingTarget2D} target */
  draw(target) {
    const { boxes, lines, timeToX, priceToY } = this._source.drawData();
    if (!boxes.length && !lines.length) return;

    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      const paneRightX = mediaSize.width > 0 ? mediaSize.width - 0.5 : null;

      for (const b of boxes) {
        const x1 = timeToX(b.startTime);
        let x2 = timeToX(b.endTime);
        if (b.extendToRight && paneRightX != null) {
          x2 = paneRightX;
        }
        const yTop = priceToY(b.top);
        const yBot = priceToY(b.bottom);
        if (x1 == null || x2 == null || yTop == null || yBot == null) continue;
        const left = Math.min(x1, x2);
        const w = Math.max(1, Math.abs(x2 - x1));
        const top = Math.min(yTop, yBot);
        const h = Math.max(1, Math.abs(yBot - yTop));
        ctx.save();
        ctx.fillStyle = b.fill;
        ctx.fillRect(left, top, w, h);
        ctx.strokeStyle = b.border;
        ctx.lineWidth = b.dashed ? 1.5 : 1;
        if (b.dashed) ctx.setLineDash([4, 3]);
        ctx.strokeRect(left, top, w, h);
        ctx.setLineDash([]);
        if (b.label && w > 28 && h > 10) {
          ctx.font = "600 9px system-ui,Segoe UI,sans-serif";
          ctx.fillStyle = b.labelColor ?? b.border;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(b.label, left + w / 2, top + h / 2);
        }
        ctx.restore();
      }

      for (const ln of lines) {
        const x1 = timeToX(ln.startTime);
        const x2 = timeToX(ln.endTime);
        const y1 = priceToY(ln.y1);
        const y2 = priceToY(ln.y2);
        if (x1 == null || x2 == null || y1 == null || y2 == null) continue;
        ctx.save();
        ctx.strokeStyle = ln.color;
        ctx.lineWidth = ln.width ?? 2;
        if (ln.dashed) ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.setLineDash([]);
        if (ln.label && ln.labelTime != null && ln.labelY != null) {
          const lx = timeToX(ln.labelTime);
          const ly = priceToY(ln.labelY);
          if (lx != null && ly != null) {
            drawLxLineLabel(ctx, ln.label, lx, ly, ln);
          }
        }
        ctx.restore();
      }
    });
  }
}
