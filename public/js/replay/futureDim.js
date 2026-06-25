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

/**
 * @typedef {import("../primitives/background/composite.js").PaneBackgroundPrimitive} PaneBackgroundPrimitive
 */

/**
 * @typedef {object} ReplayFutureDimState
 * @property {PaneBackgroundPrimitive | undefined} host
 * @property {() => { bars: object[], barSec: number, timeAdapter: object | null }} getContext
 * @property {() => number | null} getCutBarIndex
 * @property {() => number | null} getDimBarIndex
 * @property {() => number | null} getScissorsY
 * @property {() => boolean} getShowCutLine
 * @property {() => boolean} getShowScissors
 * @property {() => string} getFill
 * @property {() => string | null} getTimeLabel
 */

/** @param {ReplayFutureDimState} state */
function replayFutureDimDrawData(state) {
  const host = state.host;
  const chart = host?.chart;
  const cutIndex = state.getCutBarIndex();
  const dimIndex = state.getDimBarIndex();
  const { bars, timeAdapter } = state.getContext();
  const fill = state.getFill();
  const scissorsY = state.getScissorsY();
  const showCutLine = state.getShowCutLine();
  const showScissors = state.getShowScissors();
  const timeLabel = state.getTimeLabel();

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

  if (dimIndex != null && dimIndex >= 0 && dimIndex < bars.length - 1) {
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

/** Replay future dim as a background-layer (not a standalone primitive). */
export function createReplayFutureDimLayer() {
  /** @type {ReplayFutureDimState} */
  const state = {
    host: undefined,
    getContext: () => ({ bars: [], barSec: 60, timeAdapter: null }),
    getCutBarIndex: () => null,
    getDimBarIndex: () => null,
    getScissorsY: () => null,
    getShowCutLine: () => false,
    getShowScissors: () => false,
    getFill: () => "rgba(0, 0, 0, 0.5)",
    getTimeLabel: () => null,
  };

  const view = new ReplayFutureDimPaneView(state);

  const layer = {
    id: "replay",
    view,
    onAttached(/** @type {PaneBackgroundPrimitive} */ host) {
      state.host = host;
      if (!scissorsImage) {
        scissorsLoadListeners.add(() => host.requestUpdate());
      }
    },
    onDetached() {
      state.host = undefined;
    },
    requestRefresh() {
      state.host?.requestUpdate();
    },
    setContextProvider(/** @type {ReplayFutureDimState["getContext"]} */ fn) {
      state.getContext = fn;
    },
    setCutBarIndexProvider(/** @type {ReplayFutureDimState["getCutBarIndex"]} */ fn) {
      state.getCutBarIndex = fn;
    },
    setDimBarIndexProvider(/** @type {ReplayFutureDimState["getDimBarIndex"]} */ fn) {
      state.getDimBarIndex = fn;
    },
    setScissorsYProvider(/** @type {ReplayFutureDimState["getScissorsY"]} */ fn) {
      state.getScissorsY = fn;
    },
    setShowCutLineProvider(/** @type {ReplayFutureDimState["getShowCutLine"]} */ fn) {
      state.getShowCutLine = fn;
    },
    setShowScissorsProvider(/** @type {ReplayFutureDimState["getShowScissors"]} */ fn) {
      state.getShowScissors = fn;
    },
    setFillProvider(/** @type {ReplayFutureDimState["getFill"]} */ fn) {
      state.getFill = fn;
    },
    setTimeLabelProvider(/** @type {ReplayFutureDimState["getTimeLabel"]} */ fn) {
      state.getTimeLabel = fn;
    },
    drawData() {
      return replayFutureDimDrawData(state);
    },
  };

  return layer;
}

/** @deprecated Use createReplayFutureDimLayer with PaneBackgroundPrimitive */
export class ReplayFutureDimPrimitive {
  constructor() {
    const layer = createReplayFutureDimLayer();
    this._layer = layer;
    this._paneView = layer.view;
  }

  setContextProvider(fn) {
    this._layer.setContextProvider(fn);
  }
  setCutBarIndexProvider(fn) {
    this._layer.setCutBarIndexProvider(fn);
  }
  setDimBarIndexProvider(fn) {
    this._layer.setDimBarIndexProvider(fn);
  }
  setScissorsYProvider(fn) {
    this._layer.setScissorsYProvider(fn);
  }
  setShowCutLineProvider(fn) {
    this._layer.setShowCutLineProvider(fn);
  }
  setShowScissorsProvider(fn) {
    this._layer.setShowScissorsProvider(fn);
  }
  setFillProvider(fn) {
    this._layer.setFillProvider(fn);
  }
  setTimeLabelProvider(fn) {
    this._layer.setTimeLabelProvider(fn);
  }
  requestRefresh() {
    this._layer.requestRefresh();
  }
  attached(param) {
    this._chart = param.chart;
    this._requestUpdate = param.requestUpdate;
  }
  detached() {}
  updateAllViews() {}
  paneViews() {
    return [this._paneView];
  }
  drawData() {
    return this._layer.drawData();
  }
}

class ReplayFutureDimPaneView {
  /** @param {ReplayFutureDimState} source */
  constructor(source) {
    this._source = source;
  }

  update() {}

  zOrder() {
    return "top";
  }

  renderer() {
    return new ReplayFutureDimPaneRenderer(this._source);
  }
}

class ReplayFutureDimPaneRenderer {
  /** @param {ReplayFutureDimState} source */
  constructor(source) {
    this._source = source;
  }

  draw(target) {
    if (this._source.host?.shouldDeferInteraction?.()) return;

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
    } = replayFutureDimDrawData(this._source);
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
  /** @type {Map<number, { layer: ReturnType<typeof createReplayFutureDimLayer>, attached: boolean }>} */
  const layers = new Map();

  const ensureBackground =
    ctx.ensurePaneBackgroundForPane ??
    ctx.paneExtras?.ensurePaneBackgroundForPane ??
    null;

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
  function getOrCreateLayer(pane) {
    if (!pane?.series) return null;

    let entry = layers.get(pane.index);
    if (entry) return entry;

    const layer = createReplayFutureDimLayer();
    layer.setContextProvider(() => {
      const view = pane._chartView;
      const ta = view?.timeAdapter ?? pane.timeAdapter;
      return {
        bars: pane.bars ?? [],
        barSec: view?.barSec ?? pane.barSec ?? 60,
        timeAdapter: ta ?? null,
      };
    });
    layer.setCutBarIndexProvider(() => {
      const state = replay.getState();
      if (!state.active || !state.selectingBar || state.selectMode !== "bar") return null;
      return pane.replayHoverBarIndex ?? null;
    });
    layer.setDimBarIndexProvider(() => {
      const state = replay.getState();
      if (!state.active || !state.selectingBar || state.selectMode !== "bar") return null;
      return pane.replayHoverBarIndex ?? null;
    });
    layer.setScissorsYProvider(() => {
      const state = replay.getState();
      if (!state.active || !state.selectingBar || state.selectMode !== "bar") return null;
      return pane.replayHoverLocalY ?? null;
    });
    layer.setShowCutLineProvider(() => {
      const state = replay.getState();
      return Boolean(
        state.active &&
          state.selectingBar &&
          state.selectMode === "bar" &&
          pane.replayHoverBarIndex != null,
      );
    });
    layer.setTimeLabelProvider(() => {
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
    layer.setShowScissorsProvider(() => {
      const state = replay.getState();
      return Boolean(
        state.active &&
          state.selectingBar &&
          state.selectMode === "bar" &&
          pane.replayHoverBarIndex != null,
      );
    });
    layer.setFillProvider(resolveFill);
    entry = { layer, attached: false };
    layers.set(pane.index, entry);
    return entry;
  }

  /** @param {object} pane */
  function attachPane(pane) {
    if (!ensureBackground) return null;
    const entry = getOrCreateLayer(pane);
    if (!entry || entry.attached) return entry?.layer ?? null;

    const composite = ensureBackground(pane);
    if (!composite.getLayer("replay")) {
      composite.addLayer(entry.layer);
    }
    pane.replayFutureDim = entry.layer;
    entry.attached = true;
    return entry.layer;
  }

  /** @param {object} pane */
  function detachPane(pane) {
    const entry = layers.get(pane?.index);
    if (!entry?.attached) return;
    pane.backgroundPrimitive?.removeLayer("replay");
    entry.attached = false;
    delete pane.replayFutureDim;
  }

  /** @param {boolean} replayActive */
  function syncAttachment(replayActive) {
    for (const pane of ctx.getAllChartPanes()) {
      if (replayActive) attachPane(pane);
      else detachPane(pane);
    }
  }

  /** @param {object} pane */
  function ensurePane(pane) {
    return attachPane(pane);
  }

  function refreshAll() {
    for (const entry of layers.values()) {
      if (entry.attached) entry.layer.requestRefresh();
    }
  }

  replay.subscribe((state) => {
    syncAttachment(Boolean(state.active));
    refreshAll();
  });

  return { ensurePane, attachPane, detachPane, syncAttachment, refreshAll };
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
