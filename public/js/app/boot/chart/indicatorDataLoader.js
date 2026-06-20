import { getIndicatorClass } from "../../../indicators/catalog.js";
import {
  collectPaneDataNeeds,
  paneDataNeedsEmpty,
} from "../../../indicators/security/indicatorDataNeeds.js";
import { ensureHtfBars, getHtfBars, prependHtfBars } from "../../bar/htfBarCache.js";
import { ensureSymbolBars, lookupSymbolBars } from "../../bar/symbolBarCache.js";

const HTF_FETCH_IDLE_MS = 200;
const PREPEND_GUARD = 8;
const PREPEND_CHUNK = 200;

/**
 * @param {object} opts
 * @param {import("./state.js").BootContext} opts.ctx
 * @param {import("../../../indicators/controller.js").IndicatorController} opts.controller
 */
export function createIndicatorDataLoader({ ctx, controller }) {
  /** @type {ReturnType<typeof setTimeout> | null} */
  let loadTimer = null;
  /** @type {Set<number>} */
  const paneInFlight = new Set();
  /** @type {Set<string>} */
  const htfFetchInFlight = new Set();
  /** @type {Set<string>} */
  const compareFetchInFlight = new Set();

  /** @param {object} pane @param {string} symbol @param {string} resolution @param {number} countBack @param {object} [symbolInfo] */
  function htfEnsureOpts(pane, symbol, resolution, countBack, symbolInfo) {
    const info = symbolInfo ?? pane.symbolInfo ?? ctx.symbolInfo;
    return {
      datafeed: ctx.datafeed,
      symbolInfo: info,
      symbol,
      resolution,
      countBack,
      pane,
      settingsStore: ctx.settingsStore,
      symbolInfoExtra: info,
      getAllChartPanes: ctx.getAllChartPanes,
      resolutions: ctx.resolutions,
    };
  }

  function symbolBarLookupOpts(pane, symbol) {
    return {
      symbol,
      resolution: pane.resolution,
      pane,
      getAllChartPanes: ctx.getAllChartPanes,
      settingsStore: ctx.settingsStore,
      symbolInfoExtra: pane.symbolInfo ?? ctx.symbolInfo,
      resolutions: ctx.resolutions,
    };
  }

  /** @param {object} pane @param {string} symbol @param {string} resolution @param {number} countBack @param {object} [symbolInfo] */
  async function fillHtfHistory(pane, symbol, resolution, countBack) {
    const symbolInfo =
      symbol === pane.symbol
        ? (pane.symbolInfo ?? ctx.symbolInfo)
        : await ctx.datafeed.resolveSymbol(symbol);
    let entry = await ensureHtfBars(htfEnsureOpts(pane, symbol, resolution, countBack, symbolInfo));
    let guard = 0;
    while (entry && entry.utcBars.length < countBack && !entry.historyExhausted && guard < PREPEND_GUARD) {
      entry = await prependHtfBars({
        datafeed: ctx.datafeed,
        symbolInfo,
        symbol,
        resolution,
        countBack: PREPEND_CHUNK,
        pane,
        settingsStore: ctx.settingsStore,
        symbolInfoExtra: symbolInfo,
      });
      guard += 1;
    }
  }

  /** @param {object} pane @param {string} symbol @param {number} countBack */
  async function fillCompareChart(pane, symbol, countBack) {
    let hit = lookupSymbolBars({ ...symbolBarLookupOpts(pane, symbol), resolution: pane.resolution });
    if (!hit || hit.utcBars.length < countBack) {
      const symbolInfo = await ctx.datafeed.resolveSymbol(symbol);
      hit = await ensureSymbolBars({
        datafeed: ctx.datafeed,
        symbolInfo,
        symbol,
        resolution: pane.resolution,
        countBack,
        pane,
        settingsStore: ctx.settingsStore,
        symbolInfoExtra: symbolInfo,
        getAllChartPanes: ctx.getAllChartPanes,
        resolutions: ctx.resolutions,
      });
    }
    let entry = getHtfBars(symbol, pane.resolution);
    let guard = 0;
    const symbolInfo = await ctx.datafeed.resolveSymbol(symbol);
    while (entry && entry.utcBars.length < countBack && !entry.historyExhausted && guard < PREPEND_GUARD) {
      entry = await prependHtfBars({
        datafeed: ctx.datafeed,
        symbolInfo,
        symbol,
        resolution: pane.resolution,
        countBack: PREPEND_CHUNK,
        pane,
        settingsStore: ctx.settingsStore,
        symbolInfoExtra: symbolInfo,
      });
      guard += 1;
    }
  }

  /** @param {object} pane */
  async function ensurePaneData(pane) {
    if (!pane?.symbol || !ctx.datafeed) return;
    if (paneInFlight.has(pane.index)) return;

    const needs = collectPaneDataNeeds(
      controller.indicatorsForPane(pane.index),
      pane,
      getIndicatorClass,
    );
    if (paneDataNeedsEmpty(needs)) return;

    paneInFlight.add(pane.index);
    try {
      for (const [key, countBack] of needs.htf) {
        const sep = key.indexOf("|");
        const symbol = key.slice(0, sep);
        const resolution = key.slice(sep + 1);
        await fillHtfHistory(pane, symbol, resolution, countBack);
      }
      for (const [symbol, countBack] of needs.compareChart) {
        await fillCompareChart(pane, symbol, countBack);
      }
      for (const [key, countBack] of needs.compareHtf) {
        const sep = key.indexOf("|");
        const symbol = key.slice(0, sep);
        const resolution = key.slice(sep + 1);
        await fillHtfHistory(pane, symbol, resolution, countBack);
      }
      controller.invalidateOverlayCacheForPane(pane.index);
      controller.refreshOverlaysImmediate(pane.index);
    } finally {
      paneInFlight.delete(pane.index);
    }
  }

  /** @param {number} [delayMs] */
  function scheduleLoad(delayMs = HTF_FETCH_IDLE_MS) {
    if (loadTimer != null) clearTimeout(loadTimer);
    loadTimer = setTimeout(() => {
      loadTimer = null;
      for (const pane of ctx.getAllChartPanes()) {
        void ensurePaneData(pane);
      }
    }, delayMs);
  }

  /** @param {object} pane @param {string} symbol @param {string} resolution @param {number} countBack */
  function scheduleCompareBarsFetch(pane, symbol, resolution, countBack) {
    if (!pane || !ctx.datafeed || !symbol || !resolution) return;
    const want = Math.max(50, Number(countBack) || 300);
    const key = `${symbol}|${resolution}`;
    if (compareFetchInFlight.has(key)) return;

    const hit = lookupSymbolBars({
      symbol,
      resolution,
      pane,
      getAllChartPanes: ctx.getAllChartPanes,
      settingsStore: ctx.settingsStore,
      symbolInfoExtra: pane.symbolInfo ?? ctx.symbolInfo,
      resolutions: ctx.resolutions,
    });
    if (hit && hit.utcBars.length >= want) return;

    compareFetchInFlight.add(key);
    void ctx.datafeed
      .resolveSymbol(symbol)
      .then((symbolInfo) =>
        ensureSymbolBars({
          datafeed: ctx.datafeed,
          symbolInfo,
          symbol,
          resolution,
          countBack: want,
          pane,
          settingsStore: ctx.settingsStore,
          symbolInfoExtra: symbolInfo,
          getAllChartPanes: ctx.getAllChartPanes,
          resolutions: ctx.resolutions,
        }),
      )
      .then(() => {
        controller.invalidateOverlayCacheForPane(pane.index);
        controller.refreshOverlaysImmediate(pane.index);
      })
      .finally(() => compareFetchInFlight.delete(key));
  }

  /** @param {object} pane @param {string} [symbol] @param {string} resId @param {number} countBack */
  function scheduleHtfBarsFetch(pane, symbol, resId, countBack) {
    const sym = symbol ?? pane?.symbol;
    if (!sym || !pane || !ctx.datafeed) return;
    const key = `${sym}|${resId}`;
    if (htfFetchInFlight.has(key)) return;
    htfFetchInFlight.add(key);
    void ensureHtfBars(htfEnsureOpts(pane, sym, resId, countBack))
      .then(() => {
        controller.invalidateOverlayCacheForPane(pane.index);
        controller.refreshOverlaysImmediate(pane.index);
      })
      .finally(() => htfFetchInFlight.delete(key));
  }

  return {
    scheduleLoad,
    ensureNow: () => scheduleLoad(0),
    scheduleCompareBarsFetch,
    scheduleHtfBarsFetch,
  };
}
