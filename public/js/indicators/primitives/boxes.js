import { chartTimeToCoordinate, safePriceToY, safeTimeToX } from "../../chart/coords/timeScale.js";
import { applyColorOpacity } from "../../ui/color/picker.js";
import { subscribePrimitiveViewportRefresh } from "../../primitives/viewportRefresh.js";
import { resolveOverlayMapBars } from "./overlayMapBars.js";

const LABEL_FONT =
  `11px -apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif`;

/** @param {object} box @param {number} left @param {number} right @param {number} w @param {(t: number) => number | null} timeToX @param {number} pad */
function labelXInBox(box, left, right, w, timeToX, pad) {
  const lo = left + pad;
  const hi = right - pad;
  if (hi <= lo) return null;

  const align = box.labelAlign ?? "right";
  // Centered labels on fixed-width boxes: pixel midpoint (stable after refresh / time-map updates).
  if (align === "center" && !box.extendRight) {
    return lo + (hi - lo) / 2;
  }

  if (box.labelTime != null && Number.isFinite(box.labelTime)) {
    const x = timeToX(box.labelTime);
    if (x != null && Number.isFinite(x)) return Math.min(hi, Math.max(lo, x));
  }

  if (align === "center") return lo + (hi - lo) / 2;
  if (align === "left") return lo;
  return hi;
}

/** @param {CanvasRenderingContext2D} ctx @param {object} box @param {(t: number) => number | null} timeToX @param {(p: number) => number | null} priceToY @param {number} rightX */
function drawBox(ctx, box, timeToX, priceToY, rightX) {
  const x1 = timeToX(box.timeStart);
  const x2End = box.extendRight ? null : timeToX(box.timeEnd);
  const x2 = box.extendRight ? rightX : x2End;
  const yTop = priceToY(box.priceTop);
  const yBot = priceToY(box.priceBottom);
  if (x1 == null || x2 == null || yTop == null || yBot == null) return;
  // Skip draw when start/end coords disagree (stale mapBars during history restore).
  if (!box.extendRight && x2End != null && x1 > x2End + 2) return;

  const left = Math.min(x1, x2);
  const right = Math.max(x1, x2);
  const top = Math.min(yTop, yBot);
  const bottom = Math.max(yTop, yBot);
  const w = right - left;
  const h = bottom - top;
  if (w < 1 || h < 1) return;

  ctx.save();
  ctx.fillStyle = box.fillColor ?? applyColorOpacity("#2962ff", 10);
  ctx.fillRect(left, top, w, h);

  const bw = Number(box.borderWidth) || 0;
  if (bw > 0 && box.borderColor) {
    ctx.strokeStyle = box.borderColor;
    ctx.lineWidth = bw;
    ctx.setLineDash(Array.isArray(box.borderDash) ? box.borderDash : []);
    ctx.strokeRect(left + bw / 2, top + bw / 2, w - bw, h - bw);
  }

  if (box.showLabel && box.label) {
    ctx.font = LABEL_FONT;
    ctx.fillStyle = box.textColor ?? "#00e676";
    ctx.textBaseline = "middle";
    const midY = top + h / 2;
    const pad = 6;
    const align = box.labelAlign ?? "center";

    let labelX;
    let textAlign;
    if (!box.extendRight && align === "center") {
      // Pixel center — do not use labelTime (time midpoint drifts vs box edges when wait-for-close shifts end).
      labelX = left + w / 2;
      textAlign = "center";
    } else {
      labelX = labelXInBox(box, left, right, w, timeToX, pad);
      if (labelX == null) {
        ctx.restore();
        return;
      }
      textAlign = align === "left" ? "left" : align === "center" ? "center" : "right";
    }

    ctx.textAlign = textAlign;
    const lines = String(box.label).split("\n");
    const lineHeight = 13;
    const blockH = (lines.length - 1) * lineHeight;
    const startY = midY - blockH / 2;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      ctx.fillText(line, labelX, startY + i * lineHeight);
    }
  }
  ctx.restore();
}

class BoxesPaneRenderer {
  /** @param {() => object} getData */
  constructor(getData) {
    this._getData = getData;
  }

  /** @param {import("fancy-canvas").CanvasRenderingTarget2D} target */
  draw(target) {
    const { boxes, timeToX, priceToY } = this._getData();
    if (!boxes?.length) return;

    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      const rightX = mediaSize.width;
      const pad = 4;
      for (const box of boxes) {
        const x1 = timeToX(box.timeStart);
        const x2End = box.extendRight ? null : timeToX(box.timeEnd);
        const x2 = box.extendRight ? rightX : x2End;
        if (x1 == null || x2 == null) continue;
        const left = Math.min(x1, x2);
        const right = Math.max(x1, x2);
        if (right < -pad || left > rightX + pad) continue;
        drawBox(ctx, box, timeToX, priceToY, rightX);
      }
    });
  }
}

class BoxesPaneView {
  /** @param {BoxesPrimitive} source */
  constructor(source) {
    this._source = source;
  }

  zOrder() {
    return "bottom";
  }

  renderer() {
    return new BoxesPaneRenderer(() => this._source.drawData());
  }
}

/** @param {object[]} a @param {object[]} b */
function boxesEqual(a, b) {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i];
    const y = b[i];
    if (
      x.timeStart !== y.timeStart ||
      x.timeEnd !== y.timeEnd ||
      x.labelTime !== y.labelTime ||
      Boolean(x.extendRight) !== Boolean(y.extendRight) ||
      x.priceTop !== y.priceTop ||
      x.priceBottom !== y.priceBottom ||
      Boolean(x.showLabel) !== Boolean(y.showLabel) ||
      x.label !== y.label ||
      x.textColor !== y.textColor
    ) {
      return false;
    }
  }
  return true;
}

class BoxesPrimitive {
  constructor() {
    /** @type {object[]} */
    this._boxes = [];
    /** @type {{ mapBars: object[], barSec: number, lastRealChartTime?: number, timeAdapter?: ReturnType<import("../../chart/time/timeAdapter.js").createTimeAdapter> } | null} */
    this._timeCtx = null;
    /** @type {import("lightweight-charts").IChartApi | null} */
    this._chart = null;
    /** @type {import("lightweight-charts").ISeriesApi | null} */
    this._series = null;
    /** @type {(() => void) | null} */
    this._requestUpdate = null;
    /** @type {(() => void) | null} */
    this._unsub = null;
    this._paneView = new BoxesPaneView(this);
  }

  /** @param {object[]} boxes @param {{ mapBars?: object[], barSec?: number, lastRealChartTime?: number, timeAdapter?: ReturnType<import("../../chart/time/timeAdapter.js").createTimeAdapter> } | null} [timeCtx] @param {{ geometryUnchanged?: boolean, skipRedraw?: boolean }} [opts] */
  setBoxes(boxes, timeCtx = null, opts = {}) {
    const { geometryUnchanged = false, skipRedraw = false } = opts;
    let dirty = false;

    if (timeCtx) {
      const prev = this._timeCtx;
      this._timeCtx = timeCtx;
      if (
        !prev ||
        prev.timeAdapter !== timeCtx.timeAdapter ||
        prev.mapBars !== timeCtx.mapBars ||
        prev.lastRealChartTime !== timeCtx.lastRealChartTime ||
        prev.barSec !== timeCtx.barSec
      ) {
        dirty = true;
      }
    }

    if (boxes != null && !geometryUnchanged) {
      if (!boxesEqual(this._boxes, boxes)) {
        this._boxes = boxes ?? [];
        dirty = true;
      }
    }

    if (dirty && !skipRedraw) this._requestUpdate?.();
  }

  requestRefresh() {
    this._requestUpdate?.();
  }

  /** @param {import("lightweight-charts").SeriesAttachedParameter} param */
  attached(param) {
    this._chart = param.chart;
    this._series = param.series;
    this._requestUpdate = param.requestUpdate;
    this._unsub = subscribePrimitiveViewportRefresh(
      this._chart.timeScale(),
      () => this._requestUpdate?.(),
    );
  }

  detached() {
    this._unsub?.();
    this._unsub = null;
    this._chart = null;
    this._series = null;
    this._requestUpdate = null;
  }

  updateAllViews() {}

  paneViews() {
    return [this._paneView];
  }

  drawData() {
    const chart = this._chart;
    const series = this._series;
    if (!chart || !series) {
      return { boxes: [], timeToX: () => null, priceToY: () => null };
    }
    const ts = chart.timeScale();
    const ctx = this._timeCtx;
    const seriesData = series.data?.() ?? [];
    const ctxMapBars = ctx?.mapBars ?? [];
    const { mapBars, useAdapter } = resolveOverlayMapBars(seriesData, ctxMapBars);
    const timeAdapter = useAdapter ? (ctx?.timeAdapter ?? null) : null;
    const barSec = ctx?.barSec ?? 60;
    const lastReal = ctx?.lastRealChartTime ?? mapBars.at(-1)?.time;

    return {
      boxes: this._boxes,
      timeToX: (t) => {
        if (timeAdapter) {
          const x = timeAdapter.coord.xFromChart(chart, t);
          if (x != null && Number.isFinite(x)) return x;
        }
        if (mapBars.length) {
          const x = chartTimeToCoordinate(ts, mapBars, barSec, t, lastReal);
          if (x != null && Number.isFinite(x)) return x;
        }
        return safeTimeToX(ts, t);
      },
      priceToY: (p) => safePriceToY(series, p),
    };
  }
}

/** @param {{ series: import("lightweight-charts").ISeriesApi }} opts */
export function attachBoxesPrimitive(opts) {
  const primitive = new BoxesPrimitive();
  opts.series.attachPrimitive(primitive);
  return {
    setBoxes: (boxes, timeCtx, opts) => primitive.setBoxes(boxes, timeCtx, opts),
    setLabels: (boxes) => primitive.setBoxes(boxes),
    requestRefresh: () => primitive.requestRefresh(),
    destroy: () => {
      try {
        opts.series.detachPrimitive(primitive);
      } catch {
        /* ignore */
      }
    },
  };
}
