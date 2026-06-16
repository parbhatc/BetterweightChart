import { UserDrawingsPrimitive } from "../primitives/userDrawings/index.js";
import { chartXAt, chartVisibleRightX, pixelToPoint, safePriceToY, coordMapBars, timeToLogical, logicalToChartTime } from "../../chart/coords/timeScale.js";
import { TOOL_LABELS } from "../catalog/tools.js";
import { DRAWING_UI_SELECTOR } from "../constants.js";
import { findDrawingAt, hitDrawingAnchor } from "./hit/test.js";
import { hitTrendLineStatsBox, isTrendLineFamilyType } from "../tools/line/trendStats.js";
import { finalizeMeasureDrawing, isMeasureTool } from "../tools/measure/index.js";
import { finalizeForecastDrawing, isForecastTool } from "../tools/forecast/index.js";
import {
  hitPositionStatsBox,
  finalizePositionDrawing,
  isPositionTool,
} from "../tools/position/barrel.js";
import { ensureTrendAngleDrawing, trendAngleSecondPoint } from "../tools/line/trendAngle.js";
import {
  finalizeParallelChannelDrawing,
  resolvePriceOffset,
} from "../tools/channel/parallel.js";
import {
  finalizeFlatTopBottomDrawing,
  resolveFlatPrice,
} from "../tools/channel/flatTopBottom.js";
import { clampRegressionPoint, finalizeRegressionDrawing, isRegressionTrendTool, normalizeRegressionDrawing } from "../tools/regression/trend.js";
import { finalizeDisjointChannelDrawing } from "../tools/channel/disjoint.js";
import { finalizeFibRetracementDrawing, isFibRetracementTool } from "../tools/fib/retracement.js";
import { finalizeGannDrawing, isGannTool } from "../tools/gann/index.js";
import { finalizePatternDrawing, isPatternTool } from "../tools/pattern/index.js";
import { finalizeCycleDrawing, isCycleTool } from "../tools/cycle/index.js";
import {
  extractToolDefaults,
  isToolDefaultsPatch,
  saveToolDefaults,
} from "../toolbars/defaults/store.js";
import { CURSOR_TOOLS, isCursorTool as isCursorToolType, isMultiPointTool } from "../registry/tools.js";
import { keepsToolAfterCommit } from "../tools/shape/index.js";
import { applyMagnetSnap } from "../tools/snap/magnet.js";
import {
  loadAlwaysRemoveLocked,
  loadDrawingsVisibility,
  loadShowMobilePlacementBar,
  loadStayInDrawingMode,
  saveAlwaysRemoveLocked,
  saveDrawingsVisibility,
  saveShowMobilePlacementBar,
  saveStayInDrawingMode,
} from "../toolbars/utility/settings/store.js";
import { shouldShowLockedRemoveConfirm, showRemoveLockedConfirmDialog } from "../settings/confirm/remove.js";
import { newDrawing, cloneDrawing, CLIPBOARD_PREFIX } from "./factory/index.js";
import { createTooltipOverlay } from "./tooltip/overlay.js";
import { createDrawingDrag } from "./drag/index.js";
import { createPointerHandlers } from "./pointer/handlers.js";
import { createDrawingHistory } from "../history/index.js";

const COARSE_POINTER_MQ = window.matchMedia("(pointer: coarse)");

/**
 * @param {object} opts
 * @param {import("lightweight-charts").IChartApi} opts.chart
 * @param {import("lightweight-charts").ISeriesApi} opts.series
 * @param {HTMLElement} opts.container
 * @param {() => { bars: { time: number, open?: number, high?: number, low?: number, close?: number }[], barSec: number }} opts.getContext
 */
export function createDrawingController(opts) {
  let chart = opts.chart;
  let series = opts.series;
  let container = opts.container;
  let getContext = opts.getContext;
  const primitive = new UserDrawingsPrimitive();
  primitive.setContextProvider(() => getContext());
  series.attachPrimitive(primitive);

  /** @type {import("../types.js").UserDrawing[]} */
  let drawings = [];
  const history = createDrawingHistory();
  let activeTool = "cursor";
  let valuesTooltipOnLongPress = !COARSE_POINTER_MQ.matches;
  /** @type {"off" | "weak" | "strong"} */
  let magnetMode = "off";
  let measureMode = false;
  let drawingsHidden = false;
  let hideAll = false;
  let stayInDrawingMode = false;
  let showMobilePlacementBar = true;
  let lockAllActive = false;
  /** @type {import("../types.js").DrawPoint[]} */
  let placementStaged = [];
  /** @type {import("../types.js").DrawPoint[]} */
  let freehandPoints = [];
  let freehandDrawing = false;
  /** @type {{ x: number, y: number } | null} */
  let freehandLastClient = null;
  /** @type {{ start: import("../types.js").DrawPoint, end: import("../types.js").DrawPoint } | null} */
  let measureOverlay = null;
  let measureDragActive = false;
  /** @type {import("../types.js").UserDrawing | null} */
  let drawingClipboard = null;
  /** @type {import("../types.js").UserDrawing | null} */
  let preview = null;
  /** @type {string | null} */
  let selectedId = null;
  /** @type {string | null} */
  let hoveredId = null;
  let isDraggingDrawing = false;
  let suppressChartPlacementUntil = 0;
  let lastTouchEndAt = 0;

  window.addEventListener(
    "touchend",
    () => {
      lastTouchEndAt = performance.now();
    },
    { capture: true, passive: true },
  );

  const listeners = {
    change: new Set(),
    toolChange: new Set(),
    utilityChange: new Set(),
    cursorOverlay: new Set(),
    selectionChange: new Set(),
    dragChange: new Set(),
    editText: new Set(),
    placementChange: new Set(),
  };

  let overlayRoot =
    container.closest(".tv-chart-wrap__stage") ?? container.closest(".tv-chart-wrap") ?? container;

  const cursorMark = document.createElement("div");
  cursorMark.className = "chart-cursor-mark";
  cursorMark.hidden = true;
  cursorMark.setAttribute("aria-hidden", "true");
  overlayRoot.appendChild(cursorMark);

  const drawCrosshairDot = document.createElement("div");
  drawCrosshairDot.className = "chart-draw-crosshair-dot";
  drawCrosshairDot.hidden = true;
  drawCrosshairDot.setAttribute("aria-hidden", "true");
  overlayRoot.appendChild(drawCrosshairDot);

  let unsubDrawCrosshairDotSync = () => {};

  const valuesTooltip = document.createElement("div");
  valuesTooltip.className = "chart-values-tooltip";
  valuesTooltip.hidden = true;
  valuesTooltip.setAttribute("role", "tooltip");
  overlayRoot.appendChild(valuesTooltip);

  /** @type {() => void} */
  let hideValuesTooltip = () => {
    valuesTooltip.hidden = true;
  };
  /** @type {() => void} */
  let clearLongPress = () => {};
  /** @type {(x: number, y: number) => void} */
  let scheduleLongPress = () => {};
  /** @type {(x: number, y: number) => void} */
  let cancelLongPressIfMoved = () => {};

  let drag = /** @type {ReturnType<typeof createDrawingDrag>} */ (null);
  let bindChartListeners = () => {};
  let unbindChartListeners = () => {};
  let resetMobilePlacementGestureFn = () => {};

  function emit(type) {
    listeners[type].forEach((fn) => fn());
  }

  function setDraggingDrawing(active) {
    if (isDraggingDrawing === active) return;
    isDraggingDrawing = active;
    emit("dragChange");
  }

  function shouldBlockChartPan() {
    if (measureDragActive || freehandDrawing || drag.isDragging()) return true;
    if (placementStaged.length > 0 || preview != null) return true;
    if (!isCursorTool(activeTool) && activeTool !== "eraser") return true;
    return false;
  }

  function emitPlacementChange() {
    emit("placementChange");
  }

  function syncChartPointerHandling() {
    const block = shouldBlockChartPan();
    container.style.touchAction = block ? "none" : "";
    const stage = container.closest(".tv-chart-wrap__stage");
    if (stage instanceof HTMLElement) stage.style.touchAction = block ? "none" : "";
    chart.applyOptions({
      handleScroll: {
        mouseWheel: !block,
        pressedMouseMove: !block,
        horzTouchDrag: !block,
        vertTouchDrag: !block,
      },
      kineticScroll: {
        mouse: true,
        touch: !block,
      },
      handleScale: {
        mouseWheel: true,
        pinch: !block,
        axisPressedMouseMove: { time: !block, price: !block },
      },
    });
  }

  /** @param {MouseEvent} ev */
  function swallowChartPointer(ev) {
    ev.preventDefault();
    ev.stopImmediatePropagation();
  }

  function isCursorTool(tool = activeTool) {
    return isCursorToolType(tool);
  }

  function setPreview(p) {
    preview = p;
    primitive.setPreview(p);
    syncChartPointerHandling();
    emitPlacementChange();
  }

  function setMeasureOverlay(overlay) {
    measureOverlay = overlay;
    primitive.setMeasureOverlay(overlay);
  }

  function syncDrawingsToPrimitive() {
    primitive.setDrawings(drawings);
    primitive.setDrawingsHidden(drawingsHidden || hideAll);
  }

  function selectDrawing(id) {
    if (id) {
      const idx = drawings.findIndex((d) => d.id === id);
      if (idx >= 0) {
        const { barSec = 60 } = getContext();
        const next = ensureTrendAngleDrawing(drawings[idx], barSec);
        if (next !== drawings[idx]) {
          drawings = drawings.map((d, i) => (i === idx ? next : d));
          syncDrawingsToPrimitive();
        }
      }
    }
    selectedId = id;
    primitive.setSelectedId(id);
    emit("selectionChange");
  }

  function setHoveredDrawing(id) {
    if (hoveredId === id) return;
    hoveredId = id;
    primitive.setHoveredId(id);
  }

  function updateDrawingHover(clientX, clientY) {
    if (!isCursorTool(activeTool) || drag?.isDragging?.() || placementStaged.length > 0 || preview != null) {
      setHoveredDrawing(null);
      return;
    }
    const rect = container.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const idx = findDrawingAt(drawings, px, py, drawingCoords);
    const id = idx >= 0 ? (drawings[idx]?.id ?? null) : null;
    setHoveredDrawing(id);
  }

  function snapshotState() {
    return { drawings: structuredClone(drawings), selectedId };
  }

  /** @param {{ drawings: import("../types.js").UserDrawing[], selectedId: string | null }} snap */
  function restoreSnapshot(snap) {
    drawings = structuredClone(snap.drawings);
    selectedId = snap.selectedId;
    primitive.setSelectedId(selectedId);
    syncDrawingsToPrimitive();
    emit("change");
    emit("selectionChange");
  }

  function recordHistory() {
    history.record(snapshotState());
  }

  function undoDrawing() {
    const snap = history.undo(snapshotState());
    if (snap) restoreSnapshot(snap);
    return Boolean(snap);
  }

  function redoDrawing() {
    const snap = history.redo(snapshotState());
    if (snap) restoreSnapshot(snap);
    return Boolean(snap);
  }

  function commitDrawing(drawing) {
    recordHistory();
    let committed = drawing;
    if (isRegressionTrendTool(drawing.type)) {
      const { bars, barSec } = getContext();
      committed = finalizeRegressionDrawing(drawing, bars, barSec);
    }
    saveToolDefaults(committed.type, extractToolDefaults(committed));
    drawings = [...drawings, committed];
    syncDrawingsToPrimitive();
    resetPlacement();
    if (stayInDrawingMode) {
      selectDrawing(null);
    } else {
      selectDrawing(committed.id);
      if (!keepsToolAfterCommit(committed.type)) setActiveTool("cursor");
    }
    emit("change");
    if (
      shouldSyncDrawCrosshair() &&
      isCursorTool(activeTool) === false &&
      !COARSE_POINTER_MQ.matches
    ) {
      requestAnimationFrame(() => {
        repinDrawCrosshair();
        requestAnimationFrame(repinDrawCrosshair);
      });
    }
  }

  function copySelectedDrawing() {
    const sel = getSelectedDrawing();
    if (!sel) return false;
    drawingClipboard = JSON.parse(JSON.stringify(sel));
    try {
      navigator.clipboard.writeText(`${CLIPBOARD_PREFIX}${JSON.stringify(drawingClipboard)}`);
    } catch {
      /* ignore */
    }
    return true;
  }

  function hasDrawingClipboard() {
    return drawingClipboard != null;
  }

  /**
   * @param {import("../types.js").UserDrawing} [source]
   */
  function pasteDrawing(source) {
    const src = source ?? drawingClipboard;
    if (!src) return false;
    const { barSec = 60 } = getContext();
    const pasted = cloneDrawing(src, { timeDelta: barSec });
    commitDrawing(pasted);
    drawingClipboard = JSON.parse(JSON.stringify(src));
    return true;
  }

  async function pasteDrawingFromSystemClipboard() {
    if (drawingClipboard && pasteDrawing()) return true;
    try {
      const text = await navigator.clipboard.readText();
      if (!text.startsWith(CLIPBOARD_PREFIX)) return false;
      const parsed = JSON.parse(text.slice(CLIPBOARD_PREFIX.length));
      if (!parsed?.type || !Array.isArray(parsed.points)) return false;
      drawingClipboard = parsed;
      return pasteDrawing(parsed);
    } catch {
      return false;
    }
  }

  function resetPlacement() {
    placementStaged = [];
    freehandPoints = [];
    freehandDrawing = false;
    freehandLastClient = null;
    setPreview(null);
    resetMobilePlacementGestureFn();
  }

  function cancelPlacement() {
    resetPlacement();
    setMeasureOverlay(null);
    measureDragActive = false;
    drag.forceEnd();
    syncChartPointerHandling();
  }

  function finishMultiPointPlacement() {
    if (!isMultiPointTool(activeTool) || placementStaged.length < 2) {
      resetPlacement();
      return;
    }
    commitDrawing(newDrawing(activeTool, [...placementStaged]));
    resetPlacement();
  }

  function clearAll() {
    if (drawings.length) recordHistory();
    drawings = [];
    resetPlacement();
    setMeasureOverlay(null);
    measureDragActive = false;
    selectDrawing(null);
    syncDrawingsToPrimitive();
    emit("change");
  }

  function removeDrawings(opts = {}) {
    const includeLocked = Boolean(opts.includeLocked);
    if (!drawings.length) return;

    const lockedCount = drawings.filter((d) => d.locked).length;
    const unlockedCount = drawings.length - lockedCount;

    const doRemoveAll = () => {
      recordHistory();
      drawings = [];
      setMeasureOverlay(null);
      measureDragActive = false;
      selectDrawing(null);
      syncDrawingsToPrimitive();
      emit("change");
    };

    const doRemoveUnlocked = () => {
      if (!unlockedCount) return;
      recordHistory();
      drawings = drawings.filter((d) => !d.locked);
      selectDrawing(null);
      syncDrawingsToPrimitive();
      emit("change");
    };

    if (includeLocked) {
      doRemoveAll();
      return;
    }

    if (lockedCount > 0) {
      if (!unlockedCount) {
        if (shouldShowLockedRemoveConfirm()) {
          showRemoveLockedConfirmDialog({
            onYes: doRemoveAll,
            onNo: () => {},
          });
          return;
        }
        doRemoveAll();
        return;
      }
      if (shouldShowLockedRemoveConfirm()) {
        showRemoveLockedConfirmDialog({
          onYes: doRemoveAll,
          onNo: doRemoveUnlocked,
        });
        return;
      }
      doRemoveUnlocked();
      return;
    }

    doRemoveAll();
  }

  function getLockedCount() {
    return drawings.filter((d) => d.locked).length;
  }

  function setMagnetMode(mode) {
    magnetMode = mode === "off" || mode === "strong" ? mode : "weak";
    emit("utilityChange");
  }

  function getMagnetMode() {
    return magnetMode;
  }

  function setMeasureMode(on) {
    measureMode = Boolean(on);
    if (!measureMode) {
      setMeasureOverlay(null);
      measureDragActive = false;
    }
    emit("utilityChange");
    syncChartPointerHandling();
  }

  function getMeasureMode() {
    return measureMode;
  }

  function setDrawingsHidden(hidden) {
    drawingsHidden = Boolean(hidden);
    hideAll = false;
    syncDrawingsToPrimitive();
    saveDrawingsVisibility({ drawingsHidden, hideAll });
    emit("utilityChange");
  }

  function getDrawingsHidden() {
    return drawingsHidden;
  }

  function setHideAll(hidden) {
    hideAll = Boolean(hidden);
    if (hideAll) drawingsHidden = true;
    syncDrawingsToPrimitive();
    saveDrawingsVisibility({ drawingsHidden, hideAll });
    emit("utilityChange");
  }

  function getHideAll() {
    return hideAll;
  }

  function setStayInDrawingMode(on) {
    stayInDrawingMode = Boolean(on);
    saveStayInDrawingMode(stayInDrawingMode);
    emit("utilityChange");
  }

  function getStayInDrawingMode() {
    return stayInDrawingMode;
  }

  function setShowMobilePlacementBar(on) {
    showMobilePlacementBar = Boolean(on);
    saveShowMobilePlacementBar(showMobilePlacementBar);
    emit("utilityChange");
  }

  function getShowMobilePlacementBar() {
    return showMobilePlacementBar;
  }

  function setLockAllDrawings(locked) {
    lockAllActive = Boolean(locked);
    drawings = drawings.map((d) => ({ ...d, locked: lockAllActive }));
    syncDrawingsToPrimitive();
    emit("change");
    emit("utilityChange");
  }

  function getLockAllDrawings() {
    return lockAllActive;
  }

  function setAlwaysRemoveLocked(value) {
    saveAlwaysRemoveLocked(Boolean(value));
    emit("utilityChange");
  }

  function getAlwaysRemoveLocked() {
    return loadAlwaysRemoveLocked();
  }

  function getIndicatorCount() {
    return 0;
  }

  function setActiveTool(tool) {
    activeTool = tool || "cursor";
    drag.forceEnd();
    resetPlacement();
    hideValuesTooltip();
    updateCursorMarkVisibility();
    if (!isCursorTool(activeTool)) {
      selectDrawing(null);
      suppressChartPlacementUntil = performance.now() + 450;
      requestAnimationFrame(() => {
        initDrawCrosshairAtCenter();
        requestAnimationFrame(initDrawCrosshairAtCenter);
      });
    } else {
      pinnedDrawCrosshair = null;
      chart.clearCrosshairPosition();
      drawCrosshairDot.hidden = true;
    }
    syncChartPointerHandling();
    emit("toolChange");
    emit("cursorOverlay");
    if (!isCursorTool(activeTool)) {
      requestAnimationFrame(() => syncChartPointerHandling());
    }
  }

  function armChartPlacementSuppress(ms = 450) {
    suppressChartPlacementUntil = performance.now() + ms;
  }

  function isChartPlacementSuppressed() {
    return performance.now() < suppressChartPlacementUntil;
  }

  function recentTouchInteraction() {
    return performance.now() - lastTouchEndAt < 700;
  }

  function setValuesTooltipOnLongPress(on) {
    valuesTooltipOnLongPress = Boolean(on);
  }

  function getValuesTooltipOnLongPress() {
    return valuesTooltipOnLongPress;
  }

  function resolveChartPoint(clientX, clientY) {
    const rect = container.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const { barSec } = getContext();
    const mapBars = coordMapBars(getContext());
    const point = pixelToPoint(chart, series, mapBars, barSec, x, y);
    if (!point) return null;
    return applyMagnetSnap(point, magnetMode, mapBars);
  }

  function resolvePoint(clientX, clientY) {
    const ctx = getContext();
    const point = resolveChartPoint(clientX, clientY);
    if (!point) return null;
    const toUtc = ctx.chartTimeToUtc ?? ((t) => t);
    return { ...point, time: toUtc(point.time) };
  }

  function shouldSyncDrawCrosshair(tool = activeTool) {
    if (isCursorTool(tool)) return false;
    if (tool === "eraser" || tool === "arrow") return false;
    return true;
  }

  /** @type {{ price: number, time: number } | null} */
  let pinnedDrawCrosshair = null;
  /** @type {{ price: number, time: number } | null} */
  let lastNativeDrawCrosshair = null;
  /** @type {{ x: number, y: number } | null} */
  let drawCrosshairMedia = null;
  let anchoringDrawCrosshair = false;
  /** @type {import("lightweight-charts").MouseEventParams | null} */
  let lastDrawCrosshairParam = null;

  function rememberNativeDrawCrosshairFromParam(param) {
    if (!param?.point || param.time == null) return;
    const price = series.coordinateToPrice(param.point.y);
    if (price == null || !Number.isFinite(price)) return;
    lastNativeDrawCrosshair = { price, time: param.time };
  }

  function getDrawCrosshairMedia() {
    return drawCrosshairMedia;
  }

  function resolveDrawCrosshairPoint() {
    if (!drawCrosshairMedia) return null;
    const { barSec } = getContext();
    const mapBars = coordMapBars(getContext());
    return pixelToPoint(
      chart,
      series,
      mapBars,
      barSec,
      drawCrosshairMedia.x,
      drawCrosshairMedia.y,
    );
  }

  function syncDrawCrosshairAtMediaAnchor() {
    if (anchoringDrawCrosshair || !shouldSyncDrawCrosshair() || !drawCrosshairMedia) return;
    const { barSec } = getContext();
    const mapBars = coordMapBars(getContext());
    const point = pixelToPoint(
      chart,
      series,
      mapBars,
      barSec,
      drawCrosshairMedia.x,
      drawCrosshairMedia.y,
    );
    if (!point) return;
    lastNativeDrawCrosshair = { price: point.price, time: point.time };
    anchoringDrawCrosshair = true;
    try {
      chart.setCrosshairPosition(point.price, point.time, series);
    } finally {
      anchoringDrawCrosshair = false;
    }
    if (COARSE_POINTER_MQ.matches) {
      syncDrawCrosshairDotFromChart({ point: drawCrosshairMedia, time: point.time });
    }
  }

  function setDrawCrosshairAtClient(clientX, clientY) {
    if (!shouldSyncDrawCrosshair()) return;
    const rect = container.getBoundingClientRect();
    drawCrosshairMedia = { x: clientX - rect.left, y: clientY - rect.top };
    syncDrawCrosshairAtMediaAnchor();
  }

  function applyCrosshairScrollDelta(dx, dy, anchorX, anchorY) {
    if (!shouldSyncDrawCrosshair()) return;
    const rect = container.getBoundingClientRect();
    const pad = 2;
    const paneW = rect.width;
    const paneH = rect.height;
    const { barSec } = getContext();
    const mapBars = coordMapBars(getContext());
    const ts = chart.timeScale();
    const barSpacing = ts.options().barSpacing ?? 8;

    const anchorPoint = pixelToPoint(chart, series, mapBars, barSec, anchorX, anchorY);
    if (!anchorPoint) return;

    const barDelta = Math.round(dx / barSpacing);
    const logical = timeToLogical(mapBars, barSec, anchorPoint.time);
    if (logical == null || !Number.isFinite(logical)) return;
    const newTime = logicalToChartTime(mapBars, barSec, logical + barDelta);

    const newMediaY = Math.max(pad, Math.min(paneH - pad, anchorY + dy));
    const newPrice = series.coordinateToPrice(newMediaY);
    if (newTime == null || newPrice == null || !Number.isFinite(newPrice)) return;

    const newMediaX = chartXAt(ts, mapBars, barSec, undefined, newTime);
    const newMediaYFromPrice = safePriceToY(series, newPrice);
    if (newMediaX == null || newMediaYFromPrice == null) return;

    drawCrosshairMedia = {
      x: Math.max(pad, Math.min(paneW - pad, newMediaX)),
      y: Math.max(pad, Math.min(paneH - pad, newMediaYFromPrice)),
    };
    syncDrawCrosshairAtMediaAnchor();
  }

  function syncDrawCrosshairDotFromChart(param = lastDrawCrosshairParam) {
    if (!COARSE_POINTER_MQ.matches || !shouldSyncDrawCrosshair()) {
      drawCrosshairDot.hidden = true;
      return;
    }
    const dotPoint = drawCrosshairMedia ?? param?.point;
    if (dotPoint) {
      lastDrawCrosshairParam = { ...(param ?? {}), point: dotPoint };
    }
    if (!dotPoint) {
      drawCrosshairDot.hidden = true;
      return;
    }
    drawCrosshairDot.style.left = `${dotPoint.x}px`;
    drawCrosshairDot.style.top = `${dotPoint.y}px`;
    drawCrosshairDot.hidden = false;
  }

  function syncDrawCrosshairDot() {
    if (COARSE_POINTER_MQ.matches) {
      syncDrawCrosshairDotFromChart();
      return;
    }
    if (!shouldSyncDrawCrosshair() || !pinnedDrawCrosshair) {
      drawCrosshairDot.hidden = true;
      return;
    }
    const { barSec } = getContext();
    const mapBars = coordMapBars(getContext());
    const x = chartXAt(chart.timeScale(), mapBars, barSec, undefined, pinnedDrawCrosshair.time);
    const y = safePriceToY(series, pinnedDrawCrosshair.price);
    if (x == null || y == null || !Number.isFinite(x) || !Number.isFinite(y)) {
      drawCrosshairDot.hidden = true;
      return;
    }
    drawCrosshairDot.style.left = `${x}px`;
    drawCrosshairDot.style.top = `${y}px`;
    drawCrosshairDot.hidden = false;
  }

  function bindDrawCrosshairDotSync() {
    unsubDrawCrosshairDotSync();
    const onMove = (param) => {
      if (!COARSE_POINTER_MQ.matches || !shouldSyncDrawCrosshair()) return;
      if (drawCrosshairMedia) {
        syncDrawCrosshairDotFromChart({
          point: drawCrosshairMedia,
          time: lastNativeDrawCrosshair?.time ?? param?.time,
        });
        return;
      }
      if (param?.point && param.time != null) {
        rememberNativeDrawCrosshairFromParam(param);
        syncDrawCrosshairDotFromChart(param);
      }
    };
    const onRange = () => {
      if (drawCrosshairMedia && shouldSyncDrawCrosshair()) syncDrawCrosshairAtMediaAnchor();
    };
    chart.subscribeCrosshairMove(onMove);
    chart.timeScale().subscribeVisibleLogicalRangeChange(onRange);
    unsubDrawCrosshairDotSync = () => {
      chart.unsubscribeCrosshairMove(onMove);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRange);
    };
  }

  function initDrawCrosshairAtCenter() {
    if (!shouldSyncDrawCrosshair()) return;
    const rect = container.getBoundingClientRect();
    setDrawCrosshairAtClient(rect.left + rect.width / 2, rect.top + rect.height / 2);
    if (!COARSE_POINTER_MQ.matches) {
      const point = resolveChartPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      if (point) pinnedDrawCrosshair = { price: point.price, time: point.time };
      syncDrawCrosshairDot();
    }
  }

  function syncDrawCrosshair(clientX, clientY) {
    if (!shouldSyncDrawCrosshair() || COARSE_POINTER_MQ.matches) return;
    const point = resolveChartPoint(clientX, clientY);
    if (!point) return;
    pinnedDrawCrosshair = { price: point.price, time: point.time };
    chart.setCrosshairPosition(point.price, point.time, series);
    syncDrawCrosshairDot();
  }

  function repinDrawCrosshair() {
    if (!shouldSyncDrawCrosshair() || COARSE_POINTER_MQ.matches || !pinnedDrawCrosshair) return;
    chart.setCrosshairPosition(pinnedDrawCrosshair.price, pinnedDrawCrosshair.time, series);
    syncDrawCrosshairDot();
  }

  function pinDrawCrosshairAt(clientX, clientY) {
    if (COARSE_POINTER_MQ.matches) return;
    syncDrawCrosshair(clientX, clientY);
    requestAnimationFrame(() => {
      repinDrawCrosshair();
      requestAnimationFrame(repinDrawCrosshair);
    });
  }

  function clearDrawCrosshair() {
    pinnedDrawCrosshair = null;
    lastNativeDrawCrosshair = null;
    drawCrosshairMedia = null;
    lastDrawCrosshairParam = null;
    chart.clearCrosshairPosition();
    drawCrosshairDot.hidden = true;
  }

  function resolveRegressionPoint(clientX, clientY) {
    const point = resolvePoint(clientX, clientY);
    if (!point) return null;
    const { bars, barSec } = getContext();
    return clampRegressionPoint(point, bars, barSec);
  }

  ({ hideValuesTooltip, clearLongPress, scheduleLongPress, cancelLongPressIfMoved } =
    createTooltipOverlay({
      getContext,
      resolvePoint,
      valuesTooltip,
      overlayRoot,
    }));

  function drawingCoords(drawing) {
    const ctx = getContext();
    const { barSec } = ctx;
    const mapBars = coordMapBars(ctx);
    const ts = chart.timeScale();
    const toChart = ctx.utcToChartTime ?? ((t) => t);
    const timeToX = (t) => chartXAt(ts, mapBars, barSec, undefined, toChart(t));
    const priceToY = (p) => safePriceToY(series, p);
    const right = chartVisibleRightX(ts) ?? 0;
    const bottom = container.clientHeight || 400;

    const pts = drawing.points.map((p) => {
      const x = timeToX(p.time);
      const y = priceToY(p.price);
      if (x == null || y == null) return null;
      return { x, y };
    });

    return { pts, right, bottom, timeToX, priceToY, bars: ctx.bars };
  }

  function findStatsHit(px, py) {
    const ctx = getContext();
    for (let i = drawings.length - 1; i >= 0; i -= 1) {
      const drawing = drawings[i];
      if (drawing.locked || (!isTrendLineFamilyType(drawing.type) && !isPositionTool(drawing.type))) continue;
      const { pts, timeToX, priceToY } = drawingCoords(drawing);
      const a = pts[0];
      let b = pts[1];
      if (!a || !b) continue;
      const isSelected = drawing.id === selectedId;
      const isHovered = drawing.id === hoveredId;
      if (isPositionTool(drawing.type) && timeToX && priceToY) {
        if (
          hitPositionStatsBox(drawing, px, py, timeToX, priceToY, {
            isSelected,
            isHovered,
            hoveredDrawingId: hoveredId,
            precision: ctx.precision,
            bars: ctx.bars,
          })
        ) {
          return drawing;
        }
        continue;
      }
      if (!b && drawing.type === "trend-angle") {
        const p2 = trendAngleSecondPoint(drawing);
        if (p2 && timeToX && priceToY) {
          const x = timeToX(p2.time);
          const y = priceToY(p2.price);
          if (x != null && y != null) b = { x, y };
        }
      }
      if (!a || !b) continue;
      if (
        hitTrendLineStatsBox(drawing, px, py, a, b, {
          isSelected,
          barSec: ctx.barSec,
          precision: ctx.precision,
        })
      ) {
        return drawing;
      }
    }
    return null;
  }

  function findAnchorHit(px, py) {
    const selected = getSelectedDrawing();
    if (selected && !selected.locked) {
      const anchorIdx = hitDrawingAnchor(selected, px, py, drawingCoords);
      if (anchorIdx >= 0) return { drawing: selected, pointIndex: anchorIdx };
    }

    for (let i = drawings.length - 1; i >= 0; i -= 1) {
      const drawing = drawings[i];
      if (drawing.locked || drawing.id === selectedId) continue;
      const anchorIdx = hitDrawingAnchor(drawing, px, py, drawingCoords);
      if (anchorIdx >= 0) return { drawing, pointIndex: anchorIdx };
    }
    return null;
  }

  function findDrawingAtPointer(clientX, clientY) {
    const rect = container.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    return findDrawingAt(drawings, px, py, drawingCoords);
  }

  function removeDrawingAt(index) {
    recordHistory();
    const removed = drawings[index];
    drawings = drawings.filter((_, i) => i !== index);
    if (removed?.id === selectedId) selectDrawing(null);
    syncDrawingsToPrimitive();
    emit("change");
  }

  function removeDrawingById(id) {
    const idx = drawings.findIndex((d) => d.id === id);
    if (idx >= 0) removeDrawingAt(idx);
  }

  /**
   * @param {import("../types.js").UserDrawing[]} next
   * @param {{ silent?: boolean }} [opts]
   */
  function replaceDrawings(next, opts = {}) {
    drawings = structuredClone(next);
    if (!drawings.some((d) => d.id === selectedId)) selectDrawing(null);
    syncDrawingsToPrimitive();
    if (!opts.silent) emit("change");
  }

  function updateDrawing(id, patch, opts = {}) {
    const idx = drawings.findIndex((d) => d.id === id);
    if (idx < 0) return;
    if (!opts.silent) recordHistory();
    drawings = drawings.map((d) => {
      if (d.id !== id) return d;
      const merged = { ...d, ...patch };
      if (d.type === "parallel-channel") return finalizeParallelChannelDrawing(merged);
      if (d.type === "flat-top-bottom") return finalizeFlatTopBottomDrawing(merged);
      if (d.type === "disjoint-channel") return finalizeDisjointChannelDrawing(merged);
      if (isFibRetracementTool(d.type)) return finalizeFibRetracementDrawing(merged);
      if (isGannTool(d.type)) return finalizeGannDrawing(merged);
      if (isPatternTool(d.type)) return finalizePatternDrawing(merged);
      if (isCycleTool(d.type)) return finalizeCycleDrawing(merged);
      if (d.type === "regression-trend") return normalizeRegressionDrawing(merged);
      if (isPositionTool(d.type)) return finalizePositionDrawing(merged);
      if (isForecastTool(d.type)) return finalizeForecastDrawing(merged);
      if (isMeasureTool(d.type)) return finalizeMeasureDrawing(merged);
      return merged;
    });
    const updated = drawings.find((d) => d.id === id);
    if (updated && isToolDefaultsPatch(patch, updated.type)) {
      saveToolDefaults(updated.type, extractToolDefaults(updated));
    }
    primitive.setDrawings(drawings);
    if (!opts.silent) emit("change");
  }

  function appendFreehandPoint(clientX, clientY, point) {
    if (freehandLastClient) {
      const dist = Math.hypot(clientX - freehandLastClient.x, clientY - freehandLastClient.y);
      if (dist < 3) return;
    }
    freehandLastClient = { x: clientX, y: clientY };
    freehandPoints.push(point);
    setPreview(newDrawing(activeTool, [...freehandPoints]));
  }

  function getSelectedDrawing() {
    return drawings.find((d) => d.id === selectedId) ?? null;
  }

  function getDrawingScreenAnchor(drawing) {
    const { pts } = drawingCoords(drawing);
    if (!pts[0]) return null;
    const a = pts[0];
    const b = pts[1] ?? pts[0];
    const rect = container.getBoundingClientRect();
    return {
      left: rect.left + (a.x + b.x) / 2,
      top: rect.top + (a.y + b.y) / 2,
    };
  }

  function updateCursorMark(clientX, clientY, point) {
    if (!["dot", "demonstration"].includes(activeTool)) {
      cursorMark.hidden = true;
      return;
    }
    const rect = container.getBoundingClientRect();
    const x = point?.x ?? clientX - rect.left;
    const y = point?.y ?? clientY - rect.top;
    cursorMark.style.left = `${x}px`;
    cursorMark.style.top = `${y}px`;
    cursorMark.classList.toggle("chart-cursor-mark--demo", activeTool === "demonstration");
    cursorMark.hidden = false;
  }

  function hideCursorMark() {
    cursorMark.hidden = true;
  }

  function updateCursorMarkVisibility() {
    if (!["dot", "demonstration"].includes(activeTool)) {
      cursorMark.hidden = true;
    }
  }

  /** @param {import("../types.js").DrawPoint} point */
  function startFreehand(point, clientX, clientY, ev) {
    freehandDrawing = true;
    freehandPoints = [point];
    freehandLastClient = { x: clientX, y: clientY };
    if (ev) drag.beginPointerSession(ev);
    setPreview(newDrawing(activeTool, [point]));
    syncChartPointerHandling();
    bindFreehandDocumentListeners();
  }

  function finishFreehand() {
    if (!freehandDrawing) return;
    freehandDrawing = false;
    unbindFreehandDocumentListeners();
    drag.endPointerSession();
    if (freehandPoints.length >= 2) {
      commitDrawing(newDrawing(activeTool, [...freehandPoints]));
    }
    freehandPoints = [];
    freehandLastClient = null;
    setPreview(null);
    syncChartPointerHandling();
  }

  /** @param {MouseEvent | PointerEvent} ev */
  function onFreehandDocumentMove(ev) {
    if (!freehandDrawing) return;
    syncDrawCrosshair(ev.clientX, ev.clientY);
    const point = resolvePoint(ev.clientX, ev.clientY);
    if (point) appendFreehandPoint(ev.clientX, ev.clientY, point);
  }

  function onFreehandDocumentUp() {
    if (freehandDrawing) finishFreehand();
  }

  let freehandDocumentListenersBound = false;

  function bindFreehandDocumentListeners() {
    if (freehandDocumentListenersBound) return;
    freehandDocumentListenersBound = true;
    document.addEventListener("pointermove", onFreehandDocumentMove);
    document.addEventListener("mousemove", onFreehandDocumentMove);
    document.addEventListener("pointerup", onFreehandDocumentUp);
    document.addEventListener("mouseup", onFreehandDocumentUp);
    document.addEventListener("pointercancel", onFreehandDocumentUp);
  }

  function unbindFreehandDocumentListeners() {
    if (!freehandDocumentListenersBound) return;
    freehandDocumentListenersBound = false;
    document.removeEventListener("pointermove", onFreehandDocumentMove);
    document.removeEventListener("mousemove", onFreehandDocumentMove);
    document.removeEventListener("pointerup", onFreehandDocumentUp);
    document.removeEventListener("mouseup", onFreehandDocumentUp);
    document.removeEventListener("pointercancel", onFreehandDocumentUp);
  }

  const pointerApi = {
    container,
    overlayRoot,
    chart,
    DRAWING_UI_SELECTOR,
    getActiveTool: () => activeTool,
    setActiveTool,
    isCursorTool,
    getDrawings: () => drawings,
    getPlacementStaged: () => placementStaged,
    getPreview: () => preview,
    setPreview,
    resetPlacement,
    commitDrawing,
    finishMultiPointPlacement,
    getContext,
    resolvePoint,
    shouldSyncDrawCrosshair,
    syncDrawCrosshair,
    setDrawCrosshairAtClient,
    applyCrosshairScrollDelta,
    syncDrawCrosshairAtMediaAnchor,
    getDrawCrosshairMedia,
    resolveDrawCrosshairPoint,
    pinDrawCrosshairAt,
    repinDrawCrosshair,
    clearDrawCrosshair,
    resolveRegressionPoint,
    resolvePriceOffset,
    resolveFlatPrice,
    swallowChartPointer,
    syncChartPointerHandling,
    findDrawingAtPointer,
    updateDrawingHover,
    setHoveredDrawing,
    findStatsHit,
    findAnchorHit,
    selectDrawing,
    removeDrawingAt,
    getMeasureMode,
    getMeasureDragActive: () => measureDragActive,
    setMeasureDragActive: (on) => {
      measureDragActive = on;
    },
    getMeasureOverlay: () => measureOverlay,
    setMeasureOverlay,
    getFreehandDrawing: () => freehandDrawing,
    startFreehand,
    appendFreehandPoint,
    finishFreehand,
    getValuesTooltipOnLongPress,
    scheduleLongPress,
    cancelLongPressIfMoved,
    clearLongPress,
    hideValuesTooltip,
    updateCursorMark,
    hideCursorMark,
    emitEditText: (drawing) => listeners.editText.forEach((fn) => fn(drawing)),
    emitChange: () => emit("change"),
    setDraggingDrawing,
    updateDrawing,
    queuePendingDrag: (state) => drag.queuePendingDrag(state),
    beginPointerSession: (ev) => drag.beginPointerSession(ev),
    endPointerSession: (ev) => drag.endPointerSession(ev),
    tryActivateDrag: (x, y) => drag.tryActivateDrag(x, y),
    applyDrawingDrag: (x, y) => drag.applyDrawingDrag(x, y),
    finishPointerDrag: (ev) => drag.finishPointerDrag(ev),
    tryAnchorDrag: (ev, px, py) => drag.tryAnchorDrag(ev, px, py),
    isPrimaryButtonDown: (ev) => drag.isPrimaryButtonDown(ev),
    isDragging: () => drag.isDragging(),
    hasActiveDrag: () => drag.hasActiveDrag(),
    isChartPlacementSuppressed,
    recentTouchInteraction,
    armChartPlacementSuppress,
    useMobileDragPlacement: () => COARSE_POINTER_MQ.matches,
  };

  drag = createDrawingDrag({
    getDrawings: () => drawings,
    updateDrawing,
    resolvePoint,
    syncChartPointerHandling,
    emitChange: () => emit("change"),
    setDraggingDrawing,
    clearLongPress,
    hideValuesTooltip,
    selectDrawing,
    setActiveTool,
    isCursorTool,
    swallowChartPointer,
    findAnchorHit,
    setRegressionGuideDrawingId: (id) => primitive.setRegressionGuideDrawingId(id),
    getContext,
    getContainer: () => container,
    recordHistorySnapshot: recordHistory,
  });

  function shouldHandleDrawingShortcut(ev) {
    if (ev.target instanceof HTMLInputElement || ev.target instanceof HTMLTextAreaElement) return false;
    if (document.querySelector(".tv-settings:not([hidden])")) return false;
    if (document.querySelector(".tv-drawing-settings:not([hidden])")) return false;
    return true;
  }

  function onKeyDown(ev) {
    if (ev.key === "Escape") {
      if (isMultiPointTool(activeTool) && placementStaged.length >= 2) {
        finishMultiPointPlacement();
        hideValuesTooltip();
        drag.forceEnd();
        syncChartPointerHandling();
        return;
      }
      resetPlacement();
      setMeasureOverlay(null);
      measureDragActive = false;
      hideValuesTooltip();
      drag.forceEnd();
      if (!isCursorTool(activeTool) && !measureMode && !isMultiPointTool(activeTool)) setActiveTool("cursor");
      else if (isCursorTool(activeTool)) selectDrawing(null);
      syncChartPointerHandling();
    }
    if (ev.key === "Enter" && isMultiPointTool(activeTool)) {
      finishMultiPointPlacement();
    }
    if ((ev.key === "Delete" || ev.key === "Backspace") && drawings.length) {
      if (ev.target instanceof HTMLInputElement || ev.target instanceof HTMLTextAreaElement) return;
      ev.preventDefault();
      removeDrawings({ includeLocked: getAlwaysRemoveLocked() });
    }
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "c") {
      if (ev.target instanceof HTMLInputElement || ev.target instanceof HTMLTextAreaElement) return;
      if (copySelectedDrawing()) ev.preventDefault();
    }
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "v") {
      if (ev.target instanceof HTMLInputElement || ev.target instanceof HTMLTextAreaElement) return;
      ev.preventDefault();
      if (!pasteDrawing()) void pasteDrawingFromSystemClipboard();
    }
    if (shouldHandleDrawingShortcut(ev) && (ev.ctrlKey || ev.metaKey)) {
      const key = ev.key.toLowerCase();
      const isUndo = key === "z" && !ev.shiftKey;
      const isRedo = key === "y" || (key === "z" && ev.shiftKey);
      if (isUndo && undoDrawing()) {
        ev.preventDefault();
      } else if (isRedo && redoDrawing()) {
        ev.preventDefault();
      }
    }
  }

  ({ bindChartListeners, unbindChartListeners, resetMobilePlacementGesture: resetMobilePlacementGestureFn } =
    createPointerHandlers(pointerApi));

  /**
   * @param {{ chart: import("lightweight-charts").IChartApi, series: import("lightweight-charts").ISeriesApi, container: HTMLElement, getContext?: () => object }} next
   */
  function setTarget(next) {
    if (next.chart === chart && next.container === container) return;
    drag.forceEnd();
    unbindChartListeners();
    unsubDrawCrosshairDotSync();
    series.detachPrimitive(primitive);

    chart = next.chart;
    series = next.series;
    container = next.container;
    if (next.getContext) getContext = next.getContext;

    const nextOverlay =
      container.closest(".tv-chart-wrap__stage") ?? container.closest(".tv-chart-wrap") ?? container;
    if (nextOverlay !== overlayRoot) {
      nextOverlay.appendChild(cursorMark);
      nextOverlay.appendChild(drawCrosshairDot);
      nextOverlay.appendChild(valuesTooltip);
      overlayRoot = nextOverlay;
    }

    pointerApi.container = container;
    pointerApi.overlayRoot = overlayRoot;
    pointerApi.chart = chart;

    series.attachPrimitive(primitive);
    bindChartListeners();
    bindDrawCrosshairDotSync();
    syncChartPointerHandling();
    primitive.setDrawings(drawings);
  }

  bindChartListeners();
  bindDrawCrosshairDotSync();
  document.addEventListener("keydown", onKeyDown);
  const onWindowBlur = () => drag.finishPointerDrag();
  window.addEventListener("blur", onWindowBlur);

  const savedVisibility = loadDrawingsVisibility();
  if (savedVisibility.hideAll) setHideAll(true);
  else if (savedVisibility.drawingsHidden) setDrawingsHidden(true);
  if (loadStayInDrawingMode()) setStayInDrawingMode(true);
  showMobilePlacementBar = loadShowMobilePlacementBar();

  return {
    setActiveTool,
    armChartPlacementSuppress,
    getActiveTool: () => activeTool,
    isCursorTool,
    getToolLabel: () => TOOL_LABELS[activeTool] ?? activeTool,
    setValuesTooltipOnLongPress,
    getValuesTooltipOnLongPress,
    getDrawings: () => drawings,
    getCount: () => drawings.length,
    getLockedCount,
    getIndicatorCount,
    setMagnetMode,
    getMagnetMode,
    setMeasureMode,
    getMeasureMode,
    setDrawingsHidden,
    getDrawingsHidden,
    setHideAll,
    getHideAll,
    setStayInDrawingMode,
    getStayInDrawingMode,
    setShowMobilePlacementBar,
    getShowMobilePlacementBar,
    setLockAllDrawings,
    getLockAllDrawings,
    setAlwaysRemoveLocked,
    getAlwaysRemoveLocked,
    removeDrawings,
    getSelectedId: () => selectedId,
    getSelectedDrawing,
    selectDrawing,
    updateDrawing,
    removeDrawingById,
    replaceDrawings,
    getDrawingScreenAnchor,
    getPlacementStaged: () => [...placementStaged],
    hasPreview: () => preview != null,
    cancelPlacement,
    finishMultiPointPlacement,
    isDraggingDrawing: () => isDraggingDrawing,
    undoDrawing,
    redoDrawing,
    canUndoDrawing: () => history.canUndo(),
    canRedoDrawing: () => history.canRedo(),
    clearAll,
    copySelectedDrawing,
    hasDrawingClipboard,
    pasteDrawing,
    pasteDrawingFromSystemClipboard,
    setTarget,
    on(event, fn) {
      listeners[event]?.add(fn);
      return () => listeners[event]?.delete(fn);
    },
    destroy() {
      drag.forceEnd();
      unbindChartListeners();
      unsubDrawCrosshairDotSync();
      container.style.touchAction = "";
      const stage = container.closest(".tv-chart-wrap__stage");
      if (stage instanceof HTMLElement) stage.style.touchAction = "";
      chart.applyOptions({
        handleScroll: {
          mouseWheel: true,
          pressedMouseMove: true,
          horzTouchDrag: true,
          vertTouchDrag: true,
        },
        handleScale: {
          pinch: true,
          axisPressedMouseMove: { time: true, price: true },
        },
      });
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("blur", onWindowBlur);
      series.detachPrimitive(primitive);
      cursorMark.remove();
      drawCrosshairDot.remove();
      valuesTooltip.remove();
    },
  };
}

export { CURSOR_TOOLS };
