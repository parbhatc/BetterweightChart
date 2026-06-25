import { chartTimeToCoordinate, safePriceToY, safeTimeToX } from "../../chart/coords/timeScale.js";
import { chartDebug } from "../../debug/chart/index.js";
import { drawLabelCallout } from "./labelCallout.js";
import { subscribePrimitiveViewportRefresh } from "../../primitives/viewportRefresh.js";
import { resolveOverlayMapBars } from "./overlayMapBars.js";

/** @param {number} x1 @param {number} x2 @param {number} paneW */
function lineIntersectsViewport(x1, x2, paneW) {
  if (!Number.isFinite(x1) || !Number.isFinite(x2) || paneW <= 0) return false;
  const lo = Math.min(x1, x2);
  const hi = Math.max(x1, x2);
  return hi >= 0 && lo <= paneW;
}

/** @param {number} x1 @param {number} x2 @param {number} paneW */
function labelXOnVisibleSegment(x1, x2, paneW) {
  const lo = Math.max(0, Math.min(x1, x2));
  const hi = Math.min(paneW, Math.max(x1, x2));
  return (lo + hi) / 2;
}

/** @param {CanvasRenderingContext2D} ctx @param {object} line @param {(t: number) => number | null} timeToX @param {(p: number) => number | null} priceToY @param {number} paneW */
function drawLine(ctx, line, timeToX, priceToY, paneW) {
  const x1 = timeToX(line.timeStart);
  const x2 = timeToX(line.timeEnd);
  const y1 = priceToY(line.priceStart);
  const y2 = priceToY(line.priceEnd);
  if (x1 == null || x2 == null || y1 == null || y2 == null) return;
  // Stale mapBars during history restore — skip inverted coords.
  if (x1 > x2 + 2) return;
  if (Math.abs(x2 - x1) < 1 && Math.abs(y2 - y1) < 1) return;

  ctx.save();
  const swept = Boolean(line.swept);
  ctx.strokeStyle = line.color ?? "#2962ff";
  ctx.lineWidth = Math.max(1, Number(line.width) || 1);
  ctx.globalAlpha = swept ? 0.72 : 1;
  const dash = swept ? [2, 3] : Array.isArray(line.dash) ? line.dash : [];
  ctx.setLineDash(dash);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();

  if (!line.label || !lineIntersectsViewport(x1, x2, paneW)) return;

  if (line.labelAnchor === "right") {
    const rightX = Math.max(x1, x2);
    const ly = y1;
    if (!Number.isFinite(rightX) || !Number.isFinite(ly)) return;
    ctx.save();
    ctx.font = "600 11px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    ctx.fillStyle = line.labelTextColor ?? line.color ?? "#e2e8f0";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.globalAlpha = swept ? 0.7 : 0.95;
    ctx.fillText(String(line.label), rightX + 4, ly);
    ctx.restore();
    return;
  }

  const isSmt = line.kind === "high" || line.kind === "low";
  const lx = isSmt ? (x1 + x2) / 2 : labelXOnVisibleSegment(x1, x2, paneW);
  let ly;
  if (isSmt) {
    ly = (y1 + y2) / 2;
  } else if (line.labelPrice != null && Number.isFinite(line.labelPrice)) {
    ly = priceToY(line.labelPrice);
    if (ly == null) ly = (y1 + y2) / 2;
  } else {
    ly = (y1 + y2) / 2;
  }

  if (!Number.isFinite(lx) || !Number.isFinite(ly)) {
    if (isSmt) {
      chartDebug("smt", "label coord miss", {
        lx,
        ly,
        x1,
        x2,
        paneW,
        timeStart: line.timeStart,
        timeEnd: line.timeEnd,
        label: line.label,
      });
    }
    return;
  }

  ctx.save();
  const labelAngle = isSmt ? Math.atan2(y2 - y1, x2 - x1) : undefined;
  drawLabelCallout(
    ctx,
    lx,
    ly,
    String(line.label),
    line.labelBg ?? "#3d1f1f",
    line.labelTextColor ?? line.color ?? "#ff1100",
    line.labelStyle === "up" ? "low" : "high",
    labelAngle != null ? { angle: labelAngle, paneW } : undefined,
  );
  ctx.restore();
}

class LinesPaneRenderer {
  /** @param {() => object} getData */
  constructor(getData) {
    this._getData = getData;
  }

  /** @param {import("fancy-canvas").CanvasRenderingTarget2D} target */
  draw(target) {
    const { lines, timeToX, priceToY } = this._getData();
    if (!lines?.length) return;

    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      const paneW = mediaSize.width;
      const pad = 4;
      for (const line of lines) {
        const x1 = timeToX(line.timeStart);
        const x2 = timeToX(line.timeEnd);
        if (x1 != null && x2 != null) {
          const lo = Math.min(x1, x2);
          const hi = Math.max(x1, x2);
          if (hi < -pad || lo > paneW + pad) continue;
        }
        drawLine(ctx, line, timeToX, priceToY, paneW);
      }
    });
  }
}

class LinesPaneView {
  /** @param {LinesPrimitive} source */
  constructor(source) {
    this._source = source;
  }

  zOrder() {
    return "top";
  }

  renderer() {
    return new LinesPaneRenderer(() => this._source.drawData());
  }
}

/** @param {object[]} a @param {object[]} b */
function linesEqual(a, b) {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i];
    const y = b[i];
    if (
      x.timeStart !== y.timeStart ||
      x.timeEnd !== y.timeEnd ||
      x.priceStart !== y.priceStart ||
      x.priceEnd !== y.priceEnd ||
      x.color !== y.color ||
      x.label !== y.label ||
      x.labelBg !== y.labelBg ||
      x.labelTextColor !== y.labelTextColor ||
      x.labelAnchor !== y.labelAnchor ||
      x.swept !== y.swept ||
      x.width !== y.width
    ) {
      return false;
    }
  }
  return true;
}

class LinesPrimitive {
  constructor() {
    /** @type {object[]} */
    this._lines = [];
    /** @type {{ mapBars: object[], barSec: number, lastRealChartTime?: number, timeAdapter?: object } | null} */
    this._timeCtx = null;
    /** @type {import("lightweight-charts").IChartApi | null} */
    this._chart = null;
    /** @type {import("lightweight-charts").ISeriesApi | null} */
    this._series = null;
    /** @type {(() => void) | null} */
    this._requestUpdate = null;
    /** @type {(() => void) | null} */
    this._unsub = null;
    this._paneView = new LinesPaneView(this);
  }

  /** @param {object[]} lines @param {object | null} [timeCtx] @param {{ geometryUnchanged?: boolean, skipRedraw?: boolean }} [opts] */
  setLines(lines, timeCtx = null, opts = {}) {
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

    if (lines != null && !geometryUnchanged) {
      if (!linesEqual(this._lines, lines)) {
        this._lines = lines ?? [];
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
      return { lines: [], timeToX: () => null, priceToY: () => null, paneW: 0 };
    }
    const ts = chart.timeScale();
    const ctx = this._timeCtx;
    const seriesData = series.data?.() ?? [];
    const ctxMapBars = ctx?.mapBars ?? [];
    const { mapBars, useAdapter } = resolveOverlayMapBars(seriesData, ctxMapBars);
    const timeAdapter = useAdapter ? (ctx?.timeAdapter ?? null) : null;
    const barSec = ctx?.barSec ?? 60;
    const lastReal = ctx?.lastRealChartTime ?? mapBars.at(-1)?.time;
    const paneW = chart.paneSize?.()?.width ?? 0;

    return {
      lines: this._lines,
      paneW,
      timeToX: (t) => {
        if (t == null || !Number.isFinite(Number(t))) return null;
        const time = Number(t);
        if (timeAdapter) {
          const x = timeAdapter.coord.xFromChart(chart, time);
          if (x != null && Number.isFinite(x)) return x;
        }
        if (mapBars.length) {
          const x = chartTimeToCoordinate(ts, mapBars, barSec, time, lastReal);
          if (x != null && Number.isFinite(x)) return x;
        }
        if (typeof ts.timeToCoordinate === "function") {
          const x = ts.timeToCoordinate(time);
          if (x != null && Number.isFinite(x) && x !== 0) return x;
        }
        return safeTimeToX(ts, time);
      },
      priceToY: (p) => safePriceToY(series, p),
    };
  }
}

/** @param {{ series: import("lightweight-charts").ISeriesApi }} opts */
export function attachLinesPrimitive(opts) {
  const primitive = new LinesPrimitive();
  opts.series.attachPrimitive(primitive);
  return {
    setLines: (lines, timeCtx, opts) => primitive.setLines(lines, timeCtx, opts),
    setLabels: (lines) => primitive.setLines(lines),
    setBoxes: (lines, timeCtx, opts) => primitive.setLines(lines, timeCtx, opts),
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
