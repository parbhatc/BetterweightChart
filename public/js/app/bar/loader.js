import { invalidatePaneChartView } from "../../chart/pane/viewCache.js";
import { captureVisibleViewport, restoreViewportAfterPrepend } from "../../chart/pane/viewport.js";
import { normalizeBar } from "../../datafeed/custom.js";
import {
  chartDebug,
  chartDebugCount,
  chartDebugTime,
  chartDebugTimeAsync,
} from "../../debug/chart/index.js";
import {
  alignBarTime,
  buildInitialPeriodParams,
  buildPrependPeriodParams,
  DEFAULT_HISTORY_CHUNK,
  estimateCountBackFromViewport,
  estimateHistoryCountBack,
} from "./periodParams.js";
import {
  barsCoverReplayAnchor,
  estimateReplayCountBack,
} from "../../replay/persist.js";
import {
  publishResolutionCache,
  seriesCacheKey,
  stashPaneResolutionCache,
  tryRestorePaneResolutionCache,
} from "./resolutionCache.js";

/** Load more when the visible range is within this many bars of the left edge. */
export const HISTORY_EDGE_BARS = 80;

/**
 * True when the user has panned near the oldest loaded bar (scroll-back prefetch).
 * Negative logical `from` is padding left of bar 0 — not a scroll-back signal.
 * @param {{ from: number, to: number } | null | undefined} range
 */
export function isNearHistoryLeftEdge(range) {
  if (!range) return false;
  if (range.from < 0) return false;
  return range.from < HISTORY_EDGE_BARS;
}
/** Max burst loads per pan when prefetching history. */
const HISTORY_BURST_MAX = 2;
/** Cooldown after a failed history request (ms). */
const HISTORY_ERROR_COOLDOWN_MS = 45_000;

/**
 * @param {{ time: number }[]} bars
 * @param {number} barSec
 */
function hasLeadingGap(bars, barSec) {
  if (bars.length < 2 || barSec <= 0) return false;
  const limit = Math.min(bars.length, 64);
  for (let i = 1; i < limit; i += 1) {
    if (bars[i].time - bars[i - 1].time > barSec * 1.5) return true;
  }
  return false;
}

/**
 * @param {{ time: number }[]} bars
 */
function mergeBarsDeduped(older, existing) {
  const merged = [...older, ...existing];
  const seen = new Set();
  return merged.filter((b) => {
    if (seen.has(b.time)) return false;
    seen.add(b.time);
    return true;
  });
}

/**
 * @param {object} opts
 */
export function createBarLoader(opts) {
  const {
    datafeed,
    countBack,
    historyChunk = DEFAULT_HISTORY_CHUNK,
    getLayoutManager,
    getAllChartPanes,
    loader,
    refreshPaneCandleData,
    applyLiveBarToPane,
    updateFormingBarOnPane,
    appendNewBarOnPane,
    upsertBarOnPane,
    getBarSecForPane,
    setBarsLoading,
    refreshStatusLine,
    getActivePaneIndex,
    setHoverState,
    setPrimaryBars,
    onPaneBarUpdate,
    onHistoryPrepended,
    onPaneHistoryDataUpdated,
    syncPaneEmptyState,
    finishPaneAfterLoad,
    isReplayLocked,
    isReplayHistoryBlocked,
    getReplayLoadCapTo,
    getReplayLoadContext,
  } = opts;

  /** @type {Map<number, string>} */
  const streamUidByPane = new Map();
  /** @type {Map<number, Promise<object | undefined>>} */
  const loadInFlightByPane = new Map();
  /** @type {Map<string, Promise<{ bars: object[], noData?: boolean }>>} */
  const seriesFetchInFlight = new Map();
  let barsLoadingCount = 0;
  /** @type {Promise<unknown> | null} */
  let loadBarsForPanesPromise = null;
  let overlayLoaderEnabled = true;

  /** @type {Map<number, ReturnType<typeof setTimeout>>} */
  const historyNotifyTimerByPane = new Map();

  /** Debounce indicator refresh when multiple history chunks land in one pan. */
  function notifyHistoryPrependedDebounced(pane) {
    const prev = historyNotifyTimerByPane.get(pane.index);
    if (prev != null) clearTimeout(prev);
    historyNotifyTimerByPane.set(
      pane.index,
      setTimeout(() => {
        historyNotifyTimerByPane.delete(pane.index);
        onHistoryPrepended?.(pane);
      }, 48),
    );
  }

  function setBarsLoadingState(active) {
    barsLoadingCount = Math.max(0, barsLoadingCount + (active ? 1 : -1));
    setBarsLoading(barsLoadingCount > 0);
  }

  function setOverlayLoaderEnabled(enabled) {
    overlayLoaderEnabled = Boolean(enabled);
  }

  function unsubscribePane(paneIndex) {
    const uid = streamUidByPane.get(paneIndex);
    if (uid && typeof datafeed.unsubscribeBars === "function") {
      datafeed.unsubscribeBars(uid);
    }
    streamUidByPane.delete(paneIndex);
  }

  /**
   * Upsert one live bar by `time` — update OHLC when the bar exists, append when it is new.
   * @param {object} pane
   * @param {import("../../datafeed/types.js").Bar} rawBar
   */
  function upsertLiveBar(pane, rawBar) {
    if (!pane.bars.length) return;
    if (typeof opts.isReplayLocked === "function" && opts.isReplayLocked()) return;

    chartDebugCount("tick", "incoming");
    pane._suppressHistoryPrefetch = true;
    chartDebugTime("tick", `live tick pane ${pane.index}`, () => {
      const bar = normalizeBar(rawBar);
      const last = pane.bars[pane.bars.length - 1];
      const idx = pane.bars.findIndex((b) => b.time === bar.time);
      let isNewBar = false;

      if (idx >= 0) {
        pane.bars[idx] = bar;
      } else if (bar.time > last.time) {
        const closed = last;
        pane.bars.push(bar);
        isNewBar = true;
        chartDebugCount("tick", "newBar");
        chartDebug("data", "closed candle", {
          pane: pane.index,
          resolution: pane.resolution,
          time: closed.time,
          open: closed.open,
          high: closed.high,
          low: closed.low,
          close: closed.close,
          ...(closed.volume != null ? { volume: closed.volume } : {}),
        });
        chartDebug("data", "new bar", {
          pane: pane.index,
          resolution: pane.resolution,
          time: bar.time,
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
          ...(bar.volume != null ? { volume: bar.volume } : {}),
        });
      } else {
        chartDebugCount("tick", "ignored");
        chartDebug("data", "live tick ignored (stale)", {
          pane: pane.index,
          barTime: bar.time,
          lastTime: last.time,
        });
        return;
      }

      const result = isNewBar
        ? { ok: Boolean(appendNewBarOnPane?.(pane, bar)), isNewBar: true }
        : { ok: Boolean(updateFormingBarOnPane?.(pane, bar)), isNewBar: false };

      if (!result.ok) {
        invalidatePaneChartView(pane);
        applyLiveBarToPane(pane);
        chartDebugCount("tick", "setData");
      } else if (isNewBar) {
        chartDebugCount("tick", result.isNewBar ? "append" : "update");
        pane.sessionBg?.requestRefresh();
        publishResolutionCache(pane);
      } else {
        chartDebugCount("tick", "update");
      }

      if (pane.index === 0) setPrimaryBars(pane);
      onPaneBarUpdate?.(pane, { isNewBar: result.isNewBar });

      if (pane.index === getActivePaneIndex()) {
        refreshStatusLine();
      }
    });
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        pane._suppressHistoryPrefetch = false;
      });
    });
  }

  /** @deprecated use upsertLiveBar */
  function applyIncomingBar(pane, rawBar) {
    upsertLiveBar(pane, rawBar);
  }

  function subscribePane(pane) {
    if (typeof datafeed.subscribeBars !== "function" || !pane.symbolInfo) return;
    unsubscribePane(pane.index);
    const uid = `pane-${pane.index}`;
    streamUidByPane.set(pane.index, uid);
    datafeed.subscribeBars(
      pane.symbolInfo,
      pane.resolution,
      (bar) => upsertLiveBar(pane, bar),
      uid,
    );
  }

  /**
   * @param {object} pane
   * @param {object[]} olderBars
   * @param {{ adjustViewport?: boolean, reason?: string }} [opts]
   */
  function mergeOlderBarsIntoPane(pane, olderBars, opts = {}) {
    if (!pane.bars.length || !olderBars.length) return 0;
    const firstTime = pane.bars[0].time;
    const relevant = olderBars.filter((b) => b.time < firstTime);
    if (!relevant.length) return 0;

    const beforeLen = pane.bars.length;
    pane.bars = mergeBarsDeduped(relevant, pane.bars);
    const added = pane.bars.length - beforeLen;
    if (added <= 0) return 0;

    const captured = captureVisibleViewport(pane.chart);
    /** @type {{ from: number, to: number } | null} */
    let capturedLogical = null;
    try {
      capturedLogical = pane.chart.timeScale().getVisibleLogicalRange();
    } catch {
      /* chart not ready */
    }

    pane._historyRestorePending = true;
    invalidatePaneChartView(pane);
    pane._historyExhausted = false;
    refreshPaneCandleData(pane, { deferSessionBg: true });
    restoreViewportAfterPrepend(pane.chart, captured, capturedLogical, added);
    onPaneHistoryDataUpdated?.(pane);
    if (pane.index === 0) setPrimaryBars(pane);
    publishResolutionCache(pane);

    const finishPrepend = () => {
      pane._historyRestorePending = false;
      pane.sessionBg?.requestRefresh();
      onPaneHistoryDataUpdated?.(pane);
      notifyHistoryPrependedDebounced(pane);
    };

    requestAnimationFrame(() => {
      restoreViewportAfterPrepend(pane.chart, captured, capturedLogical, added);
      requestAnimationFrame(() => {
        restoreViewportAfterPrepend(pane.chart, captured, capturedLogical, added);
        finishPrepend();
      });
    });
    chartDebug("data", opts.reason ?? "history merged", {
      pane: pane.index,
      added,
      total: pane.bars.length,
    });
    return added;
  }

  function getSeriesPeerPanes(pane) {
    return (getAllChartPanes?.() ?? []).filter(
      (p) =>
        p !== pane &&
        p.symbol === pane.symbol &&
        p.resolution === pane.resolution &&
        p.bars?.length,
    );
  }

  async function ensurePaneSymbolInfo(pane) {
    if (!pane.symbolInfo && pane.symbol) {
      pane.symbolInfo = await datafeed.resolveSymbol(pane.symbol);
    }
  }

  function trySyncHistoryFromPeer(pane) {
    const peers = getSeriesPeerPanes(pane).filter((p) => p.bars.length > pane.bars.length);
    if (!peers.length) return false;
    const peer = peers.reduce((best, p) => (p.bars.length > best.bars.length ? p : best));
    return mergeOlderBarsIntoPane(pane, peer.bars, { reason: "history synced from peer" }) > 0;
  }

  function syncPrependedBarsToPeers(sourcePane, olderBars) {
    for (const peer of getSeriesPeerPanes(sourcePane)) {
      if (peer.bars.length >= sourcePane.bars.length) continue;
      mergeOlderBarsIntoPane(peer, olderBars, { reason: "history synced from peer prepend" });
    }
  }

  /**
   * @param {object} pane
   * @param {number} [chunk]
   */
  async function prependHistory(pane, chunk = historyChunk) {
    if (pane._loadingHistory || !pane.bars.length) return false;
    if (pane._historyErrorUntil && Date.now() < pane._historyErrorUntil) return false;
    await ensurePaneSymbolInfo(pane);
    if (!pane.symbolInfo) return false;
    if (trySyncHistoryFromPeer(pane)) return true;

    pane._loadingHistory = true;
    try {
      const first = pane.bars[0];
      const barSec = getBarSecForPane?.(pane) ?? 60;
      const requestCountBack = estimateHistoryCountBack(pane.chart, chunk, HISTORY_EDGE_BARS);
      const periodParams = buildPrependPeriodParams(first.time, barSec, requestCountBack);
      chartDebug("data", "prependHistory request", {
        pane: pane.index,
        countBack: requestCountBack,
        maxChunk: chunk,
        ...periodParams,
      });
      const result = await chartDebugTimeAsync("data", `prependHistory pane ${pane.index}`, () =>
        datafeed.getBars(pane.symbolInfo, pane.resolution, periodParams),
      );
      if (!result.bars?.length || result.noData) {
        chartDebug("data", "prependHistory noData — history exhausted", {
          pane: pane.index,
          noData: Boolean(result.noData),
          meta: result.meta,
        });
        pane._historyExhausted = true;
        return false;
      }

      const older = result.bars.filter((b) => b.time < first.time);
      if (!older.length) {
        pane._historyExhausted = true;
        return false;
      }

      const added = mergeOlderBarsIntoPane(pane, older, { reason: "history prepended", adjustViewport: true });
      if (added <= 0) {
        pane._historyExhausted = true;
        return false;
      }
      syncPrependedBarsToPeers(pane, older);
      return true;
    } catch (err) {
      chartDebug("data", "prependHistory failed", { pane: pane.index, err: String(err) });
      pane._historyErrorUntil = Date.now() + HISTORY_ERROR_COOLDOWN_MS;
      return false;
    } finally {
      pane._loadingHistory = false;
    }
  }

  function needsMoreHistory(pane) {
    if (pane._historyExhausted || pane._loadingHistory || !pane.bars.length) return false;
    if (pane._historyErrorUntil && Date.now() < pane._historyErrorUntil) return false;
    if (pane._suppressHistoryPrefetch) return false;
    const ts = pane.chart.timeScale();
    const range = ts.getVisibleLogicalRange();
    if (!range) return false;
    const barSec = getBarSecForPane?.(pane) ?? 60;
    if (isNearHistoryLeftEdge(range)) return true;
    return hasLeadingGap(pane.bars, barSec);
  }

  async function finishPaneAfterBarsLoaded(pane, loadOpts = {}) {
    await ensurePaneSymbolInfo(pane);
    if (!loadOpts.deferChartRefresh) {
      refreshPaneCandleData(pane, loadOpts);
    } else {
      chartDebug("data", "defer chart refresh", { pane: pane.index, bars: pane.bars.length });
    }
    subscribePane(pane);
    publishResolutionCache(pane);
    if (pane.index === 0) setPrimaryBars(pane);
    if (pane.index === getActivePaneIndex()) {
      setHoverState(undefined, undefined);
    }
    if (pane.bars.length) {
      finishPaneAfterLoad?.(pane, loadOpts);
    }
    return pane.bars.at(-1);
  }

  /**
   * @param {object} pane
   * @param {object} periodParams
   */
  function fetchInflightKey(pane, periodParams) {
    const base = seriesCacheKey(pane.symbol, pane.resolution);
    const to = periodParams.to ?? "";
    const from = periodParams.from ?? "";
    const cb = periodParams.countBack ?? "";
    return `${base}|f:${from}|t:${to}|c:${cb}`;
  }

  /**
   * @param {object} pane
   * @param {object} symbolInfo
   * @param {object} periodParams
   */
  function fetchBarsShared(pane, symbolInfo, periodParams) {
    const key = fetchInflightKey(pane, periodParams);
    let pending = seriesFetchInFlight.get(key);
    if (!pending) {
      pending = datafeed.getBars(symbolInfo, pane.resolution, periodParams).finally(() => {
        if (seriesFetchInFlight.get(key) === pending) {
          seriesFetchInFlight.delete(key);
        }
      });
      seriesFetchInFlight.set(key, pending);
    } else {
      chartDebug("data", "getBars shared in-flight", {
        pane: pane.index,
        symbol: pane.symbol,
        resolution: pane.resolution,
      });
    }
    return pending;
  }

  function clearPaneBarState(pane) {
    pane._historyExhausted = false;
    pane._firstDataRequest = true;
    pane._emptyStateMeta = null;
    pane.bars = [];
    pane.futureWhitespaceBars = null;
    invalidatePaneChartView(pane);
    syncPaneEmptyState?.(pane, { show: false });
  }

  /** Burst load when panning near the left edge or into a gap. */
  async function ensureHistoryNearEdge(pane) {
    if (typeof isReplayHistoryBlocked === "function" && isReplayHistoryBlocked()) return false;
    if (!needsMoreHistory(pane)) return false;
    chartDebug("data", "history edge prefetch", {
      pane: pane.index,
      from: pane.chart.timeScale().getVisibleLogicalRange()?.from,
      bars: pane.bars.length,
    });
    let loaded = false;
    let bursts = 0;
    while (needsMoreHistory(pane) && bursts < HISTORY_BURST_MAX) {
      const got = await prependHistory(pane);
      if (!got) break;
      loaded = true;
      bursts += 1;
    }
    return loaded;
  }

  async function loadPaneBars(pane, opts = {}) {
    if (!opts.force && pane.bars?.length) {
      return pane.bars.at(-1);
    }
    const inFlight = loadInFlightByPane.get(pane.index);
    if (inFlight && !opts.force) return inFlight;
    if (inFlight && opts.force) {
      await inFlight.catch(() => {});
    }

    const task = chartDebugTimeAsync("data", `loadPaneBars pane ${pane.index}`, async () => {
      const replayCtx =
        typeof getReplayLoadContext === "function" ? getReplayLoadContext(pane) : null;
      const replayCapTo =
        replayCtx?.capDisplay ??
        (typeof getReplayLoadCapTo === "function" ? getReplayLoadCapTo(pane) : null);

      /** @param {object} loadOpts */
      function applyReplayCapAfterLoad(loadOpts) {
        if (replayCapTo != null && Number.isFinite(replayCapTo)) {
          pane.bars = pane.bars.filter((b) => b.time <= replayCapTo);
          invalidatePaneChartView(pane);
          refreshPaneCandleData(pane, loadOpts);
        }
      }

      /** @param {object} loadOpts */
      async function tryReplayCacheLoad(loadOpts) {
        if (replayCtx) return null;
        if (!tryRestorePaneResolutionCache(pane)) return null;
        chartDebug("data", "loadPaneBars restored from cache", {
          pane: pane.index,
          symbol: pane.symbol,
          resolution: pane.resolution,
          bars: pane.bars.length,
        });
        applyReplayCapAfterLoad(loadOpts);
        return finishPaneAfterBarsLoaded(pane, loadOpts);
      }

      if (opts.force) {
        unsubscribePane(pane.index);
        pane._historyErrorUntil = null;
        const loadOpts = {
          scrollToLatest: false,
          deferChartRefresh: Boolean(opts.deferChartRefresh),
          skipPriceScaleMargins: Boolean(opts.skipPriceScaleMargins),
        };
        const restored = await tryReplayCacheLoad(loadOpts);
        if (restored) return restored;
        clearPaneBarState(pane);
      } else if (!pane.bars?.length) {
        const restored = await tryReplayCacheLoad({ scrollToLatest: false });
        if (restored) return restored;
      }

      if (!pane.symbolInfo) pane.symbolInfo = await datafeed.resolveSymbol(pane.symbol);
      const barSec = getBarSecForPane?.(pane) ?? 60;
      let requestCountBack = estimateCountBackFromViewport(pane, countBack);
      let loadTo = replayCapTo ?? undefined;
      if (replayCtx) {
        const end =
          replayCtx.loadTo ??
          alignBarTime(Date.now() / 1000, barSec);
        loadTo = end;
        requestCountBack = Math.min(
          2000,
          estimateReplayCountBack(replayCtx.anchorFrom, end, barSec, requestCountBack),
        );
      }
      const useInitialLoad = Boolean(replayCtx || !pane.bars?.length || pane._firstDataRequest !== false);
      const periodParams = useInitialLoad
        ? buildInitialPeriodParams(barSec, requestCountBack, loadTo)
        : buildPrependPeriodParams(
            pane.bars[0].time,
            barSec,
            estimateHistoryCountBack(pane.chart, historyChunk, HISTORY_EDGE_BARS),
          );
      chartDebug("data", "loadPaneBars getBars", {
        pane: pane.index,
        firstDataRequest: periodParams.firstDataRequest,
        countBack: periodParams.countBack,
        fallback: countBack,
        replay: replayCtx
          ? { anchorFrom: replayCtx.anchorFrom, loadTo, capDisplay: replayCapTo ?? null }
          : null,
        ...periodParams,
      });
      const wasFirstRequest = useInitialLoad;
      const loadOpts = {
        scrollToLatest: !opts.force && wasFirstRequest,
        deferChartRefresh: Boolean(opts.deferChartRefresh),
        skipPriceScaleMargins: Boolean(opts.skipPriceScaleMargins),
      };
      const result = await fetchBarsShared(pane, pane.symbolInfo, periodParams);
      pane._firstDataRequest = false;
      let bars = result.bars.slice();
      if (replayCapTo != null && Number.isFinite(replayCapTo)) {
        const marketEnd = bars.at(-1)?.time;
        if (marketEnd != null) pane._replayMarketEndUtc = marketEnd;
        bars = bars.filter((b) => b.time <= replayCapTo);
      }
      pane.bars = bars;
      pane.futureWhitespaceBars = null;
      invalidatePaneChartView(pane);
      pane._historyExhausted = Boolean(result.noData);
      pane._historyErrorUntil = null;
      if (wasFirstRequest && !pane.bars.length && result.noData) {
        pane._emptyStateMeta = result.meta ?? null;
        syncPaneEmptyState?.(pane, { show: true, meta: pane._emptyStateMeta });
      } else if (pane.bars.length) {
        pane._emptyStateMeta = null;
        syncPaneEmptyState?.(pane, { show: false });
      }
      chartDebug("data", "history loaded", { pane: pane.index, bars: pane.bars.length });
      return await finishPaneAfterBarsLoaded(pane, loadOpts);
    });

    loadInFlightByPane.set(pane.index, task);
    try {
      return await task;
    } finally {
      if (loadInFlightByPane.get(pane.index) === task) {
        loadInFlightByPane.delete(pane.index);
      }
    }
  }

  async function loadBarsForPanes(panes, opts = {}) {
    const targets = panes.filter(Boolean);
    if (!targets.length) return undefined;

    if (loadBarsForPanesPromise) {
      await loadBarsForPanesPromise;
      const pending = opts.force ? targets : targets.filter((p) => !p.bars?.length);
      if (!pending.length) return targets.at(-1)?.bars?.at(-1);
      return loadBarsForPanes(pending, opts);
    }

    const task = (async () => {
      setBarsLoadingState(true);
      refreshStatusLine();
      try {
        const run = async () => {
          chartDebug("data", "loadBarsForPanes start", {
            panes: targets.map((p) => p.index),
            force: Boolean(opts.force),
          });
          await Promise.all(
            targets.map((pane) =>
              loadPaneBars(pane, opts).catch((err) => {
                chartDebug("data", "loadPaneBars failed", { pane: pane.index, err: String(err) });
                return undefined;
              }),
            ),
          );
          chartDebug("data", "loadBarsForPanes done", {
            panes: targets.map((p) => p.index),
          });
          return targets.at(-1)?.bars?.at(-1);
        };
        if (overlayLoaderEnabled) return await loader.wrap(run);
        return await run();
      } finally {
        setBarsLoadingState(false);
        refreshStatusLine();
      }
    })();

    loadBarsForPanesPromise = task;
    try {
      return await task;
    } finally {
      if (loadBarsForPanesPromise === task) loadBarsForPanesPromise = null;
    }
  }

  async function loadBars(getAllChartPanes, getActivePane) {
    const layoutManager = getLayoutManager();
    const panes = getAllChartPanes();
    const sync = layoutManager?.getSync();
    const loadAll = sync?.symbol || sync?.interval || panes.length > 1;
    return loadBarsForPanes(loadAll ? panes : [getActivePane()].filter(Boolean));
  }

  return {
    loadPaneBars,
    loadBarsForPanes,
    loadBars,
    upsertLiveBar,
    /** @deprecated use upsertLiveBar */
    pushLiveBar: upsertLiveBar,
    prependHistory,
    ensureHistoryNearEdge,
    needsMoreHistory,
    setOverlayLoaderEnabled,
    stashPaneResolutionCache,
  };
}
