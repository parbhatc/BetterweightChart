import { applyColorOpacity } from "../ui/color/picker.js";
import { TV_DRAW_CROSSHAIR, REPLAY_SELECT_VERT_WIDTH } from "../app/cursor/mode.js";
import { formatReplayCutTimeLabel } from "../chart/time/labelFormat.js";
import { resolveTimezone } from "../chart/timezone/list.js";
import { REPLAY_SCISSORS } from "./icons.js";

const REPLAY_FUTURE_DIM_OPACITY = 50;
const REPLAY_TIME_LABEL_HEIGHT = 20;
const SCISSORS_W = 20;
const SCISSORS_H = 27;

/** @type {HTMLImageElement | null} */
let scissorsImage = null;
/** @type {Set<() => void>} */
const scissorsLoadListeners = new Set();

function ensureScissorsImage() {
  if (scissorsImage) return scissorsImage;
  const img = new Image();
  img.onload = () => {
    scissorsImage = img;
    for (const fn of scissorsLoadListeners) fn();
    scissorsLoadListeners.clear();
  };
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(REPLAY_SCISSORS)}`;
  return null;
}

ensureScissorsImage();

/** @param {CanvasRenderingContext2D} ctx @param {number} x @param {number} y */
function drawScissorsIcon(ctx, x, y) {
  const img = scissorsImage ?? ensureScissorsImage();
  if (!img?.complete || img.naturalWidth === 0) return;
  ctx.drawImage(img, x - SCISSORS_W / 2, y - SCISSORS_H / 2, SCISSORS_W, SCISSORS_H);
}

/** @param {CanvasRenderingContext2D} ctx @param {number} x @param {number} bottomY @param {string} text */
function drawReplayTimeLabel(ctx, x, bottomY, text) {
  ctx.save();
  ctx.font = '11px -apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, Ubuntu, sans-serif';
  const padX = 6;
  const h = REPLAY_TIME_LABEL_HEIGHT;
  const w = ctx.measureText(text).width + padX * 2;
  const left = Math.round(x - w / 2);
  const top = Math.round(bottomY - h);

  ctx.fillStyle = TV_DRAW_CROSSHAIR;
  ctx.fillRect(left, top, w, h);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, top + h / 2);
  ctx.restore();
}

export class ReplayFutureDimPrimitive {
  constructor() {
    /** @type {import("lightweight-charts").IChartApi | null} */
    this._chart = null;
    /** @type {(() => void) | null} */
    this._requestUpdate = null;
    /** @type {() => { bars: object[], barSec: number, timeAdapter: object | null }} */
    this._getContext = () => ({ bars: [], barSec: 60, timeAdapter: null });
    /** @type {() => number | null} */
    this._getCutBarIndex = () => null;
    /** @type {() => number | null} */
    this._getDimBarIndex = () => null;
    /** @type {() => number | null} */
    this._getScissorsY = () => null;
    /** @type {() => boolean} */
    this._getShowCutLine = () => false;
    /** @type {() => boolean} */
    this._getShowScissors = () => false;
    /** @type {() => string} */
    this._getFill = () => "rgba(0, 0, 0, 0.5)";
    /** @type {() => string | null} */
    this._getTimeLabel = () => null;
    this._paneView = new ReplayFutureDimPaneView(this);
    /** @type {(() => void) | null} */
    this._unsub = null;
  }

  /** @param {() => { bars: object[], barSec: number, timeAdapter: object | null }} fn */
  setContextProvider(fn) {
    this._getContext = fn;
  }

  /** @param {() => number | null} fn */
  setCutBarIndexProvider(fn) {
    this._getCutBarIndex = fn;
  }

  /** @param {() => number | null} fn */
  setDimBarIndexProvider(fn) {
    this._getDimBarIndex = fn;
  }

  /** @param {() => number | null} fn */
  setScissorsYProvider(fn) {
    this._getScissorsY = fn;
  }

  /** @param {() => boolean} fn */
  setShowCutLineProvider(fn) {
    this._getShowCutLine = fn;
  }

  /** @param {() => boolean} fn */
  setShowScissorsProvider(fn) {
    this._getShowScissors = fn;
  }

  /** @param {() => string} fn */
  setFillProvider(fn) {
    this._getFill = fn;
  }

  /** @param {() => string | null} fn */
  setTimeLabelProvider(fn) {
    this._getTimeLabel = fn;
  }

  requestRefresh() {
    this._requestUpdate?.();
  }

  /** @param {import("lightweight-charts").SeriesAttachedParameter} param */
  attached(param) {
    this._chart = param.chart;
    this._requestUpdate = param.requestUpdate;
    if (!scissorsImage) {
      scissorsLoadListeners.add(() => this._requestUpdate?.());
    }
    const ts = this._chart.timeScale();
    const onRange = () => this._requestUpdate?.();
    ts.subscribeVisibleLogicalRangeChange(onRange);
    this._unsub = () => ts.unsubscribeVisibleLogicalRangeChange(onRange);
  }

  detached() {
    this._unsub?.();
    this._unsub = null;
    this._chart = null;
    this._requestUpdate = null;
  }

  updateAllViews() {}

  paneViews() {
    return [this._paneView];
  }

  drawData() {
    const chart = this._chart;
    const cutIndex = this._getCutBarIndex();
    const dimIndex = this._getDimBarIndex();
    const { bars, timeAdapter } = this._getContext();
    const fill = this._getFill();
    const scissorsY = this._getScissorsY();
    const showCutLine = this._getShowCutLine();
    const showScissors = this._getShowScissors();
    const timeLabel = this._getTimeLabel();

    if (!chart || !bars?.length || !timeAdapter) {
      return {
        dimVisible: false,
        cutVisible: false,
        showScissors: false,
        timeLabel: null,
        fill,
        fromX: null,
        rightX: null,
        cutX: null,
        scissorsY: null,
      };
    }

    let cutX = null;
    if (cutIndex != null && cutIndex >= 0 && cutIndex < bars.length) {
      const cutBar = bars[cutIndex];
      const cutChartTime = timeAdapter.time.toChart(cutBar.time);
      cutX = timeAdapter.coord.xFromChart(chart, cutChartTime);
    }

    let fromX = null;
    let dimVisible = false;
    const rightX = timeAdapter.coord.visibleRightX(chart);

    if (
      dimIndex != null &&
      dimIndex >= 0 &&
      dimIndex < bars.length - 1
    ) {
      const nextBar = bars[dimIndex + 1];
      const fromChartTime = timeAdapter.time.toChart(nextBar.time);
      fromX = timeAdapter.coord.xFromChart(chart, fromChartTime);
      dimVisible =
        fromX != null &&
        rightX != null &&
        Number.isFinite(fromX) &&
        Number.isFinite(rightX) &&
        rightX > fromX;
    }

    const cutVisible = showCutLine && cutX != null && Number.isFinite(cutX);

    return {
      dimVisible,
      cutVisible,
      showScissors: showScissors && cutX != null && scissorsY != null && Number.isFinite(scissorsY),
      timeLabel: cutVisible ? timeLabel : null,
      fill,
      fromX,
      rightX,
      cutX,
      scissorsY,
    };
  }
}

class ReplayFutureDimPaneView {
  /** @param {ReplayFutureDimPrimitive} source */
  constructor(source) {
    this._source = source;
  }

  zOrder() {
    return "top";
  }

  renderer() {
    return new ReplayFutureDimPaneRenderer(this._source);
  }
}

class ReplayFutureDimPaneRenderer {
  /** @param {ReplayFutureDimPrimitive} source */
  constructor(source) {
    this._source = source;
  }

  draw(target) {
    const {
      dimVisible,
      cutVisible,
      showScissors,
      timeLabel,
      fill,
      fromX,
      rightX,
      cutX,
      scissorsY,
    } = this._source.drawData();
    if (!dimVisible && !cutVisible && !showScissors) return;

    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      if (dimVisible && fromX != null && rightX != null) {
        const left = Math.max(0, fromX);
        const width = Math.max(0, rightX - left);
        if (width > 0) {
          ctx.fillStyle = fill;
          ctx.fillRect(left, 0, width, mediaSize.height);
        }
      }

      if (cutVisible && cutX != null) {
        ctx.save();
        ctx.strokeStyle = TV_DRAW_CROSSHAIR;
        ctx.lineWidth = REPLAY_SELECT_VERT_WIDTH;
        ctx.beginPath();
        ctx.moveTo(cutX, 0);
        ctx.lineTo(cutX, mediaSize.height);
        ctx.stroke();
        ctx.restore();

        if (timeLabel) {
          drawReplayTimeLabel(ctx, cutX, mediaSize.height, timeLabel);
        }
      }

      if (showScissors && cutX != null && scissorsY != null) {
        drawScissorsIcon(ctx, cutX, scissorsY);
      }
    });
  }
}

/**
 * @param {import("../app/boot/chart/state.js").BootContext} ctx
 * @param {ReturnType<import("./mode.js").mountReplayMode>} replay
 */
export function attachReplayFutureDim(ctx, replay) {
  /** @type {Map<number, ReplayFutureDimPrimitive>} */
  const primitives = new Map();

  function resolveFill() {
    const cv = ctx.settingsStore.get().canvas ?? {};
    const fallback = ctx.themeColors?.bg ?? "#020617";
    const bg =
      cv.backgroundType === "gradient"
        ? (cv.backgroundGradientTopColor ?? fallback)
        : (cv.backgroundColor ?? fallback);
    return applyColorOpacity(bg, REPLAY_FUTURE_DIM_OPACITY);
  }

  /** @param {object} pane */
  function ensurePane(pane) {
    if (!pane?.series) return null;

    let primitive = primitives.get(pane.index);
    if (!primitive) {
      primitive = new ReplayFutureDimPrimitive();
      primitive.setContextProvider(() => {
        const view = pane._chartView;
        const ta = view?.timeAdapter ?? pane.timeAdapter;
        return {
          bars: pane.bars ?? [],
          barSec: view?.barSec ?? pane.barSec ?? 60,
          timeAdapter: ta ?? null,
        };
      });
      primitive.setCutBarIndexProvider(() => {
        const state = replay.getState();
        if (!state.active || !state.selectingBar || state.selectMode !== "bar") return null;
        return pane.replayHoverBarIndex ?? null;
      });
      primitive.setDimBarIndexProvider(() => {
        const state = replay.getState();
        if (!state.active || !state.selectingBar || state.selectMode !== "bar") return null;
        return pane.replayHoverBarIndex ?? null;
      });
      primitive.setScissorsYProvider(() => {
        const state = replay.getState();
        if (!state.active || !state.selectingBar || state.selectMode !== "bar") return null;
        return pane.replayHoverLocalY ?? null;
      });
      primitive.setShowCutLineProvider(() => {
        const state = replay.getState();
        return Boolean(
          state.active &&
            state.selectingBar &&
            state.selectMode === "bar" &&
            pane.replayHoverBarIndex != null,
        );
      });
      primitive.setTimeLabelProvider(() => {
        const state = replay.getState();
        if (!state.active || !state.selectingBar || state.selectMode !== "bar") return null;

        const cutIndex = pane.replayHoverBarIndex ?? null;
        if (cutIndex == null) return null;

        const bars = pane.bars ?? [];
        const bar = bars[cutIndex];
        if (!bar) return null;

        const sym = ctx.settingsStore.get().symbol ?? {};
        const tz = resolveTimezone(sym.timezone, pane.symbolInfo ?? ctx.symbolInfo);
        return formatReplayCutTimeLabel(bar.time, tz);
      });
      primitive.setShowScissorsProvider(() => {
        const state = replay.getState();
        return Boolean(
          state.active &&
            state.selectingBar &&
            state.selectMode === "bar" &&
            pane.replayHoverBarIndex != null,
        );
      });
      primitive.setFillProvider(resolveFill);
      pane.series.attachPrimitive(primitive);
      pane.replayFutureDim = primitive;
      primitives.set(pane.index, primitive);
    }

    return primitive;
  }

  function refreshAll() {
    for (const pane of ctx.getAllChartPanes()) {
      ensurePane(pane)?.requestRefresh();
    }
  }

  replay.subscribe(() => refreshAll());

  return { ensurePane, refreshAll };
}

/** @param {object} pane @param {number} selectedIndex */
export function replayCutCoordinateX(pane, selectedIndex) {
  const bars = pane?.bars;
  if (!bars?.length || selectedIndex == null || selectedIndex < 0 || selectedIndex >= bars.length) {
    return null;
  }
  const ta = pane.timeAdapter ?? pane._chartView?.timeAdapter;
  if (!ta || !pane.chart) return null;
  const chartTime = ta.time.toChart(bars[selectedIndex].time);
  const x = ta.coord.xFromChart(pane.chart, chartTime);
  return x != null && Number.isFinite(x) ? x : null;
}
