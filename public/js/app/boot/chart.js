import { resolveDatafeed, readPageOptions } from "../../datafeed/index.js";
import { createTvChart } from "../../chart/view/index.js";
import { CHART_FUTURE_WHITESPACE_MIN } from "../../chart/future/whitespace.js";
import {
  enforcePriceBarRatio,
  enforcePriceBarRatioOnPriceZoom,
} from "../../chart/price/barRatio.js";
import { mountMarketStatusPopup } from "../../chart/market/status.js";
import { precisionFromSettings, priceFormatFromPrecisionSetting, resolveTimezone } from "../../chart/timezone/list.js";
import { applySettingsToChart, applyChartTimezone as applyChartTimezoneToPanes } from "../../chart/settings/applier.js";
import {
  applyLiveBarToPaneSeries,
  barSecForPane,
  barsForPane,
  buildChartSeriesForPane,
  chartMapBarsForPane,
  refreshPaneCandleData as refreshPaneCandles,
  updateFormingBarOnPaneSeries,
} from "../../chart/pane/data.js";
import { measureVisiblePriceRange, snapTimeToNearestBar } from "../../chart/coords/timeScale.js";
import { buildCandleSeriesData } from "../../chart/bar/data.js";
import { withFutureWhitespace } from "../../chart/future/whitespace.js";
import { createMultiPaneDrawingHub } from "../../drawings/multi/paneHub.js";
import { isElectronicSession } from "../../primitives/session/background.js";
import { createAppLoader } from "../../ui/loader/app.js";
import { createChartSettings, mountChartSettings } from "../../ui/chart/settings.js";
import { loadShowMobilePlacementBar, saveShowMobilePlacementBar } from "../../drawings/toolbars/utility/settings/store.js";
import { mountSymbolSearch } from "../../ui/symbol/search.js";
import { mountStatusLineContextMenu } from "../../ui/context/statusLine.js";
import { mountTimeframePicker } from "../../ui/timeframe/picker.js";
import { loadLastResolution, saveLastResolution } from "../../ui/timeframe/favorites.js";
import { getPaneSymbol, savePaneSymbols } from "../../ui/chart/symbol/store.js";
import { mountTimezoneClock } from "../../ui/timezone/clock.js";
import { mountAppTouchScrollLock } from "../touch/scrollLock.js";
import { mountBottomFullscreenExit } from "../../ui/header/fullscreen/mode.js";
import {
  createLayoutManager,
  findLayoutByName,
  layoutNameExists,
  removeLayoutFromLibrary,
  upsertLayoutLibraryEntry,
} from "../../ui/header/layout/manager.js";
import { showLayoutNameDialog } from "../../ui/header/layout/dialogs.js";
import {
  getLayoutToolDefaultsSnapshot,
  setLayoutToolDefaults,
  setLayoutToolDefaultsChangeHandler,
} from "../../drawings/toolbars/defaults/layoutScope.js";
import { mountHeaderToolbar } from "../../ui/header/toolbar/index.js";
import { applyCursorMode, resolveThemeCrosshair } from "../cursor/mode.js";
import { createLayoutSync } from "../layout/sync.js";
import { wireContextMenus } from "../wire/contextMenus.js";
import { applySymbolLineStyle } from "../symbol/lineStyle.js";
import { createBarLoader } from "../bar/loader.js";
import {
  chartDebug,
  chartDebugCount,
  chartDebugTime,
  chartDebugTimeAsync,
  configureChartDebug,
  createPanFpsMonitor,
  installChartDebugGlobal,
} from "../../debug/chart/index.js";
import { ensureDebugHud } from "../../debug/chart/hud.js";
import { barTimeLabel, dateTime12h, toDate } from "../../chart/format.js";
import { chartThemeFallback, applyCanvasPresetForTheme } from "./themes.js";
import { saveThemePreference } from "../../ui/theme/store.js";
import { createPaneExtras } from "./paneExtras.js";
import { createChartWidgetApi } from "./widgetApi.js";

export { readPageOptions };

/**
 * Boot the chart widget. Safe to call from index or embed pages.
 * @param {Partial<ReturnType<typeof readPageOptions>>} [overrides]
 */
export async function bootChart(overrides = {}) {
  installChartDebugGlobal();
  const debugOn = configureChartDebug();

  const opts = { ...readPageOptions(), ...overrides };
  /** @type {"dark" | "light"} */
  let currentTheme = opts.theme === "light" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", currentTheme);
  mountAppTouchScrollLock();

  if (debugOn) chartDebug("boot", "bootChart start", { opts });

  const el =
    overrides.mount instanceof HTMLElement
      ? overrides.mount
      : document.getElementById(overrides.mountId ?? "chart");
  if (!el) throw new Error("#chart element missing (pass mount or mountId)");

  const datafeed = resolveDatafeed(opts);
  const cfg = await datafeed.onReady();
  const themeColors =
    cfg.themes?.[currentTheme] ?? cfg.themes?.dark ?? chartThemeFallback(currentTheme);
  const resolutions = cfg.resolutions ?? [{ id: "1", label: "1m" }];

  const statusEl = document.getElementById("ohlc");
  const symbolPicker = document.getElementById("symbol-picker");
  const tfPickerEl = document.getElementById("timeframe-picker");
  const drawToolbar = document.getElementById("drawing-toolbar");
  const chromeEl = document.querySelector(".tv-toolbar");
  const workspaceEl = document.querySelector(".tv-workspace");
  const settingsStore = createChartSettings();
  /** @type {ReturnType<typeof mountChartSettings> | null} */
  let chartSettings = null;

  function mountChartSettingsUi() {
    if (chartSettings) return chartSettings;
    chartSettings = mountChartSettings({
      store: settingsStore,
      triggerEl: document.getElementById("settings-btn") ?? undefined,
      onLiveChange: () => applyChartSettingsFn(),
      getTheme: () => currentTheme,
      onThemeChange: (mode) => {
        saveThemePreference(mode);
        applyThemeMode(mode);
      },
      getDrawingSettings: () => ({
        showMobilePlacementBar: drawing?.getShowMobilePlacementBar?.() ?? loadShowMobilePlacementBar(),
      }),
      setDrawingSetting: (key, value) => {
        if (key !== "showMobilePlacementBar") return;
        drawing?.setShowMobilePlacementBar?.(value);
        saveShowMobilePlacementBar(Boolean(value));
      },
    });
    return chartSettings;
  }
  const loader = createAppLoader(document.querySelector(".tv-app"));
  /** @type {() => void} */
  let applyChartSettingsFn = () => {};
  let symbol = getPaneSymbol(0, opts.symbol);
  let resolution = loadLastResolution(opts.resolution || cfg.default_resolution || "1", resolutions);
  saveLastResolution(resolution);

  function persistPaneSymbols() {
    savePaneSymbols(getAllChartPanes().map((p) => ({ index: p.index, symbol: p.symbol })));
  }
  /** @type {object | null} */
  let symbolInfo = null;
  /** @type {ReturnType<typeof createMultiPaneDrawingHub> | null} */
  let drawingHub = null;
  /** @type {ReturnType<typeof createMultiPaneDrawingHub>["facade"] | null} */
  let drawing = null;

  function buildLayoutEntry() {
    return {
      name: layoutManager?.getLayoutName() ?? "Unnamed",
      layoutId: layoutManager?.getLayoutId() ?? "1",
      sync: layoutManager?.getSync() ?? {},
      drawings: drawingHub?.getDrawingsByPane?.(),
      chartSettings: structuredClone(settingsStore.get()),
      toolDefaults: getLayoutToolDefaultsSnapshot(),
    };
  }

  function applyLayoutChartSettings(settings) {
    if (!settings || typeof settings !== "object") return;
    settingsStore.replace(settings, { skipHistory: true });
    applyChartSettingsFn();
  }

  function restoreLayoutChartSettings() {
    let settings = layoutManager?.getChartSettingsSnapshot?.() ?? null;
    if (!settings && layoutManager) {
      settings = findLayoutByName(layoutManager.getLayoutName())?.chartSettings ?? null;
    }
    applyLayoutChartSettings(settings);
  }

  function autosaveLayout() {
    if (!layoutManager) return;
    const entry = buildLayoutEntry();
    layoutManager.setDrawingsSnapshot(entry.drawings ?? null);
    layoutManager.setChartSettingsSnapshot(entry.chartSettings ?? null);
    layoutManager.setToolDefaultsSnapshot(entry.toolDefaults ?? null);
    upsertLayoutLibraryEntry(entry);
    layoutManager.markSaved();
    headerToolbarUi?.updateSaveState();
  }

  function scheduleAutosaveLayout() {
    if (!layoutManager) return;
    layoutManager.markDirty();
    headerToolbarUi?.updateSaveState();
    if (!layoutManager.getAutoSave()) return;
    if (layoutAutosaveTimer) clearTimeout(layoutAutosaveTimer);
    layoutAutosaveTimer = setTimeout(() => {
      layoutAutosaveTimer = null;
      autosaveLayout();
    }, 350);
  }

  function restoreLayoutToolDefaults() {
    let toolDefaults = layoutManager?.getToolDefaultsSnapshot?.() ?? null;
    if (!toolDefaults && layoutManager) {
      toolDefaults = findLayoutByName(layoutManager.getLayoutName())?.toolDefaults ?? null;
    }
    setLayoutToolDefaults(toolDefaults);
  }

  function restoreLayoutDrawings() {
    if (!drawingHub) return;
    let drawings = layoutManager?.getDrawingsSnapshot?.() ?? null;
    if (!drawings && layoutManager) {
      drawings = findLayoutByName(layoutManager.getLayoutName())?.drawings ?? null;
    }
    if (drawings) drawingHub.setDrawingsByPane(drawings);
  }

  async function uniqueLayoutName(initial, title, confirmLabel) {
    const name = await showLayoutNameDialog({ title, value: initial, confirmLabel });
    if (!name) return null;
    let unique = name;
    let n = 2;
    while (layoutNameExists(unique)) {
      unique = `${name} ${n}`;
      n += 1;
    }
    return unique;
  }

  function attachPaneDrawings(pane) {
    if (!drawingHub || !pane) return;
    drawingHub.attachPane(pane.index, {
      chart: pane.chart,
      series: pane.series,
      container: pane.el,
    });
  }

  function applyDrawingCursorAll() {
    if (!drawing) return;
    const tool = drawing.getActiveTool();
    const isCursor = drawing.isCursorTool();
    const themeCrosshair = resolveThemeCrosshair(settingsStore, themeColors);
    for (const pane of getAllChartPanes()) {
      applyCursorMode(pane.chart, pane.el, tool, isCursor, pane.series, themeCrosshair);
    }
  }

  function formatPrice(n) {
    if (n == null || !Number.isFinite(n)) return "—";
    const precision = precisionFromSettings(settingsStore.get(), symbolInfo);
    return Number(n).toLocaleString(undefined, {
      minimumFractionDigits: precision,
      maximumFractionDigits: precision,
    });
  }

  if (!opts.chrome && chromeEl) chromeEl.hidden = true;
  if (!opts.drawings) {
    drawToolbar?.remove();
    workspaceEl?.classList.add("tv-workspace--no-draw");
  }

  function resetChartView() {
    chart.priceScale(activePriceScaleId()).applyOptions({
      autoScale: true,
      scaleMargins: { top: 0.08, bottom: 0.12 },
    });
    if (bars.length) scrollToLatest(bars.length);
  }

  function resetTimeScale() {
    chart.timeScale().resetTimeScale();
    if (bars.length) scrollToLatest(bars.length);
  }

  function applyThemeMode(mode) {
    currentTheme = mode === "light" ? "light" : "dark";
    const colors = cfg.themes?.[currentTheme] ?? cfg.themes?.dark ?? chartThemeFallback(currentTheme);
    document.documentElement.setAttribute("data-theme", currentTheme);
    applyTheme(colors);
    applyCanvasPresetForTheme(settingsStore, currentTheme);
    applyChartSettings();
    refreshWatermark();
  }

  const watermarkText = document.getElementById("watermark");

  function refreshWatermark() {
    if (!watermarkText) return;
    const cv = settingsStore.get().canvas ?? {};
    const lines = [];
    if (cv.watermarkTicker) lines.push(symbol);
    if (cv.watermarkInterval) {
      lines.push(resolutions.find((r) => r.id === resolution)?.label ?? resolution);
    }
    if (cv.watermarkDescription && symbolInfo?.description) {
      lines.push(symbolInfo.description);
    }
    watermarkText.textContent = lines.join("\n");
  }

  const chartWrap = el.closest(".tv-chart-wrap") ?? el;
  const stageEl = document.querySelector(".tv-stage");
  let tzClock = null;
  /** @type {ReturnType<typeof createLayoutManager> | null} */
  let layoutManager = null;
  /** @type {{ updateSaveState: () => void } | null} */
  let headerToolbarUi = null;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let layoutAutosaveTimer = null;
  /** @type {ReturnType<typeof mountSymbolSearch> | null} */
  let symbolSearchUi = null;
  /** @type {ReturnType<typeof mountTimeframePicker> | null} */
  let tfPickerUi = null;

  /**
   * @typedef {{
   *   index: number,
   *   chart: import("lightweight-charts").IChartApi,
   *   series: import("lightweight-charts").ISeriesApi,
   *   el: HTMLElement,
   *   symbol: string,
   *   resolution: string,
   *   symbolInfo: object | null,
   *   bars: object[],
   *   destroy: () => void,
   *   futureWhitespaceBars?: number | null,
   *   statusEl?: HTMLElement | null,
   *   sessionBg?: import("../primitives/sessionBackgroundPrimitive.js").SessionBackgroundPrimitive,
   *   priceLineLabel?: object,
   *   hoverBar?: object,
   *   hoverPrev?: object,
   *   timeToIdx?: Map<number, number>,
   * }} ChartPane
   */
  /** @type {Map<number, ChartPane>} */
  const chartPanes = new Map();

  function getActivePane() {
    const idx = layoutManager?.getActivePaneIndex() ?? 0;
    return chartPanes.get(idx) ?? chartPanes.get(0);
  }

  function getAllChartPanes() {
    return [...chartPanes.values()].sort((a, b) => a.index - b.index);
  }

  function getLayoutCharts() {
    return getAllChartPanes().map((p) => ({ chart: p.chart, series: p.series }));
  }

  const { chart, series, applyTheme, scrollToLatest } = createTvChart(el, themeColors);

  let ratioLockBusy = false;

  function activePriceScaleId() {
    const placement = settingsStore.get().scales?.scalesPlacement;
    return placement === "left" ? "left" : "right";
  }

  function lockedRatioTarget() {
    const sc = settingsStore.get().scales ?? {};
    if (!sc.lockPriceToBarRatio) return null;
    const target = Number(sc.lockPriceToBarRatioValue);
    return Number.isFinite(target) && target > 0 ? target : null;
  }

  function maintainLockedRatio() {
    const target = lockedRatioTarget();
    if (target == null || ratioLockBusy) return;
    ratioLockBusy = true;
    try {
      enforcePriceBarRatio(chart, series, activePriceScaleId(), target);
    } finally {
      ratioLockBusy = false;
    }
  }

  const debugHud = debugOn ? ensureDebugHud() : null;
  const panFps = createPanFpsMonitor({
    onSample: (stats) => {
      debugHud?.setPanStats({
        fps: stats.fps,
        panning: stats.panning !== false,
      });
    },
  });

  el.addEventListener(
    "wheel",
    (ev) => {
      const rect = el.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const rw = chart.priceScale("right").width();
      const lw = chart.priceScale("left").width();
      const onRight = rw > 0 && x >= rect.width - rw;
      const onLeft = lw > 0 && x <= lw;
      if (!onRight && !onLeft) return;
      const target = lockedRatioTarget();
      if (target == null) return;
      requestAnimationFrame(() => enforcePriceBarRatioOnPriceZoom(chart, series, target));
    },
    true,
  );

  /** @type {object[]} */
  let bars = [];
  chartPanes.set(0, {
    index: 0,
    chart,
    series,
    el,
    symbol,
    resolution,
    symbolInfo,
    bars,
    futureWhitespaceBars: null,
    statusEl: statusEl ?? null,
    timeToIdx: new Map(),
  });
  const ui = {
    get barsLoading() {
      return barsLoading;
    },
    set barsLoading(v) {
      barsLoading = v;
    },
    chartPanning: false,
    hoverBar: undefined,
    hoverPrev: undefined,
    crosshairPrice: null,
    lockCursorByTime: false,
    lockedCrosshairTime: null,
  };
  let barsLoading = true;
  let timeToIdx = new Map();
  /** @type {number | null} */
  let futureWhitespaceBars = null;

  function barSecForPaneLocal(pane) {
    return barSecForPane(pane, resolutions);
  }

  function barSec() {
    const pane = getActivePane();
    return pane ? barSecForPaneLocal(pane) : barSecForPaneLocal({ resolution });
  }

  function barsForChart() {
    const pane = getActivePane();
    if (pane) return barsForPane(pane, settingsStore, symbolInfo);
    const sym = settingsStore.get().symbol ?? {};
    const tz = resolveTimezone(sym.timezone, symbolInfo);
    if (sym.session === "regular") {
      return bars.filter((b) => !isElectronicSession(b.time, tz, symbolInfo?.type));
    }
    return bars;
  }

  function buildChartSeriesForPaneLocal(pane, visible) {
    return buildChartSeriesForPane(pane, visible, settingsStore, resolutions);
  }

  function buildChartSeriesForDisplay(visible) {
    const pane = getActivePane();
    if (pane) return buildChartSeriesForPaneLocal(pane, visible);
    const sym = settingsStore.get().symbol ?? {};
    const candles = buildCandleSeriesData(visible, sym);
    const ws = futureWhitespaceBars ?? CHART_FUTURE_WHITESPACE_MIN;
    return withFutureWhitespace(candles, barSec(), ws);
  }

  const { syncLayoutDateRangeFrom, syncLayoutCrosshairFrom, wireLayoutPaneSync } = createLayoutSync({
    getLayoutManager: () => layoutManager,
    getLayoutCharts,
  });

  function applySymbolLineStyleLocal() {
    applySymbolLineStyle({ settingsStore, getAllChartPanes, symbolInfo });
    for (const pane of getAllChartPanes()) {
      pane.priceLineLabel?.requestRefresh();
    }
  }

  const viewportDeps = {
    maintainLockedRatio: null,
    syncLayoutDateRangeFrom: null,
    getLayoutManager: () => layoutManager,
    prependHistory: null,
    ensureHistoryNearEdge: null,
    setPrimaryFutureWhitespace: (n) => {
      futureWhitespaceBars = n;
    },
  };

  const paneExtras = createPaneExtras({
    settingsStore,
    symbolInfo,
    resolutions,
    barsForPane: (pane) => barsForPane(pane, settingsStore, symbolInfo),
    barSecForPane: barSecForPaneLocal,
    getLayoutManager: () => layoutManager,
    getActivePane,
    getAllChartPanes,
    panFps,
    syncLayoutCrosshairFrom,
    applySymbolLineStyleLocal,
    ui,
    viewportDeps,
  });

  const {
    setupPaneExtras,
    refreshPaneStatusLine,
    refreshStatusLine,
  } = paneExtras;

  setupPaneExtras(chartPanes.get(0), statusEl ?? undefined);

  /** @param {ChartPane} pane */
  function refreshPaneCandleData(pane) {
    refreshPaneCandles(pane, settingsStore, symbolInfo, resolutions, (p) => {
      if (p.index === 0) timeToIdx = p.timeToIdx;
    });
  }

  function refreshCandleData() {
    for (const pane of getAllChartPanes()) {
      refreshPaneCandleData(pane);
      pane.priceLineLabel?.requestRefresh();
    }
    applySymbolLineStyleLocal();
  }

  function applyChartTimezone() {
    applyChartTimezoneToPanes({
      settingsStore,
      symbolInfo,
      tzClock,
      refreshCandleData,
      resolveTimezone,
    });
  }

  function applySettingsToChartLocal(targetChart, targetSeries, pane) {
    applySettingsToChart({
      targetChart,
      targetSeries,
      pane,
      settingsStore,
      themeColors,
      symbolInfo,
      activePriceScaleId,
    });
  }

  function applyChartSettings() {
    const s = settingsStore.get();
    const sc = s.scales ?? {};
    const cv = s.canvas ?? {};

    if (watermarkText && cv.watermarkColor) watermarkText.style.color = cv.watermarkColor;
    refreshWatermark();

    chartWrap?.classList.toggle("tv-scale-currency-hover", sc.currencyUnitVisibility === "visibleOnMouseOver");
    chartWrap?.classList.toggle("tv-scale-modes-hover", sc.scaleModesVisibility === "visibleOnMouseOver");
    chartWrap?.classList.toggle("tv-nav-buttons-hover", cv.navButtonsVisibility === "visibleOnMouseOver");
    chartWrap?.classList.toggle("tv-pane-buttons-hover", cv.paneButtonsVisibility === "visibleOnMouseOver");

    for (const pane of getAllChartPanes()) {
      applySettingsToChartLocal(pane.chart, pane.series, pane);
    }

    applySymbolLineStyleLocal();

    if (drawing) {
      applyDrawingCursorAll();
    }
    refreshCandleData();
    applyChartTimezone();
    refreshStatusLine();
    for (const pane of getAllChartPanes()) {
      pane.priceLineLabel?.requestRefresh();
    }
  }

  if (statusEl) {
    mountStatusLineContextMenu({
      statusEl,
      getStatusLineSettings: () => settingsStore.get().statusLine,
      setToggle: (key, value) => settingsStore.set("statusLine", key, value),
      openSettings: () => mountChartSettingsUi().open("statusLine"),
    });
    mountMarketStatusPopup(statusEl, () => ({ symbolInfo }));
  }
  settingsStore.onChange(() => {
    applyChartSettings();
    scheduleAutosaveLayout();
  });
  applyChartSettingsFn = applyChartSettings;

  /** @param {number} index */
  function switchActivePane(index) {
    const pane = chartPanes.get(index);
    if (!pane) return;

    symbol = pane.symbol;
    resolution = pane.resolution;
    symbolInfo = pane.symbolInfo;
    bars = pane.bars;
    futureWhitespaceBars = pane.futureWhitespaceBars ?? futureWhitespaceBars;

    symbolSearchUi?.setSymbol(pane.symbol);
    tfPickerUi?.setResolution(pane.resolution);
    refreshWatermark();
    refreshStatusLine();

    drawingHub?.setActivePane(index);
    applyDrawingCursorAll();
  }

  function formatChartLabel(chartSec) {
    return dateTime12h(toDate(chartSec));
  }

  /** @param {ChartPane} pane */
  function buildDrawingContext(pane) {
    const sym = settingsStore.get().symbol ?? {};
    const { bars: utcBars, mapBars, barSec } = chartMapBarsForPane(pane, settingsStore, symbolInfo, resolutions);
    const bars = mapBars.slice(0, utcBars.length);
    const visiblePriceRange = measureVisiblePriceRange(pane.chart, pane.series);
    return {
      bars,
      mapBars,
      barSec,
      precision: precisionFromSettings(settingsStore.get(), pane.symbolInfo ?? symbolInfo),
      visiblePriceRange,
      chart: pane.chart,
      series: pane.series,
      colorBarsOnPrevClose: sym.colorBarsOnPrevClose ?? false,
      symbol: sym,
      formatPointTime: (chartSec) => formatChartLabel(chartSec),
    };
  }

  function alignDrawingsToChartTimeScale() {
    if (!drawing) return;
    const pane = getActivePane();
    if (!pane) return;
    const { bars: utcBars, mapBars, barSec } = chartMapBarsForPane(pane, settingsStore, symbolInfo, resolutions);
    const bars = mapBars.slice(0, utcBars.length);
    if (!bars.length) return;
    for (const d of drawing.getDrawings()) {
      const points = d.points.map((p) => ({
        ...p,
        time: snapTimeToNearestBar(p.time, bars, barSec),
      }));
      drawing.updateDrawing(d.id, { points }, { silent: true });
    }
  }

  function refreshDrawingSettingsContext() {
    drawingHub?.editToolbar?.refreshSettingsContext?.();
  }

  function afterTimeframeChange() {
    alignDrawingsToChartTimeScale();
    refreshDrawingSettingsContext();
    scheduleAutosaveLayout();
  }

  const { loadPaneBars, loadBarsForPanes, loadBars: loadBarsAll, pushLiveBar, prependHistory, ensureHistoryNearEdge } =
    createBarLoader({
    datafeed,
    countBack: opts.countBack,
    historyChunk: opts.historyChunk ?? opts.countBack,
    getLayoutManager: () => layoutManager,
    loader,
    refreshPaneCandleData,
    applyLiveBarToPane: (pane) =>
      applyLiveBarToPaneSeries(pane, settingsStore, symbolInfo, resolutions),
    updateFormingBarOnPane: (pane, bar) =>
      updateFormingBarOnPaneSeries(pane, bar, settingsStore, symbolInfo),
    getBarSecForPane: (pane) => barSecForPaneLocal(pane),
    setBarsLoading: (v) => {
      barsLoading = v;
      ui.barsLoading = v;
    },
    refreshStatusLine,
    getActivePaneIndex: () => layoutManager?.getActivePaneIndex() ?? 0,
    setHoverState: (bar, prev) => {
      ui.hoverBar = bar;
      ui.hoverPrev = prev;
    },
    setPrimaryBars: (pane) => {
      bars = pane.bars;
      futureWhitespaceBars = pane.futureWhitespaceBars;
    },
    onPaneBarUpdate: (pane) => {
      pane.priceLineLabel?.requestRefresh();
    },
  });

  viewportDeps.maintainLockedRatio = maintainLockedRatio;
  viewportDeps.syncLayoutDateRangeFrom = syncLayoutDateRangeFrom;
  viewportDeps.prependHistory = prependHistory;
  viewportDeps.ensureHistoryNearEdge = ensureHistoryNearEdge;

  async function loadBars() {
    return loadBarsAll(getAllChartPanes, () => getActivePane() ?? chartPanes.get(0));
  }

  function applySymbolFormat(info) {
    const sym = settingsStore.get().symbol ?? {};
    for (const pane of getAllChartPanes()) {
      pane.series.applyOptions({
        priceFormat: priceFormatFromPrecisionSetting(sym.precision, pane.symbolInfo ?? info),
      });
    }
  }

  if (opts.drawings && drawToolbar) {
    drawingHub = createMultiPaneDrawingHub({
      toolbarEl: drawToolbar,
      getContextForPane: (idx) => {
        const pane = chartPanes.get(idx) ?? getActivePane();
        return pane ? buildDrawingContext(pane) : { bars: [], barSec: 60 };
      },
      getSyncDrawings: () => layoutManager?.getSync().drawings ?? false,
    });
    drawing = drawingHub.facade;
    attachPaneDrawings(chartPanes.get(0));
    drawing.on("toolChange", applyDrawingCursorAll);
    applyDrawingCursorAll();
    drawingHub.editToolbar?.syncVisibility?.();

    const DRAWINGS_SESSION_KEY = "tv-chart-drawings-session";
    if (!opts.chrome) {
      try {
        const raw = localStorage.getItem(DRAWINGS_SESSION_KEY);
        if (raw) drawingHub.setDrawingsByPane(JSON.parse(raw));
      } catch {
        /* ignore */
      }
      drawing.on("change", () => {
        try {
          localStorage.setItem(DRAWINGS_SESSION_KEY, JSON.stringify(drawingHub.getDrawingsByPane()));
        } catch {
          /* ignore */
        }
      });
    }
  }

  if (opts.chrome && chromeEl && stageEl && chartWrap instanceof HTMLElement) {
    layoutManager = createLayoutManager({
      stageEl,
      primaryWrapEl: chartWrap,
      createSecondaryPane: (paneIndex) => {
        const wrap = document.createElement("div");
        wrap.className = "tv-chart-wrap tv-chart-wrap--pane";
        const stage = document.createElement("div");
        stage.className = "tv-chart-wrap__stage";
        const chartEl = document.createElement("div");
        chartEl.className = "tv-chart-pane";
        chartEl.id = `chart-pane-${paneIndex}`;
        const paneStatusEl = document.createElement("div");
        paneStatusEl.className = "status-line tv-ohlc";
        paneStatusEl.setAttribute("aria-live", "polite");
        stage.appendChild(chartEl);
        stage.appendChild(paneStatusEl);
        wrap.appendChild(stage);

        const paneChart = createTvChart(chartEl, themeColors);
        const paneSymbol = getPaneSymbol(paneIndex, symbol);
        const paneState = {
          index: paneIndex,
          chart: paneChart.chart,
          series: paneChart.series,
          el: chartEl,
          symbol: paneSymbol,
          resolution,
          symbolInfo: null,
          bars: [],
          futureWhitespaceBars: null,
          statusEl: paneStatusEl,
          timeToIdx: new Map(),
        };
        chartPanes.set(paneIndex, paneState);
        setupPaneExtras(paneState);
        wireLayoutPaneSync(paneChart.chart);
        applySettingsToChartLocal(paneChart.chart, paneChart.series, paneState);
        refreshPaneStatusLine(paneState);
        attachPaneDrawings(paneState);
        wrap.addEventListener("mousedown", () => layoutManager?.setActivePane(paneIndex));

        return {
          chart: paneChart.chart,
          series: paneChart.series,
          chartEl,
          wrapEl: wrap,
          symbol: paneSymbol,
          resolution,
          symbolInfo: null,
          bars: [],
          index: paneIndex,
          destroy: () => {
            paneState.priceLineLabel?.destroy();
            drawingHub?.detachPane(paneIndex);
            chartPanes.delete(paneIndex);
            paneChart.chart.remove();
          },
        };
      },
      destroySecondaryPane: (pane) => pane.destroy(),
      onLayoutChange: async () => {
        syncLayoutDateRangeFrom(chart);
        const empty = getAllChartPanes().filter((p) => !p.bars.length);
        if (empty.length) await loadBarsForPanes(empty);
      },
      onActivePaneChange: (index) => {
        switchActivePane(index);
      },
    });

    chartWrap.addEventListener("mousedown", () => layoutManager?.setActivePane(0));

    const toolbarRight = chromeEl.querySelector(".tv-toolbar__right");
    if (toolbarRight) {
      headerToolbarUi = mountHeaderToolbar({
        mountEl: toolbarRight,
        getChart: () => chart,
        layoutManager,
        onSaveLayout: autosaveLayout,
        onLoadLayout: (item) => {
          applyLayoutChartSettings(item.chartSettings);
          setLayoutToolDefaults(item.toolDefaults);
          layoutManager.setToolDefaultsSnapshot(item.toolDefaults ?? null);
          drawingHub?.setDrawingsByPane?.(item.drawings);
          autosaveLayout();
        },
        onLayoutChange: scheduleAutosaveLayout,
        onCreateLayout: () => {
          void (async () => {
            if (layoutManager.isDirty()) autosaveLayout();
            const unique = await uniqueLayoutName("Layout", "Create new layout", "Create");
            if (!unique) return;
            layoutManager.setLayoutName(unique);
            drawingHub?.setDrawingsByPane?.({});
            layoutManager.setDrawingsSnapshot(null);
            setLayoutToolDefaults({});
            layoutManager.setToolDefaultsSnapshot(null);
            layoutManager.markDirty();
            headerToolbarUi?.updateSaveState();
          })();
        },
        onDuplicateLayout: () => {
          void (async () => {
            autosaveLayout();
            const unique = await uniqueLayoutName(
              `${layoutManager.getLayoutName()} copy`,
              "Make a copy",
              "Create copy",
            );
            if (!unique) return;
            const entry = { ...buildLayoutEntry(), name: unique };
            upsertLayoutLibraryEntry(entry);
            layoutManager.setLayoutName(unique);
            layoutManager.markDirty();
            headerToolbarUi?.updateSaveState();
          })();
        },
        onDeleteLayout: (name) => {
          removeLayoutFromLibrary(name);
        },
      });
      setLayoutToolDefaultsChangeHandler(scheduleAutosaveLayout);
      if (drawing) {
        drawing.on("change", scheduleAutosaveLayout);
      }
      restoreLayoutChartSettings();
      restoreLayoutToolDefaults();
      restoreLayoutDrawings();
      if (layoutManager.getAutoSave()) {
        autosaveLayout();
      } else {
        headerToolbarUi?.updateSaveState();
      }
      mountChartSettingsUi();
    }
  }

  window.addEventListener("beforeunload", () => {
    if (layoutAutosaveTimer) {
      clearTimeout(layoutAutosaveTimer);
      layoutAutosaveTimer = null;
    }
    persistPaneSymbols();
    autosaveLayout();
  });

  mountChartSettingsUi();

  wireContextMenus({
    chartWrap,
    chart,
    el,
    series,
    settingsStore,
    chartSettings: mountChartSettingsUi(),
    activePriceScaleId,
    resetChartView,
    resetTimeScale,
    getState: {
      getSymbol: () => symbol,
      getCrosshairPrice: () => ui.crosshairPrice,
      formatPrice,
      getDrawingCount: () => drawing?.getCount?.() ?? 0,
      getLockCursorByTime: () => ui.lockCursorByTime,
      getHoverBar: () => ui.hoverBar,
      getBars: () => bars,
      getLockedCrosshairTime: () => ui.lockedCrosshairTime,
      setCrosshairPrice: (n) => {
        ui.crosshairPrice = n;
      },
      setLockCursorByTime: (v) => {
        ui.lockCursorByTime = v;
      },
      setLockedCrosshairTime: (t) => {
        ui.lockedCrosshairTime = t;
      },
      getDrawing: () => drawing,
    },
  });

  document.addEventListener("keydown", (ev) => {
    if (!ev.altKey || ev.target instanceof HTMLInputElement || ev.target instanceof HTMLTextAreaElement) return;
    const key = ev.key.toLowerCase();
    if (key === "i") {
      ev.preventDefault();
      const sc = settingsStore.get().scales ?? {};
      settingsStore.set("scales", "invertScale", !sc.invertScale);
      return;
    }
    if (key === "p") {
      ev.preventDefault();
      settingsStore.merge({ scales: { priceScaleMode: "percent", logarithmic: false } });
      return;
    }
    if (key === "l") {
      ev.preventDefault();
      settingsStore.merge({ scales: { priceScaleMode: "logarithmic", logarithmic: true } });
      return;
    }
    if (ev.ctrlKey && ev.altKey && key === "q") {
      ev.preventDefault();
      resetTimeScale();
    }
  });

  tzClock = mountTimezoneClock({
    mountEl: document.getElementById("chart-bottom-toolbar") ?? chartWrap,
    getTimezone: () => settingsStore.get().symbol?.timezone ?? "America/New_York",
    getSymbolInfo: () => symbolInfo,
    onTimezoneChange: (tz) => {
      settingsStore.set("symbol", "timezone", tz);
    },
  });

  const bottomToolbar = document.getElementById("chart-bottom-toolbar");
  if (bottomToolbar && headerToolbarUi?.fullscreen) {
    mountBottomFullscreenExit({
      mountEl: bottomToolbar,
      fullscreen: headerToolbarUi.fullscreen,
    });
  }


  if (symbolPicker) {
    symbolSearchUi = mountSymbolSearch({
      root: symbolPicker,
      datafeed,
      initialSymbol: symbol,
      onSelect: async (sym) => {
        const sync = layoutManager?.getSync();
        if (layoutManager && sync?.symbol) {
          for (const pane of getAllChartPanes()) {
            pane.symbol = sym;
          }
          symbol = sym;
          refreshWatermark();
          await loadBarsForPanes(getAllChartPanes());
          const active = getActivePane();
          if (active) {
            symbolInfo = active.symbolInfo;
            applySymbolFormat(symbolInfo);
          }
          persistPaneSymbols();
          return;
        }
        const pane = getActivePane() ?? chartPanes.get(0);
        if (!pane) return;
        pane.symbol = sym;
        if (pane.index === 0) chartPanes.get(0).symbol = sym;
        symbol = sym;
        refreshWatermark();
        pane.symbolInfo = await datafeed.resolveSymbol(sym);
        symbolInfo = pane.symbolInfo;
        applySymbolFormat(symbolInfo);
        await loadPaneBars(pane);
        refreshStatusLine();
        persistPaneSymbols();
      },
    });
    await symbolSearchUi.init();
  }

  if (tfPickerEl) {
    tfPickerUi = mountTimeframePicker({
      root: tfPickerEl,
      resolutions,
      initial: resolution,
      onChange: async (res) => {
        const sync = layoutManager?.getSync();
        if (layoutManager && sync?.interval) {
          for (const pane of getAllChartPanes()) {
            pane.resolution = res;
          }
          resolution = res;
          refreshWatermark();
          refreshStatusLine();
          await loadBarsForPanes(getAllChartPanes());
          afterTimeframeChange();
          return;
        }
        const pane = getActivePane() ?? chartPanes.get(0);
        if (!pane) return;
        pane.resolution = res;
        if (pane.index === 0) chartPanes.get(0).resolution = res;
        resolution = res;
        refreshWatermark();
        refreshStatusLine();
        await loadPaneBars(pane);
        afterTimeframeChange();
      },
    });
  }

  symbolInfo = await datafeed.resolveSymbol(symbol);
  const primaryPane = chartPanes.get(0);
  if (primaryPane) primaryPane.symbolInfo = symbolInfo;
  applySymbolFormat(symbolInfo);

  applyChartSettings();
  try {
    const last = await chartDebugTimeAsync("boot", "loadBars", () => loadBars());
    persistPaneSymbols();
    if (debugOn) {
      chartDebug("boot", "ready", {
        symbol,
        resolution,
        barCount: bars.length,
        panes: getAllChartPanes().length,
      });
    }
    return createChartWidgetApi({
      datafeed,
      chart,
      series,
      settingsStore,
      getActivePane,
      getAllChartPanes,
      getBarsSnapshot: () => getActivePane()?.bars ?? bars,
      getSymbol: () => getActivePane()?.symbol ?? symbol,
      getResolution: () => getActivePane()?.resolution ?? resolution,
      getSymbolInfo: () => getActivePane()?.symbolInfo ?? symbolInfo,
      loadBars,
      loadPaneBars,
      loadBarsForPanes,
      pushLiveBar,
      prependHistory,
      ensureHistoryNearEdge,
      resetChartView,
      resetTimeScale,
      scrollToLatest,
      applyThemeMode,
      applySymbolFormat,
      refreshWatermark,
      refreshStatusLine,
      barTimeLabel: (bar) => barTimeLabel(bar),
      mountChartSettingsUi,
      layoutManager,
      lastBar: last,
      countBack: opts.countBack,
    });
  } finally {
    loader.hide();
    document.getElementById("app-loader")?.classList.add("app-loader--hidden");
  }
}
