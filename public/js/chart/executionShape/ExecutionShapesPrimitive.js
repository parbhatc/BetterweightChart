import { safePriceToY } from "../coords/timeScale.js";
import { mapUtcTimeToChartTime } from "../../indicators/math/barTimeMap.js";

/**
 * @param {number} utcTime
 * @param {object[]} utcBars
 * @param {object[]} chartBars
 * @param {ReturnType<import("../time/timeAdapter.js").createTimeAdapter> | null} timeAdapter
 */
function chartTimeForUtc(utcTime, utcBars, chartBars, timeAdapter) {
  if (utcTime == null || !Number.isFinite(Number(utcTime))) return utcTime;
  if (timeAdapter?.time?.toChart) {
    return timeAdapter.time.toChart(Number(utcTime));
  }
  if (utcBars?.length && chartBars?.length && utcBars !== chartBars) {
    return mapUtcTimeToChartTime(utcTime, utcBars, chartBars);
  }
  return utcTime;
}

export class ExecutionShapesPrimitive {
  /** @param {() => { states: import("./types.js").ExecutionShapeState[]; utcBars: object[]; chartBars: object[]; timeAdapter: ReturnType<import("../time/timeAdapter.js").createTimeAdapter> | null }} getContext */
  constructor(getContext) {
    this._getContext = getContext;
    /** @type {import("lightweight-charts").IChartApi | null} */
    this._chart = null;
    /** @type {import("lightweight-charts").ISeriesApi | null} */
    this._series = null;
    /** @type {(() => void) | null} */
    this._requestUpdate = null;
    this._paneView = new ExecutionShapesPaneView(this);
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

  /** @returns {import("./types.js").ExecutionShapeLayout[]} */
  layoutAll() {
    const chart = this._chart;
    const series = this._series;
    if (!chart || !series) return [];

    const { states, utcBars, chartBars, timeAdapter } = this._getContext();
    const paneSize = chart.paneSize();
    const paneH = paneSize.height;
    const paneW = paneSize.width;

    /** @type {import("./types.js").ExecutionShapeLayout[]} */
    const out = [];
    for (const state of states) {
      if (state.removed || !state.time || !Number.isFinite(state.price)) continue;
      const chartTime = chartTimeForUtc(state.time, utcBars, chartBars, timeAdapter);
      const x = chart.timeScale().timeToCoordinate(chartTime);
      const y = safePriceToY(series, state.price);
      if (x == null || y == null) continue;
      if (x < -20 || x > paneW + 20 || y < -20 || y > paneH + 20) continue;
      out.push({ state, x, y, paneW, paneH });
    }
    return out;
  }
}

class ExecutionShapesPaneView {
  /** @param {ExecutionShapesPrimitive} source */
  constructor(source) {
    this._source = source;
  }
  zOrder() {
    return "top";
  }
  renderer() {
    return new ExecutionShapesPaneRenderer(this._source);
  }
}

class ExecutionShapesPaneRenderer {
  /** @param {ExecutionShapesPrimitive} source */
  constructor(source) {
    this._source = source;
  }
  draw(target) {
    const layouts = this._source.layoutAll();
    if (!layouts.length) return;

    target.useMediaCoordinateSpace(({ context: ctx }) => {
      for (const layout of layouts) {
        drawExecutionArrow(ctx, layout);
      }
    });
  }
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import("./types.js").ExecutionShapeLayout} layout
 */
function drawExecutionArrow(ctx, layout) {
  const { state, x, y } = layout;
  const h = state.arrowHeight;
  const gap = state.arrowSpacing;
  const isBuy = state.direction === "buy";
  const cy = isBuy ? y + gap + h : y - gap - h;

  ctx.save();
  ctx.fillStyle = state.arrowColor;
  ctx.strokeStyle = state.arrowColor;
  ctx.lineWidth = 1;
  ctx.beginPath();
  if (isBuy) {
    ctx.moveTo(x, cy - h);
    ctx.lineTo(x - h * 0.55, cy);
    ctx.lineTo(x + h * 0.55, cy);
  } else {
    ctx.moveTo(x, cy + h);
    ctx.lineTo(x - h * 0.55, cy);
    ctx.lineTo(x + h * 0.55, cy);
  }
  ctx.closePath();
  ctx.fill();

  if (state.text) {
    ctx.font = "600 10px system-ui, sans-serif";
    ctx.fillStyle = state.textColor || "#d1d4dc";
    ctx.textAlign = "center";
    ctx.textBaseline = isBuy ? "top" : "bottom";
    ctx.fillText(state.text, x, isBuy ? cy + 4 : cy - 4);
  }
  ctx.restore();
}

/**
 * @typedef {object} ExecutionShapeLayout
 * @property {import("./types.js").ExecutionShapeState} state
 * @property {number} x
 * @property {number} y
 * @property {number} paneW
 * @property {number} paneH
 */
