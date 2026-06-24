import { getIndicatorClass } from "../../../indicators/catalog.js";
import {
  collectPaneDataNeeds,
  paneDataNeedsEmpty,
} from "../../../indicators/security/indicatorDataNeeds.js";
import { ensureHtfBars, getHtfBars, prependHtfBars } from "../../bar/htfBarCache.js";
import { ensureSymbolBars, lookupSymbolBars } from "../../bar/symbolBarCache.js";
import { getPaneChartView } from "../../../chart/pane/viewCache.js";
import { uniqueEtDaysFromBars } from "../../../core/etTime.js";
import {
  fetchNewsCalendarDay,
  getCachedNewsDay,
  newsDaysReady,
} from "../../news/newsCache.js";
import { getNewsSettingsStore } from "../../../news/settings.js";
import { enabledNewsTypeIds } from "../../../news/events.js";

const HTF_FETCH_IDLE_MS = 200;
const PREPEND_GUARD = 8;
const PREPEND_CHUNK = 200;

/** @param {string} symbol @param {string} resolution */
function htfStoreBarCount(symbol, resolution) {
  return getHtfBars(symbol, resolution)?.utcBars?.length ?? 0;
}

/** @param {import("../../../indicators/security/indicatorDataNeeds.js").PaneDataNeeds} needs @param {object} pane */
function snapshotPaneBarCounts(needs, pane) {
  const htf = new Map();
  for (const key of new Set([...needs.htf.keys(), ...needs.compareHtf.keys()])) {
    const sep = key.indexOf("|");
    htf.set(key, htfStoreBarCount(key.slice(0, sep), key.slice(sep + 1)));
  }
  const compare = new Map();
  for (const symbol of needs.compareChart.keys()) {
    compare.set(symbol, htfStoreBarCount(symbol, pane.resolution));
  }
  return { htf, compare };
}

/** @param {import("../../../indicators/security/indicatorDataNeeds.js").PaneDataNeeds} needs @param {object} pane @param {{ htf: Map<string, number>, compare: Map<string, number> }} before */
function paneBarCountsChanged(needs, pane, before) {
  for (const key of new Set([...needs.htf.keys(), ...needs.compareHtf.keys()])) {
    const sep = key.indexOf("|");
    const next = htfStoreBarCount(key.slice(0, sep), key.slice(sep + 1));
    if (next > (before.htf.get(key) ?? 0)) return true;
  }
  for (const symbol of needs.compareChart.keys()) {
    const next = htfStoreBarCount(symbol, pane.resolution);
    if (next > (before.compare.get(symbol) ?? 0)) return true;
  }
  return false;
}

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
    let symbolInfo;
    if (symbol === pane.symbol) {
      symbolInfo = pane.symbolInfo ?? ctx.symbolInfo;
      if (!symbolInfo) return;
    } else {
      symbolInfo = await ctx.datafeed.resolveSymbol(symbol);
      if (!symbolInfo) return;
    }
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

  /** @param {import("../../../indicators/security/indicatorDataNeeds.js").NewsNeed} newsNeed */
  async function fillNewsCalendar(newsNeed) {
    if (!newsNeed?.days?.length) return;
    const opts = { source: newsNeed.source, types: newsNeed.types };
    await Promise.all(
      newsNeed.days.map(async (day) => {
        if (getCachedNewsDay(day, opts)) return;
        await fetchNewsCalendarDay(day, opts);
      }),
    );
  }

  /** @param {object} pane */
  function newsContextForPane(pane) {
    const view = getPaneChartView(
      pane,
      ctx.settingsStore,
      pane.symbolInfo ?? ctx.symbolInfo,
      ctx.resolutions,
    );
    const newsStore = getNewsSettingsStore();
    const days = uniqueEtDaysFromBars(view.utcBars);
    const enabled = newsStore.isEnabled();
    const settings = newsStore.get();
    const opts = {
      source: settings.source ?? "forexfactory",
      // Always fetch full day events; filter client-side for release levels.
      types: [],
    };
    return {
      newsOpts: opts,
      days,
      isNewsEnabled: () => enabled,
      getNewsRows: () =>
        enabled ? (settings.eventTypes ?? []).filter((r) => r.enabled !== false) : [],
      newsPending: () =>
        Boolean(enabled && days.length && !newsDaysReady(days, opts)),
      getNewsByDay: () => {
        if (!enabled) return {};
        /** @type {Record<string, object>} */
        const out = {};
        for (const day of days) {
          const hit = getCachedNewsDay(day, opts);
          if (hit) out[day] = hit;
        }
        return out;
      },
    };
  }

  /** @param {object} pane */
  async function ensureGlobalNews(pane) {
    const newsStore = getNewsSettingsStore();
    if (!newsStore.isEnabled()) return;
    const view = getPaneChartView(
      pane,
      ctx.settingsStore,
      pane.symbolInfo ?? ctx.symbolInfo,
      ctx.resolutions,
    );
    const days = uniqueEtDaysFromBars(view.utcBars);
    const settings = newsStore.get();
    if (!days.length) return;
    await fillNewsCalendar({ source: settings.source ?? "forexfactory", types: [], days });
  }

  /** @param {object} pane */
  async function ensurePaneData(pane) {
    if (!pane?.symbol) return;
    if (paneInFlight.has(pane.index)) return;

    const view = getPaneChartView(
      pane,
      ctx.settingsStore,
      pane.symbolInfo ?? ctx.symbolInfo,
      ctx.resolutions,
    );
    const needs = collectPaneDataNeeds(
      controller.indicatorsForPane(pane.index),
      { ...pane, bars: view.utcBars },
      getIndicatorClass,
    );
    if (paneDataNeedsEmpty(needs)) return;

    paneInFlight.add(pane.index);
    try {
      await ensureGlobalNews(pane);
      if (!ctx.datafeed) {
        controller.invalidateOverlayCacheForPane(pane.index);
        controller.refreshOverlaysSilent(pane.index);
        return;
      }
      const barCountsBefore = snapshotPaneBarCounts(needs, pane);
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
      if (!paneBarCountsChanged(needs, pane, barCountsBefore)) return;
      controller.invalidateOverlayCacheForPane(pane.index, {
        htfKeys: new Set([...needs.htf.keys(), ...needs.compareHtf.keys()]),
        compareSymbols: new Set(needs.compareChart.keys()),
      });
      controller.refreshOverlaysSilent(pane.index);
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
    const beforeLen = htfStoreBarCount(symbol, resolution);
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
        if (htfStoreBarCount(symbol, resolution) <= beforeLen) return;
        controller.invalidateOverlayCacheForPane(pane.index, {
          compareSymbols: new Set([symbol]),
        });
        controller.refreshOverlaysSilent(pane.index);
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
    const beforeLen = htfStoreBarCount(sym, resId);
    void ensureHtfBars(htfEnsureOpts(pane, sym, resId, countBack))
      .then((entry) => {
        const afterLen = entry?.utcBars?.length ?? htfStoreBarCount(sym, resId);
        if (afterLen <= beforeLen) return;
        controller.invalidateOverlayCacheForPane(pane.index, {
          htfKeys: new Set([key]),
        });
        controller.refreshOverlaysSilent(pane.index);
      })
      .finally(() => htfFetchInFlight.delete(key));
  }

  return {
    scheduleLoad,
    ensureNow: () => scheduleLoad(0),
    scheduleCompareBarsFetch,
    scheduleHtfBarsFetch,
    newsContextForPane,
  };
}
