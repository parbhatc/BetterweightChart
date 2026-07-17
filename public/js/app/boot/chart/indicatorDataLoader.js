import { getIndicatorClass } from "../../../indicators/catalog.js";
import {
  collectPaneDataNeeds,
  instanceUsesCompareSymbols,
  paneDataNeedsEmpty,
} from "../../../indicators/security/indicatorDataNeeds.js";
import {
  ensureHtfBars,
  extendHtfCacheForAnchor,
  getDataEpoch,
  getHtfBars,
  getHtfSeriesVersion,
  htfCacheStaleForAnchor,
  noteReplayAnchor,
  prependHtfBars,
} from "../../bar/htfBarCache.js";
import { resolutionSec } from "../../../chart/resolutions.js";
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
import { indicatorDebug } from "../../../debug/chart/indicators.js";

const HTF_FETCH_IDLE_MS = 200;
const PREPEND_GUARD = 8;
const PREPEND_CHUNK = 200;

/** @param {string} symbol @param {string} resolution */
function htfStoreBarCount(symbol, resolution) {
  return getHtfBars(symbol, resolution)?.utcBars?.length ?? 0;
}

/**
 * Snapshot store VERSIONS (not bar counts) — an equal-length write that
 * corrects values (finalized forming bucket, range replace) must still
 * invalidate overlay caches.
 * @param {import("../../../indicators/security/indicatorDataNeeds.js").PaneDataNeeds} needs @param {object} pane
 */
function snapshotPaneBarCounts(needs, pane) {
  const htf = new Map();
  for (const key of new Set([...needs.htf.keys(), ...needs.compareHtf.keys()])) {
    const sep = key.indexOf("|");
    htf.set(key, getHtfSeriesVersion(key.slice(0, sep), key.slice(sep + 1)));
  }
  const compare = new Map();
  for (const symbol of needs.compareChart.keys()) {
    compare.set(symbol, getHtfSeriesVersion(symbol, pane.resolution));
  }
  return { htf, compare };
}

/** @param {import("../../../indicators/security/indicatorDataNeeds.js").PaneDataNeeds} needs @param {object} pane @param {{ htf: Map<string, number>, compare: Map<string, number> }} before */
function paneBarCountsChanged(needs, pane, before) {
  for (const key of new Set([...needs.htf.keys(), ...needs.compareHtf.keys()])) {
    const sep = key.indexOf("|");
    const next = getHtfSeriesVersion(key.slice(0, sep), key.slice(sep + 1));
    if (next !== (before.htf.get(key) ?? 0)) return true;
  }
  for (const symbol of needs.compareChart.keys()) {
    const next = getHtfSeriesVersion(symbol, pane.resolution);
    if (next !== (before.compare.get(symbol) ?? 0)) return true;
  }
  return false;
}

/**
 * @param {object} opts
 * @param {import("./state.js").BootContext} opts.ctx
 * @param {import("../../../indicators/controller.js").IndicatorController} opts.controller
 * @param {() => boolean} [opts.isChartPanning]
 * @param {(paneIndex: number) => void} [opts.requestOverlayRefresh]
 * @param {() => void} [opts.deferHeavyWork]
 */
export function createIndicatorDataLoader({
  ctx,
  controller,
  isChartPanning = () => false,
  requestOverlayRefresh = (paneIndex) => controller.refreshOverlaysSilent(paneIndex),
  deferHeavyWork = () => {},
  /** @type {(pane: object) => object[] | undefined} */
  paneBarsForNeeds = null,
}) {
  /** @type {ReturnType<typeof setTimeout> | null} */
  let loadTimer = null;
  /** @type {Set<number>} */
  const paneInFlight = new Set();
  /** @type {Set<string>} */
  const htfFetchInFlight = new Set();
  /** @type {Set<string>} */
  const compareFetchInFlight = new Set();

  /**
   * Replay anchor for the pane, or null. Also feeds rewind detection — a
   * backward anchor move bumps the data epoch (drops stale anchored caches).
   * @param {object} pane
   */
  function paneAnchorSec(pane) {
    const a =
      typeof ctx.opts?.getPlaybackAnchorSec === "function"
        ? ctx.opts.getPlaybackAnchorSec(pane.resolution)
        : null;
    if (a != null && Number.isFinite(a)) {
      noteReplayAnchor(pane.resolution, a);
      return a;
    }
    return null;
  }

  /** True when `resolution` is coarser than the pane chart (store holds closed buckets only). */
  function confirmedOnlyFor(pane, resolution) {
    const tf = resolutionSec(resolution);
    const chart = resolutionSec(pane?.resolution ?? "");
    return tf != null && chart != null && tf > chart;
  }

  /** @param {object} pane @param {string} symbol @param {string} resolution @param {number} countBack @param {object} [symbolInfo] */
  function htfEnsureOpts(pane, symbol, resolution, countBack, symbolInfo) {
    const info = symbolInfo ?? pane.symbolInfo ?? ctx.symbolInfo;
    const playbackAnchorSec = paneAnchorSec(pane);
    return {
      datafeed: ctx.datafeed,
      symbolInfo: info,
      symbol,
      resolution,
      countBack,
      pane,
      settingsStore: ctx.settingsStore,
      symbolInfoExtra: info,
      playbackAnchorSec,
      getAllChartPanes: ctx.getAllChartPanes,
      resolutions: ctx.resolutions,
    };
  }

  /** @param {object} pane @returns {Promise<boolean>} true when any HTF tail was extended */
  async function extendHtfTailForReplay(pane) {
    if (!pane?.symbol || !ctx.datafeed) return false;
    const anchorSec = paneAnchorSec(pane);
    if (anchorSec == null) return false;
    const startEpoch = getDataEpoch();

    const view = getPaneChartView(
      pane,
      ctx.settingsStore,
      pane.symbolInfo ?? ctx.symbolInfo,
      ctx.resolutions,
    );
    const bars =
      (typeof paneBarsForNeeds === "function" ? paneBarsForNeeds(pane) : null) ??
      view?.utcBars ??
      [];
    const needs = collectPaneDataNeeds(
      controller.indicatorsForPane(pane.index),
      { ...pane, bars },
      getIndicatorClass,
    );
    let extended = false;
    for (const key of needs.htf.keys()) {
      const sep = key.indexOf("|");
      const symbol = key.slice(0, sep);
      const resolution = key.slice(sep + 1);
      const confirmedOnly = confirmedOnlyFor(pane, resolution);
      if (!htfCacheStaleForAnchor(symbol, resolution, anchorSec, { confirmedOnly })) continue;
      const symbolInfo =
        symbol === pane.symbol
          ? pane.symbolInfo ?? ctx.symbolInfo
          : await ctx.datafeed.resolveSymbol(symbol);
      if (!symbolInfo) continue;
      await extendHtfCacheForAnchor({
        ...htfEnsureOpts(pane, symbol, resolution, 16, symbolInfo),
        anchorSec,
        symbolInfo,
      });
      if (getDataEpoch() !== startEpoch) return false;
      extended = true;
      controller.invalidateOverlayCacheForPane(pane.index, { htfKeys: new Set([key]) });
    }
    // Compare-chart series (e.g. SMT's ES at chart resolution) need the same
    // anchor-based tail extension, or they go stale as soon as replay steps
    // past their cached tail (count-based sufficiency never notices).
    for (const symbol of needs.compareChart.keys()) {
      if (!symbol || symbol === pane.symbol) continue;
      if (!htfCacheStaleForAnchor(symbol, pane.resolution, anchorSec)) continue;
      const symbolInfo = await ctx.datafeed.resolveSymbol(symbol);
      if (!symbolInfo) continue;
      await extendHtfCacheForAnchor({
        ...htfEnsureOpts(pane, symbol, pane.resolution, 16, symbolInfo),
        anchorSec,
        symbolInfo,
      });
      if (getDataEpoch() !== startEpoch) return false;
      extended = true;
      controller.invalidateOverlayCacheForPane(pane.index, {
        htfKeys: new Set([`${symbol}|${pane.resolution}`]),
      });
    }
    return extended;
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
    const ensureOpts = htfEnsureOpts(pane, symbol, resolution, countBack, symbolInfo);
    const anchorSec = ensureOpts.playbackAnchorSec;
    const confirmedOnly = confirmedOnlyFor(pane, resolution);
    if (anchorSec != null && ctx.opts?.replayHostControlled) {
      const stored = getHtfBars(symbol, resolution);
      const stale = htfCacheStaleForAnchor(symbol, resolution, anchorSec, { confirmedOnly });
      if (stored?.utcBars?.length && !stale) {
        return;
      }
      if (stored?.utcBars?.length && stale) {
        await extendHtfCacheForAnchor({
          ...ensureOpts,
          anchorSec,
          symbolInfo,
        });
        return;
      }
      // ponytail: empty store still needs one initial fetch; tail-only path is for Next steps
      await ensureHtfBars(ensureOpts);
      return;
    }
    if (anchorSec != null && htfCacheStaleForAnchor(symbol, resolution, anchorSec, { confirmedOnly })) {
      await extendHtfCacheForAnchor({
        ...ensureOpts,
        anchorSec,
        symbolInfo,
      });
    }
    let entry = await ensureHtfBars(ensureOpts);
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
    const anchorSec = paneAnchorSec(pane);
    let hit = lookupSymbolBars({ ...symbolBarLookupOpts(pane, symbol), resolution: pane.resolution });
    const tailStale =
      anchorSec != null && htfCacheStaleForAnchor(symbol, pane.resolution, anchorSec);
    if (!hit || hit.utcBars.length < countBack || tailStale) {
      const symbolInfo = await ctx.datafeed.resolveSymbol(symbol);
      if (tailStale && htfStoreBarCount(symbol, pane.resolution) > 0) {
        await extendHtfCacheForAnchor({
          ...htfEnsureOpts(pane, symbol, pane.resolution, 16, symbolInfo),
          anchorSec,
          symbolInfo,
        });
      } else {
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
          playbackAnchorSec: anchorSec,
        });
      }
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

  /** @param {object} pane @param {{ skipRefresh?: boolean }} [opts] */
  async function ensurePaneData(pane, opts = {}) {
    if (!pane?.symbol) return;
    if (isChartPanning()) {
      deferHeavyWork();
      return;
    }
    if (paneInFlight.has(pane.index)) return;
    const startEpoch = getDataEpoch();

    await ctx.ensureIndicatorChartHistory?.(pane);
    if (getDataEpoch() !== startEpoch) return;

    const view = getPaneChartView(
      pane,
      ctx.settingsStore,
      pane.symbolInfo ?? ctx.symbolInfo,
      ctx.resolutions,
    );
    const bars =
      (typeof paneBarsForNeeds === "function" ? paneBarsForNeeds(pane) : null) ??
      view?.utcBars ??
      [];
    const needs = collectPaneDataNeeds(
      controller.indicatorsForPane(pane.index),
      { ...pane, bars },
      getIndicatorClass,
    );
    for (const key of needs.htf.keys()) {
      const sep = key.indexOf("|");
      const storedLen = htfStoreBarCount(key.slice(0, sep), key.slice(sep + 1));
      if (storedLen > (needs.htf.get(key) ?? 0)) needs.htf.set(key, storedLen);
    }
    for (const key of needs.compareHtf.keys()) {
      const sep = key.indexOf("|");
      const storedLen = htfStoreBarCount(key.slice(0, sep), key.slice(sep + 1));
      if (storedLen > (needs.compareHtf.get(key) ?? 0)) needs.compareHtf.set(key, storedLen);
    }
    if (paneDataNeedsEmpty(needs)) return;

    const visibleIds = controller
      .indicatorsForPane(pane.index)
      .filter((inst) => !inst.hidden)
      .map((inst) => inst.defId);
    indicatorDebug("data.ensure", {
      pane: pane.index,
      visibleInstances: visibleIds,
      htf: Object.fromEntries(needs.htf),
      compareChart: Object.fromEntries(needs.compareChart),
      compareHtf: Object.fromEntries(needs.compareHtf),
    });

    paneInFlight.add(pane.index);
    try {
      await ensureGlobalNews(pane);
      if (getDataEpoch() !== startEpoch) return;
      if (!ctx.datafeed) {
        controller.invalidateOverlayCacheForPane(pane.index);
        requestOverlayRefresh(pane.index);
        return;
      }
      const barCountsBefore = snapshotPaneBarCounts(needs, pane);
      for (const [key, countBack] of needs.htf) {
        if (isChartPanning()) {
          deferHeavyWork();
          return;
        }
        const sep = key.indexOf("|");
        const symbol = key.slice(0, sep);
        const resolution = key.slice(sep + 1);
        await fillHtfHistory(pane, symbol, resolution, countBack);
      }
      for (const [symbol, countBack] of needs.compareChart) {
        if (isChartPanning()) {
          deferHeavyWork();
          return;
        }
        await fillCompareChart(pane, symbol, countBack);
      }
      for (const [key, countBack] of needs.compareHtf) {
        if (isChartPanning()) {
          deferHeavyWork();
          return;
        }
        const sep = key.indexOf("|");
        const symbol = key.slice(0, sep);
        const resolution = key.slice(sep + 1);
        await fillHtfHistory(pane, symbol, resolution, countBack);
      }
      // A symbol/TF/replay transition happened mid-load: results were dropped
      // by the store, and pane state may no longer match — skip refresh.
      if (getDataEpoch() !== startEpoch) return;
      if (!paneBarCountsChanged(needs, pane, barCountsBefore)) return;
      controller.invalidateOverlayCacheForPane(pane.index, {
        htfKeys: new Set([...needs.htf.keys(), ...needs.compareHtf.keys()]),
        compareSymbols: new Set(needs.compareChart.keys()),
      });
      if (!opts.skipRefresh) requestOverlayRefresh(pane.index);
      for (const sym of needs.compareChart.keys()) {
        refreshPanesUsingCompareSymbol(sym);
      }
    } finally {
      paneInFlight.delete(pane.index);
    }
  }

  /** @param {number} [delayMs] */
  function scheduleLoad(delayMs = HTF_FETCH_IDLE_MS) {
    if (loadTimer != null) clearTimeout(loadTimer);
    loadTimer = setTimeout(() => {
      loadTimer = null;
      if (isChartPanning()) {
        deferHeavyWork();
        return;
      }
      for (const pane of ctx.getAllChartPanes()) {
        void ensurePaneData(pane);
      }
    }, delayMs);
  }

  /** @param {string} compareSymbol */
  function refreshPanesUsingCompareSymbol(compareSymbol) {
    if (!compareSymbol) return;
    const compareSet = new Set([compareSymbol]);
    for (const pane of ctx.getAllChartPanes()) {
      controller.invalidateOverlayCacheForPane(pane.index, { compareSymbols: compareSet });
      const instances = controller.indicatorsForPane(pane.index) ?? [];
      const paneCtx = { symbol: pane.symbol, bars: pane.bars };
      if (
        instances.some((inst) =>
          instanceUsesCompareSymbols(inst, paneCtx, getIndicatorClass, compareSet),
        )
      ) {
        requestOverlayRefresh(pane.index);
      }
    }
  }

  /** @param {object} pane @param {string} symbol @param {string} resolution @param {number} countBack */
  function scheduleCompareBarsFetch(pane, symbol, resolution, countBack) {
    if (!pane || !ctx.datafeed || !symbol || !resolution) return;
    if (isChartPanning()) {
      deferHeavyWork();
      return;
    }
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
    const anchorSec = paneAnchorSec(pane);
    // Sufficiency must be time-based too: a long-but-stale cache (tail ends
    // before the replay cursor) still needs a tail top-up, or SMT-style
    // compares freeze at the last covered pivot.
    const tailStale =
      anchorSec != null && htfCacheStaleForAnchor(symbol, resolution, anchorSec);
    if (hit && hit.utcBars.length >= want && !tailStale) return;

    compareFetchInFlight.add(key);
    const startEpoch = getDataEpoch();
    const beforeVersion = getHtfSeriesVersion(symbol, resolution);
    void ctx.datafeed
      .resolveSymbol(symbol)
      .then((symbolInfo) => {
        if (tailStale && htfStoreBarCount(symbol, resolution) > 0) {
          return extendHtfCacheForAnchor({
            ...htfEnsureOpts(pane, symbol, resolution, 16, symbolInfo),
            anchorSec,
            symbolInfo,
          });
        }
        return ensureSymbolBars({
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
          playbackAnchorSec: anchorSec,
        });
      })
      .then(() => {
        if (getDataEpoch() !== startEpoch) return;
        if (getHtfSeriesVersion(symbol, resolution) === beforeVersion) return;
        refreshPanesUsingCompareSymbol(symbol);
      })
      .finally(() => compareFetchInFlight.delete(key));
  }

  /** @param {object} pane @param {string} [symbol] @param {string} resId @param {number} countBack */
  function scheduleHtfBarsFetch(pane, symbol, resId, countBack) {
    const sym = symbol ?? pane?.symbol;
    if (!sym || !pane || !ctx.datafeed) return;
    if (isChartPanning()) {
      deferHeavyWork();
      return;
    }
    const anchorSec =
      typeof ctx.opts?.getPlaybackAnchorSec === "function"
        ? ctx.opts.getPlaybackAnchorSec(pane.resolution)
        : null;
    if (ctx.opts?.replayHostControlled && anchorSec != null) {
      const startEpoch = getDataEpoch();
      const confirmedOnly = confirmedOnlyFor(pane, resId);
      const stored = getHtfBars(sym, resId);
      if (
        stored?.utcBars?.length &&
        !htfCacheStaleForAnchor(sym, resId, anchorSec, { confirmedOnly })
      ) {
        return;
      }
      const key = `${sym}|${resId}`;
      if (htfFetchInFlight.has(key)) return;
      htfFetchInFlight.add(key);
      const beforeVersion = getHtfSeriesVersion(sym, resId);
      const symbolInfo = sym === pane.symbol ? pane.symbolInfo ?? ctx.symbolInfo : null;
      void Promise.resolve(symbolInfo ?? ctx.datafeed.resolveSymbol(sym))
        .then((info) => {
          if (!info) return null;
          const ensureOpts = htfEnsureOpts(pane, sym, resId, countBack, info);
          if (
            stored?.utcBars?.length &&
            htfCacheStaleForAnchor(sym, resId, anchorSec, { confirmedOnly })
          ) {
            return extendHtfCacheForAnchor({
              ...ensureOpts,
              anchorSec,
              symbolInfo: info,
            });
          }
          return ensureHtfBars(ensureOpts);
        })
        .then((entry) => {
          if (getDataEpoch() !== startEpoch) return;
          const afterVersion = entry?.version ?? getHtfSeriesVersion(sym, resId);
          if (afterVersion === beforeVersion) return;
          controller.invalidateOverlayCacheForPane(pane.index, {
            htfKeys: new Set([key]),
          });
          requestOverlayRefresh(pane.index);
        })
        .finally(() => htfFetchInFlight.delete(key));
      return;
    }
    const key = `${sym}|${resId}`;
    if (htfFetchInFlight.has(key)) return;
    htfFetchInFlight.add(key);
    const startEpoch = getDataEpoch();
    const beforeVersion = getHtfSeriesVersion(sym, resId);
    void ensureHtfBars(htfEnsureOpts(pane, sym, resId, countBack))
      .then((entry) => {
        if (getDataEpoch() !== startEpoch) return;
        const afterVersion = entry?.version ?? getHtfSeriesVersion(sym, resId);
        if (afterVersion === beforeVersion) return;
        controller.invalidateOverlayCacheForPane(pane.index, {
          htfKeys: new Set([key]),
        });
        requestOverlayRefresh(pane.index);
      })
      .finally(() => htfFetchInFlight.delete(key));
  }

  /** @param {object} pane — host replay: load HTF then paint overlay once (no short-series flash). */
  async function ensurePaneDataThenOverlay(pane) {
    if (!pane?.symbol) return;
    if (isChartPanning()) {
      deferHeavyWork();
      return;
    }
    await ensurePaneData(pane, { skipRefresh: true });
    requestOverlayRefresh(pane.index);
  }

  return {
    scheduleLoad,
    ensureNow: () => scheduleLoad(0),
    ensurePaneDataThenOverlay,
    extendHtfTailForReplay,
    scheduleCompareBarsFetch,
    scheduleHtfBarsFetch,
    newsContextForPane,
  };
}
