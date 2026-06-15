import { createDatafeed, readPageOptions } from "../datafeed/client.js";
import { createTvChart } from "../chart/chartView.js";
import { CHART_FUTURE_WHITESPACE_MIN } from "../chart/futureWhitespace.js";
import {
  enforcePriceBarRatio,
  enforcePriceBarRatioOnPriceZoom,
} from "../chart/priceBarRatio.js";
import { renderStatusLine } from "../chart/statusLine.js";
import { mountMarketStatusPopup } from "../chart/marketStatus.js";
import { barTimeLabel } from "../chart/format.js";
import { precisionFromSettings, priceFormatFromPrecisionSetting, resolveTimezone } from "../chart/timezones.js";
import { applySettingsToChart, applyChartTimezone as applyChartTimezoneToPanes } from "../chart/settingsApplier.js";
import {
  barSecForPane,
  barsForPane,
  buildChartSeriesForPane,
  ensureFutureWhitespace as growFutureWhitespace,
  refreshPaneCandleData as refreshPaneCandles,
} from "../chart/paneData.js";
import { buildCandleSeriesData } from "../chart/candleData.js";
import { withFutureWhitespace } from "../chart/futureWhitespace.js";
import { createMultiPaneDrawingHub } from "../drawings/multiPaneHub.js";
import { SessionBackgroundPrimitive, isElectronicSession } from "../primitives/sessionBackgroundPrimitive.js";
import { createAppLoader } from "../ui/appLoader.js";
import { createChartSettings, mountChartSettings } from "../ui/chartSettings.js";
import { mountSymbolSearch } from "../ui/symbolSearch.js";
import { mountStatusLineContextMenu } from "../ui/statusLineContextMenu.js";
import { mountTimeframePicker } from "../ui/timeframePicker.js";
import { mountTimezoneClock } from "../ui/timezoneClock.js";
import { createLayoutManager, loadSavedLayouts, saveLayoutLibrary } from "../ui/header/layoutManager.js";
import { mountHeaderToolbar } from "../ui/header/headerToolbar.js";
import { applyCursorMode } from "./cursorMode.js";
import { createLayoutSync } from "./layoutSync.js";
import { wireContextMenus } from "./wireContextMenus.js";
import { applySymbolLineStyle } from "./symbolLineStyle.js";
import { createBarLoader } from "./barLoader.js";

export { readPageOptions };


/**
 * Boot the chart widget. Safe to call from index or embed pages.
 * @param {Partial<ReturnType<typeof readPageOptions>>} [overrides]
 */
export async function bootChart(overrides = {}) {
  const opts = { ...readPageOptions(), ...overrides };
  document.documentElement.setAttribute("data-theme", opts.theme);

  const el = document.getElementById("chart");
  if (!el) throw new Error("#chart element missing");

  const datafeed = createDatafeed();
  const cfg = await datafeed.onReady();
  const themeColors = cfg.themes?.[opts.theme] ?? cfg.themes?.dark;
  const resolutions = cfg.resolutions ?? [{ id: "1", label: "1m" }];

  const statusEl = document.getElementById("ohlc");
  const symbolPicker = document.getElementById("symbol-picker");
  const tfPickerEl = document.getElementById("timeframe-picker");
  const drawToolbar = document.getElementById("drawing-toolbar");
  const chromeEl = document.querySelector(".tv-toolbar");
  const workspaceEl = document.querySelector(".tv-workspace");
  const settingsBtn = document.getElementById("settings-btn");
  const loader = createAppLoader(document.querySelector(".tv-app"));
  const settingsStore = createChartSettings();
  /** @type {() => void} */
  let applyChartSettingsFn = () => {};
  const chartSettings = mountChartSettings({
    store: settingsStore,
    triggerEl: settingsBtn ?? undefined,
    onLiveChange: () => applyChartSettingsFn(),
  });

  let symbol = opts.symbol;
  let resolution = opts.resolution || cfg.default_resolution || "1";
  /** @type {object | null} */
  let symbolInfo = null;
  /** @type {object | undefined} */
  let hoverBar;
  /** @type {object | undefined} */
  let hoverPrev;
  /** @type {number | null} */
  let crosshairPrice = null;
  let lockCursorByTime = false;
  /** @type {number | null} */
  let lockedCrosshairTime = null;
  /** @type {ReturnType<typeof createMultiPaneDrawingHub> | null} */
  let drawingHub = null;
  /** @type {ReturnType<typeof createMultiPaneDrawingHub>["facade"] | null} */
  let drawing = null;

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
    for (const pane of getAllChartPanes()) {
      applyCursorMode(pane.chart, pane.el, tool, isCursor, pane.series);
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
    const colors = cfg.themes?.[mode] ?? cfg.themes?.dark;
    document.documentElement.setAttribute("data-theme", mode);
    applyTheme(colors);
    applyChartSettings();
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
   *   applyTimezone?: (tz: string, formatters?: object) => void,
   *   futureWhitespaceBars?: number | null,
   *   statusEl?: HTMLElement | null,
   *   sessionBg?: import("./primitives/sessionBackgroundPrimitive.js").SessionBackgroundPrimitive,
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

  const { chart, series, applyTheme, scrollToLatest, applyTimezone } = createTvChart(el, themeColors);

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

  chart.timeScale().subscribeVisibleLogicalRangeChange(() => {
    maintainLockedRatio();
    if (layoutManager?.getSync().dateRange) syncLayoutDateRangeFrom(chart);
    if (growWhitespaceScheduled) return;
    growWhitespaceScheduled = true;
    requestAnimationFrame(() => {
      growWhitespaceScheduled = false;
      ensureFutureWhitespace();
    });
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
    applyTimezone,
    symbol,
    resolution,
    symbolInfo,
    bars,
    futureWhitespaceBars: null,
    statusEl: statusEl ?? null,
    timeToIdx: new Map(),
  });
  let barsLoading = true;
  let timeToIdx = new Map();
  /** @type {number | null} */
  let futureWhitespaceBars = null;
  let growWhitespaceScheduled = false;

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

  function ensureFutureWhitespace() {
    growFutureWhitespace({
      chart,
      series,
      barsForChart,
      buildChartSeriesForDisplay,
      getFutureWhitespaceBars: () => futureWhitespaceBars,
      setFutureWhitespaceBars: (n) => {
        futureWhitespaceBars = n;
      },
      requestAllSessionBgRefresh,
    });
  }

  function requestAllSessionBgRefresh() {
    for (const pane of getAllChartPanes()) {
      pane.sessionBg?.requestRefresh();
    }
  }

  /** @param {ChartPane} pane */
  function attachSessionBackground(pane) {
    const bg = new SessionBackgroundPrimitive();
    bg.setSettingsProvider(() => settingsStore.get().symbol ?? {});
    bg.setSymbolProvider(() => pane.symbolInfo ?? symbolInfo);
    bg.setContextProvider(() => ({
      bars: barsForPane(pane, settingsStore, symbolInfo),
      barSec: barSecForPaneLocal(pane),
    }));
    pane.series.attachPrimitive(bg);
    pane.sessionBg = bg;
  }

  /** @param {ChartPane} pane */
  function refreshPaneStatusLine(pane) {
    if (!pane.statusEl) return;
    if (barsLoading || !pane.bars.length) {
      pane.statusEl.innerHTML = "";
      return;
    }
    const visible = barsForPane(pane, settingsStore, symbolInfo);
    const bar = pane.hoverBar ?? visible.at(-1);
    const prev = pane.hoverBar != null ? pane.hoverPrev : visible.length > 1 ? visible.at(-2) : undefined;
    renderStatusLine(pane.statusEl, {
      symbol: pane.symbol,
      symbolInfo: pane.symbolInfo,
      resolution: pane.resolution,
      bar,
      prevBar: prev,
      settings: settingsStore.get(),
    });
  }

  /** @param {ChartPane} pane */
  function wirePaneCrosshair(pane) {
    pane.chart.subscribeCrosshairMove((param) => {
      syncLayoutCrosshairFrom(pane.chart, pane.series, param);

      const isActive = pane.index === (layoutManager?.getActivePaneIndex() ?? 0);

      if (isActive && lockCursorByTime && lockedCrosshairTime != null && param?.point) {
        const price = pane.series.coordinateToPrice(param.point.y);
        if (price != null) pane.chart.setCrosshairPosition(price, lockedCrosshairTime, pane.series);
      }

      if (isActive) {
        if (param?.point) {
          const p = pane.series.coordinateToPrice(param.point.y);
          crosshairPrice = p != null && Number.isFinite(p) ? p : null;
        } else {
          crosshairPrice = null;
        }
      }

      if (!param?.time) {
        pane.hoverBar = undefined;
        pane.hoverPrev = undefined;
        if (isActive) {
          hoverBar = undefined;
          hoverPrev = undefined;
          applySymbolLineStyleLocal();
        }
        refreshPaneStatusLine(pane);
        return;
      }

      if (!pane.timeToIdx) pane.timeToIdx = new Map();
      const visible = barsForPane(pane, settingsStore, symbolInfo);
      const idx = pane.timeToIdx.get(param.time);
      if (idx == null) return;
      const nextBar = visible[idx];
      if (!nextBar) return;
      const barChanged = pane.hoverBar?.time !== nextBar.time;
      pane.hoverBar = nextBar;
      pane.hoverPrev = idx > 0 ? visible[idx - 1] : undefined;
      if (isActive) {
        hoverBar = pane.hoverBar;
        hoverPrev = pane.hoverPrev;
        if (barChanged) applySymbolLineStyleLocal();
      }
      refreshPaneStatusLine(pane);
    });
  }

  /** @param {ChartPane} pane @param {HTMLElement} [statusLineEl] */
  function setupPaneExtras(pane, statusLineEl) {
    if (statusLineEl) pane.statusEl = statusLineEl;
    attachSessionBackground(pane);
    wirePaneCrosshair(pane);
  }

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
    }
    applySymbolLineStyleLocal();
  }

  function applySymbolLineStyleLocal() {
    applySymbolLineStyle({ settingsStore, getAllChartPanes, symbolInfo });
  }

  function applyChartTimezone() {
    applyChartTimezoneToPanes({
      settingsStore,
      symbolInfo,
      getAllChartPanes,
      tzClock,
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

    const active = getActivePane();
    if (drawing?.isCursorTool()) {
      applyDrawingCursorAll();
    }
    refreshCandleData();
    applyChartTimezone();
    refreshStatusLine();
  }

  function refreshStatusLine() {
    for (const pane of getAllChartPanes()) {
      refreshPaneStatusLine(pane);
    }
  }

  if (statusEl) {
    mountStatusLineContextMenu({
      statusEl,
      getStatusLineSettings: () => settingsStore.get().statusLine,
      setToggle: (key, value) => settingsStore.set("statusLine", key, value),
      openSettings: () => chartSettings.open("statusLine"),
    });
    mountMarketStatusPopup(statusEl, () => ({ symbolInfo }));
  }
  settingsStore.onChange(applyChartSettings);
  applyChartSettingsFn = applyChartSettings;

  const { syncLayoutDateRangeFrom, syncLayoutCrosshairFrom, wireLayoutPaneSync } = createLayoutSync({
    getLayoutManager: () => layoutManager,
    getLayoutCharts,
  });

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

  /** @param {ChartPane} pane */
  function buildDrawingContext(pane) {
    const sym = settingsStore.get().symbol ?? {};
    const tz = resolveTimezone(sym.timezone, pane.symbolInfo ?? symbolInfo);
    const visible = barsForPane(pane, settingsStore, symbolInfo);
    return {
      bars: visible,
      barSec: barSecForPaneLocal(pane),
      precision: precisionFromSettings(settingsStore.get(), pane.symbolInfo ?? symbolInfo),
      colorBarsOnPrevClose: sym.colorBarsOnPrevClose ?? false,
      symbol: sym,
      formatPointTime: (unixSec) =>
        new Intl.DateTimeFormat("en-US", {
          timeZone: tz,
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        }).format(new Date(unixSec * 1000)),
    };
  }

  const { loadPaneBars, loadBarsForPanes, loadBars: loadBarsAll } = createBarLoader({
    datafeed,
    countBack: opts.countBack,
    getLayoutManager: () => layoutManager,
    loader,
    refreshPaneCandleData,
    setBarsLoading: (v) => {
      barsLoading = v;
    },
    refreshStatusLine,
    getActivePaneIndex: () => layoutManager?.getActivePaneIndex() ?? 0,
    setHoverState: (bar, prev) => {
      hoverBar = bar;
      hoverPrev = prev;
    },
    setPrimaryBars: (pane) => {
      bars = pane.bars;
      futureWhitespaceBars = pane.futureWhitespaceBars;
    },
  });

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
        const paneState = {
          index: paneIndex,
          chart: paneChart.chart,
          series: paneChart.series,
          el: chartEl,
          applyTimezone: paneChart.applyTimezone,
          symbol,
          resolution,
          symbolInfo,
          bars,
          futureWhitespaceBars: null,
          statusEl: paneStatusEl,
          timeToIdx: new Map(),
        };
        chartPanes.set(paneIndex, paneState);
        setupPaneExtras(paneState);
        if (bars.length) refreshPaneCandleData(paneState);
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
          applyTimezone: paneChart.applyTimezone,
          symbol,
          resolution,
          symbolInfo,
          bars,
          index: paneIndex,
          destroy: () => {
            drawingHub?.detachPane(paneIndex);
            chartPanes.delete(paneIndex);
            paneChart.chart.remove();
          },
        };
      },
      destroySecondaryPane: (pane) => pane.destroy(),
      onLayoutChange: () => syncLayoutDateRangeFrom(chart),
      onActivePaneChange: (index) => {
        switchActivePane(index);
      },
    });

    chartWrap.addEventListener("mousedown", () => layoutManager?.setActivePane(0));

    const toolbarRight = chromeEl.querySelector(".tv-toolbar__right");
    if (toolbarRight) {
      mountHeaderToolbar({
        mountEl: toolbarRight,
        getChart: () => chart,
        layoutManager,
        onSaveLayout: () => {
          if (!layoutManager) return;
          const saved = loadSavedLayouts();
          const name = layoutManager.getLayoutName();
          const entry = {
            name,
            layoutId: layoutManager.getLayoutId(),
            sync: layoutManager.getSync(),
          };
          const idx = saved.findIndex((s) => s.name === name);
          if (idx >= 0) saved[idx] = entry;
          else saved.push(entry);
          saveLayoutLibrary(saved);
        },
      });
    }
  }

  wireContextMenus({
    chartWrap,
    chart,
    el,
    series,
    settingsStore,
    chartSettings,
    activePriceScaleId,
    resetChartView,
    resetTimeScale,
    getState: {
      getSymbol: () => symbol,
      getCrosshairPrice: () => crosshairPrice,
      formatPrice,
      getDrawingCount: () => drawing?.getCount?.() ?? 0,
      getLockCursorByTime: () => lockCursorByTime,
      getHoverBar: () => hoverBar,
      getBars: () => bars,
      getLockedCrosshairTime: () => lockedCrosshairTime,
      setCrosshairPrice: (n) => {
        crosshairPrice = n;
      },
      setLockCursorByTime: (v) => {
        lockCursorByTime = v;
      },
      setLockedCrosshairTime: (t) => {
        lockedCrosshairTime = t;
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
      },
    });
  }

  symbolInfo = await datafeed.resolveSymbol(symbol);
  const primaryPane = chartPanes.get(0);
  if (primaryPane) primaryPane.symbolInfo = symbolInfo;
  applySymbolFormat(symbolInfo);

  applyChartSettings();
  try {
    const last = await loadBars();
    return {
      datafeed,
      chart,
      series,
      settings: settingsStore,
      openSettings: (section) => chartSettings.open(section),
      getBars: () => bars,
      getSymbol: () => symbol,
      getResolution: () => resolution,
      reload: () => loadBars(),
      setTheme(mode) {
        applyThemeMode(mode);
      },
      lastBar: last,
      barTimeLabel,
    };
  } finally {
    loader.hide();
    document.getElementById("app-loader")?.classList.add("app-loader--hidden");
  }
}
