/* global LightweightCharts */
import { chartXAt, safePriceToY } from "../utils/timeScaleCoords.js";

/** @typedef {{ title: string; items: string[] }} SetupTooltipSection */
/** @typedef {{ setupNum: 1 | 2; tooltipTitle: string; tooltipSections: SetupTooltipSection[] }} SetupTooltipVariant */
/** @typedef {{ id: string; time: number; price: number; side: "long"|"short"; entryTime1m: number; tooltipTitle: string; tooltipSections: SetupTooltipSection[]; tooltipVariants?: SetupTooltipVariant[]; setupCount?: number }} SetupLabel */

const ARROW = { w: 12, h: 14, gap: 5, hit: 16 };

/**
 * @param {SetupLabel} label
 * @param {number} x
 * @param {number} yBase
 */
function arrowAnchor(label, x, yBase) {
  const long = label.side === "long";
  const y = long ? yBase + ARROW.gap + ARROW.h : yBase - ARROW.gap - ARROW.h;
  return { x, y, long };
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {boolean} long
 * @param {boolean} hovered
 */
function drawSetupArrow(ctx, x, y, long, hovered) {
  const fill = long ? (hovered ? "#4ade80" : "#22c55e") : hovered ? "#f87171" : "#ef4444";
  const stroke = long ? "#15803d" : "#b91c1c";
  const { w, h } = ARROW;

  ctx.save();
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = hovered ? 1.75 : 1.25;
  ctx.lineJoin = "round";
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = hovered ? 6 : 4;
  ctx.shadowOffsetY = 1;

  ctx.beginPath();
  if (long) {
    ctx.moveTo(x, y - h);
    ctx.lineTo(x - w / 2, y);
    ctx.lineTo(x + w / 2, y);
  } else {
    ctx.moveTo(x, y + h);
    ctx.lineTo(x - w / 2, y);
    ctx.lineTo(x + w / 2, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.shadowBlur = 0;
  const stemY = long ? y - h - 4 : y + h + 4;
  ctx.beginPath();
  ctx.arc(x, stemY, hovered ? 3 : 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} count
 */
function drawSetupCountBadge(ctx, x, y, count) {
  if (count <= 1) return;
  const r = 7;
  const bx = x + 8;
  const by = y - 8;
  ctx.save();
  ctx.fillStyle = "#1e293b";
  ctx.strokeStyle = "#f8fafc";
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.arc(bx, by, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#f8fafc";
  ctx.font = "bold 9px system-ui, Segoe UI, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(count), bx, by + 0.5);
  ctx.restore();
}

/**
 * Canvas primitive — TradingView-style setup entry arrows.
 */
export class SetupLabelsPrimitive {
  constructor() {
    /** @type {SetupLabel[]} */
    this._labels = [];
    /** @type {string | null} */
    this._hoverId = null;
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
    /** @type {(() => void) | null} */
    this._onVisibleRangeChange = null;
    this._paneView = new SetupLabelsPaneView(this);
  }

  /** @param {(() => void) | null} fn */
  setOnVisibleRangeChange(fn) {
    this._onVisibleRangeChange = fn;
  }

  /** @param {{ labels?: SetupLabel[]; tfSec?: number }} data */
  setData(data) {
    this._labels = data?.labels ?? [];
    if (data?.tfSec != null && data.tfSec > 0) this._tfSec = data.tfSec;
    this._requestUpdate?.();
  }

  /** @param {string | null} id */
  setHover(id) {
    if (this._hoverId === id) return;
    this._hoverId = id;
    this._requestUpdate?.();
  }

  coords() {
    const chart = this._chart;
    const series = this._series;
    if (!chart || !series) {
      return { labels: [], timeToX: () => null, priceToY: () => null };
    }
    const ts = chart.timeScale();
    const seriesData = typeof series.data === "function" ? series.data() : [];
    const tfSec = this._tfSec;
    return {
      labels: this._labels,
      timeToX: (t) => chartXAt(ts, seriesData, tfSec, undefined, t),
      priceToY: (p) => safePriceToY(series, p),
    };
  }

  /**
   * @param {number} px pane x
   * @param {number} py pane y
   * @returns {SetupLabel | null}
   */
  hitTest(px, py) {
    const { labels, timeToX, priceToY } = this.coords();
    let best = null;
    let bestDist = Infinity;

    for (const label of labels) {
      const x = timeToX(label.time);
      const yBase = priceToY(label.price);
      if (x == null || yBase == null) continue;
      const { x: ax, y: ay } = arrowAnchor(label, x, yBase);
      const hitR = ARROW.hit + ((label.setupCount ?? 1) > 1 ? 6 : 0);
      const dist = Math.hypot(px - ax, py - ay);
      if (dist <= hitR && dist < bestDist) {
        bestDist = dist;
        best = label;
      }
    }
    return best;
  }

  /** @param {import("lightweight-charts").SeriesAttachedParameter<import("lightweight-charts").Time>} param */
  attached(param) {
    this._chart = param.chart;
    this._series = param.series;
    this._requestUpdate = param.requestUpdate;
    this._unsubVisibleRange?.();
    this._unsubVisibleRange = param.chart.timeScale().subscribeVisibleLogicalRangeChange(() => {
      this._requestUpdate?.();
      this._onVisibleRangeChange?.();
    });
  }

  detached() {
    this._unsubVisibleRange?.();
    this._unsubVisibleRange = null;
    this._onVisibleRangeChange = null;
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
    return { ...this.coords(), hoverId: this._hoverId };
  }

  /** Debug: chart pixel coords per label (null x/y = not drawable). */
  debugCoords() {
    const { labels, timeToX, priceToY } = this.coords();
    const ts = this._chart?.timeScale?.();
    const range = ts?.getVisibleLogicalRange?.() ?? null;
    return {
      labelCount: labels.length,
      visibleLogicalRange: range,
      markers: labels.map((l) => ({
        id: l.id,
        side: l.side,
        time: l.time,
        price: l.price,
        x: timeToX(l.time),
        y: priceToY(l.price),
      })),
    };
  }
}

class SetupLabelsPaneView {
  /** @param {SetupLabelsPrimitive} source */
  constructor(source) {
    this._source = source;
  }

  zOrder() {
    return "top";
  }

  renderer() {
    return new SetupLabelsPaneRenderer(this._source);
  }
}

class SetupLabelsPaneRenderer {
  /** @param {SetupLabelsPrimitive} source */
  constructor(source) {
    this._source = source;
  }

  /** @param {import("fancy-canvas").CanvasRenderingTarget2D} target */
  draw(target) {
    const { labels, timeToX, priceToY, hoverId } = this._source.drawData();
    if (!labels.length) return;

    target.useMediaCoordinateSpace(({ context: ctx }) => {
      for (const label of labels) {
        const x = timeToX(label.time);
        const yBase = priceToY(label.price);
        if (x == null || yBase == null) continue;

        const { x: ax, y: ay, long } = arrowAnchor(label, x, yBase);
        const hovered = label.id === hoverId;
        drawSetupArrow(ctx, ax, ay, long, hovered);
        if ((label.setupCount ?? 1) > 1) {
          drawSetupCountBadge(ctx, ax, ay, label.setupCount ?? 2);
        }
      }
    });
  }
}
