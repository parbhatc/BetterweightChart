import { readPageOptions } from "../../../datafeed/index.js";
import { getPaneSymbol } from "../../../ui/chart/symbol/store.js";
import { loadLastResolution, saveLastResolution } from "../../../ui/timeframe/favorites.js";
import { createChartSettings } from "../../../ui/chart/settings.js";
import { createAppLoader } from "../../../ui/loader/app.js";
import { resolveTimezone } from "../../../chart/timezone/list.js";
import { createFeatureFlags } from "../../../chart/features.js";

/**
 * @typedef {object} BootContext
 * @property {ReturnType<typeof readPageOptions>} opts
 * @property {import("../../../chart/features.js").FeatureFlags} featureFlags
 * @property {boolean} debugOn
 * @property {"dark" | "light"} currentTheme
 * @property {object} cfg
 * @property {object} themeColors
 * @property {object[]} resolutions
 * @property {HTMLElement} el
 * @property {object} datafeed
 * @property {ReturnType<typeof createChartSettings>} settingsStore
 * @property {ReturnType<typeof createAppLoader>} loader
 * @property {string} symbol
 * @property {string} resolution
 * @property {object | null} symbolInfo
 * @property {Map<number, import("./types.js").ChartPane & { destroy?: () => void }>} chartPanes
 * @property {import("lightweight-charts").IChartApi} chart
 * @property {import("lightweight-charts").ISeriesApi} series
 * @property {object[]} bars
 * @property {object} ui
 * @property {boolean} barsLoading
 * @property {ReturnType<import("../../../chart/time/timeAdapter.js").createTimeAdapter> | null} timeAdapter
 * @property {number | null} futureWhitespaceBars
 * @property {HTMLElement | null} watermarkText
 * @property {HTMLElement} chartWrap
 * @property {HTMLElement | null} stageEl
 * @property {HTMLElement | null} chromeEl
 * @property {HTMLElement | null} drawToolbar
 * @property {HTMLElement | null} workspaceEl
 * @property {HTMLElement | null} statusEl
 * @property {HTMLElement | null} symbolPicker
 * @property {HTMLElement | null} tfPickerEl
 * @property {HTMLElement | null} bottomToolbar
 * @property {object | null} tzClock
 * @property {object | null} layoutManager
 * @property {object | null} headerToolbarUi
 * @property {ReturnType<typeof setTimeout> | null} layoutAutosaveTimer
 * @property {object | null} symbolSearchUi
 * @property {object | null} tfPickerUi
 * @property {object | null} drawingHub
 * @property {object | null} drawing
 * @property {object | null} debugHud
 * @property {object} panFps
 * @property {object} paneExtras
 * @property {object} viewportDeps
 * @property {() => void} applyTheme
 * @property {(n: number) => void} scrollToLatest
 * @property {(mode: "dark" | "light") => void} applyThemeMode
 * @property {() => void} applyChartSettings
 * @property {() => void} refreshWatermark
 * @property {() => void} refreshStatusLine
 * @property {(pane: object) => void} scheduleStatusLine
 * @property {() => void} applySymbolLineStyleLocal
 * @property {() => import("./types.js").ChartPane | undefined} getActivePane
 * @property {() => import("./types.js").ChartPane[]} getAllChartPanes
 * @property {() => { chart: import("lightweight-charts").IChartApi, series: import("lightweight-charts").ISeriesApi }[]} getLayoutCharts
 * @property {(index: number) => void} switchActivePane
 * @property {() => string} activePriceScaleId
 * @property {() => void} maintainLockedRatio
 * @property {() => void} syncLayoutDateRangeFrom
 * @property {(pane: object, wrapEl: HTMLElement) => object} buildPaneContextMenuOpts
 * @property {() => Promise<void>} loadBars
 * @property {(panes: object[]) => Promise<void>} loadBarsForPanes
 * @property {(pane: object) => Promise<void>} loadPaneBars
 * @property {(pane: object, bar: object) => void} pushLiveBar
 * @property {(pane: object, bar: object) => void} upsertLiveBar
 * @property {(...args: unknown[]) => Promise<void>} prependHistory
 * @property {(...args: unknown[]) => Promise<void>} ensureHistoryNearEdge
 * @property {(v: boolean) => void} setOverlayLoaderEnabled
 * @property {() => void} autosaveLayout
 * @property {() => void} scheduleAutosaveLayout
 * @property {() => object} buildLayoutEntry
 * @property {(s: object) => void} applyLayoutChartSettings
 * @property {() => void} restoreLayoutChartSettings
 * @property {() => void} restoreLayoutToolDefaults
 * @property {() => void} restoreLayoutDrawingTemplates
 * @property {() => void} restoreLayoutDrawings
 * @property {(initial: string, title: string, confirmLabel: string) => Promise<string | null>} uniqueLayoutName
 * @property {() => ReturnType<typeof import("../../../ui/chart/settings.js").mountChartSettings>} mountChartSettingsUi
 * @property {(n: number | null) => string} formatPrice
 * @property {(info: object) => void} applySymbolFormat
 * @property {() => void} resetChartView
 * @property {() => void} resetTimeScale
 * @property {() => void} afterTimeframeChange
 * @property {(pane: object) => void} attachPaneDrawings
 * @property {() => void} applyDrawingCursorAll
 * @property {(pane: object) => object} buildDrawingContext
 * @property {() => void} persistPaneSymbols
 * @property {(pane: object) => void} refreshPaneCandleData
 * @property {() => void} refreshCandleData
 * @property {(pane: object) => number} barSecForPaneLocal
 * @property {() => number} barSec
 * @property {() => object[]} barsForChart
 * @property {(pane: object, visible: object[]) => object[]} buildChartSeriesForPaneLocal
 * @property {(visible: object[]) => object[]} buildChartSeriesForDisplay
 * @property {(targetChart: object, targetSeries: object, pane: object) => void} applySettingsToChartLocal
 * @property {() => void} applyChartTimezone
 * @property {(pane: object) => void} setupPaneExtras
 * @property {(pane: object) => void} refreshPaneStatusLine
 * @property {(pane: object, wrapEl: HTMLElement) => object} wireLayoutPaneSync
 * @property {typeof resolveTimezone} resolveTimezone
 */

/**
 * @param {Partial<ReturnType<typeof readPageOptions>>} overrides
 * @returns {BootContext}
 */
export function createBootContext(overrides) {
  const opts = { ...readPageOptions(), ...overrides };
  const currentTheme = opts.theme === "light" ? "light" : "dark";
  const settingsStore = createChartSettings();
  const chartPanes = new Map();
  let barsLoading = true;
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

  const el =
    overrides.mount instanceof HTMLElement
      ? overrides.mount
      : document.getElementById(overrides.mountId ?? "chart");
  if (!el) throw new Error("#chart element missing (pass mount or mountId)");

  let symbol = getPaneSymbol(0, opts.symbol);
  let resolution = "";
  let symbolInfo = null;
  let bars = [];
  let timeAdapter = null;
  let futureWhitespaceBars = null;

  /** @type {BootContext} */
  const ctx = {
    opts,
    featureFlags: createFeatureFlags({}),
    debugOn: false,
    currentTheme,
    cfg: {},
    themeColors: {},
    resolutions: [],
    el,
    datafeed: null,
    settingsStore,
    loader: createAppLoader(document.querySelector(".tv-stage")),
    symbol,
    resolution,
    symbolInfo,
    chartPanes,
    chart: /** @type {import("lightweight-charts").IChartApi} */ (/** @type {unknown} */ (null)),
    series: /** @type {import("lightweight-charts").ISeriesApi} */ (/** @type {unknown} */ (null)),
    bars,
    ui,
    get barsLoading() {
      return barsLoading;
    },
    set barsLoading(v) {
      barsLoading = v;
    },
    timeAdapter,
    futureWhitespaceBars,
    watermarkText: document.getElementById("watermark"),
    chartWrap: el.closest(".tv-chart-wrap") ?? el,
    stageEl: document.querySelector(".tv-stage"),
    chromeEl: document.querySelector(".tv-toolbar"),
    drawToolbar: document.getElementById("drawing-toolbar"),
    workspaceEl: document.querySelector(".tv-workspace"),
    statusEl: document.getElementById("ohlc"),
    symbolPicker: document.getElementById("symbol-picker"),
    tfPickerEl: document.getElementById("timeframe-picker"),
    bottomToolbar: document.getElementById("chart-bottom-toolbar"),
    tzClock: null,
    layoutManager: null,
    headerToolbarUi: null,
    layoutAutosaveTimer: null,
    symbolSearchUi: null,
    tfPickerUi: null,
    drawingHub: null,
    drawing: null,
    debugHud: null,
    panFps: /** @type {object} */ ({}),
    paneExtras: /** @type {object} */ ({}),
    viewportDeps: /** @type {object} */ ({}),
    applyTheme: () => {},
    scrollToLatest: () => {},
    applyThemeMode: () => {},
    applyChartSettings: () => {},
    refreshWatermark: () => {},
    refreshStatusLine: () => {},
    scheduleStatusLine: () => {},
    applySymbolLineStyleLocal: () => {},
    getActivePane: () => undefined,
    getAllChartPanes: () => [],
    getLayoutCharts: () => [],
    switchActivePane: () => {},
    activePriceScaleId: () => "right",
    maintainLockedRatio: () => {},
    syncLayoutDateRangeFrom: () => {},
    buildPaneContextMenuOpts: () => ({}),
    loadBars: async () => {},
    loadBarsForPanes: async () => {},
    loadPaneBars: async () => {},
    pushLiveBar: () => {},
    upsertLiveBar: () => {},
    prependHistory: async () => {},
    ensureHistoryNearEdge: async () => {},
    setOverlayLoaderEnabled: () => {},
    autosaveLayout: () => {},
    scheduleAutosaveLayout: () => {},
    buildLayoutEntry: () => ({}),
    applyLayoutChartSettings: () => {},
    restoreLayoutChartSettings: () => {},
    restoreLayoutToolDefaults: () => {},
    restoreLayoutDrawingTemplates: () => {},
    restoreLayoutDrawings: () => {},
    uniqueLayoutName: async () => null,
    mountChartSettingsUi: () => /** @type {ReturnType<import("../../../ui/chart/settings.js").mountChartSettings>} */ (/** @type {unknown} */ (null)),
    formatPrice: () => "—",
    applySymbolFormat: () => {},
    resetChartView: () => {},
    resetTimeScale: () => {},
    afterTimeframeChange: () => {},
    attachPaneDrawings: () => {},
    applyDrawingCursorAll: () => {},
    buildDrawingContext: () => ({}),
    persistPaneSymbols: () => {},
    refreshPaneCandleData: () => {},
    refreshCandleData: () => {},
    barSecForPaneLocal: () => 60,
    barSec: () => 60,
    barsForChart: () => [],
    buildChartSeriesForPaneLocal: () => [],
    buildChartSeriesForDisplay: () => [],
    applySettingsToChartLocal: () => {},
    applyChartTimezone: () => {},
    setupPaneExtras: () => {},
    refreshPaneStatusLine: () => {},
    wireLayoutPaneSync: () => {},
    resolveTimezone,
  };

  Object.defineProperties(ctx, {
    symbol: {
      get: () => symbol,
      set: (v) => {
        symbol = v;
      },
    },
    resolution: {
      get: () => resolution,
      set: (v) => {
        resolution = v;
      },
    },
    symbolInfo: {
      get: () => symbolInfo,
      set: (v) => {
        symbolInfo = v;
      },
    },
    bars: {
      get: () => bars,
      set: (v) => {
        bars = v;
      },
    },
    timeAdapter: {
      get: () => timeAdapter,
      set: (v) => {
        timeAdapter = v;
      },
    },
    futureWhitespaceBars: {
      get: () => futureWhitespaceBars,
      set: (v) => {
        futureWhitespaceBars = v;
      },
    },
  });

  return ctx;
}

/**
 * @param {BootContext} ctx
 * @param {object} cfg
 */
export function initSymbolResolution(ctx, cfg) {
  ctx.resolution = loadLastResolution(ctx.opts.resolution || cfg.default_resolution || "1", ctx.resolutions);
  saveLastResolution(ctx.resolution);
}
