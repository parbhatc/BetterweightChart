import { FUTURE_RIGHT_OFFSET } from "../../chart/view/index.js";
import { normalizeBar } from "../../datafeed/custom.js";
import {
  chartDebug,
  chartDebugCount,
  chartDebugTime,
  chartDebugTimeAsync,
} from "../../debug/chart/index.js";

/** Load more when the visible range is within this many bars of the left edge. */
const HISTORY_EDGE_BARS = 80;
/** Max burst loads per pan (TradingView-style prefetch). */
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
    historyChunk = countBack,
    getLayoutManager,
    loader,
    refreshPaneCandleData,
    applyLiveBarToPane,
    updateFormingBarOnPane,
    getBarSecForPane,
    setBarsLoading,
    refreshStatusLine,
    getActivePaneIndex,
    setHoverState,
    setPrimaryBars,
    onPaneBarUpdate,
    onHistoryPrepended,
  } = opts;

  /** @type {Map<number, string>} */
  const streamUidByPane = new Map();
  /** @type {Map<number, Promise<object | undefined>>} */
  const loadInFlightByPane = new Map();
  let barsLoadingCount = 0;
  /** @type {Promise<unknown> | null} */
  let loadBarsForPanesPromise = null;
  let overlayLoaderEnabled = true;

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
   * @param {object} pane
   * @param {object} rawBar
   */
  function applyIncomingBar(pane, rawBar) {
    if (!pane.bars.length) return;

    chartDebugCount("tick", "incoming");
    chartDebugTime("tick", `live tick pane ${pane.index}`, () => {
      const bar = normalizeBar(rawBar);
      const last = pane.bars[pane.bars.length - 1];
      const barSec = getBarSecForPane?.(pane) ?? 60;
      let isNewBar = false;

      if (bar.time === last.time) {
        pane.bars[pane.bars.length - 1] = bar;
      } else if (bar.time > last.time) {
        pane.bars.push(bar);
        isNewBar = true;
        chartDebugCount("tick", "newBar");
      } else if (bar.time > last.time - barSec) {
        pane.bars[pane.bars.length - 1] = { ...bar, time: last.time };
      } else {
        chartDebugCount("tick", "ignored");
        return;
      }

      const updated = pane.bars[pane.bars.length - 1];
      const patched = !isNewBar && updateFormingBarOnPane?.(pane, updated);
      if (!patched) {
        chartDebugCount("tick", "setData");
        applyLiveBarToPane(pane);
      } else {
        chartDebugCount("tick", "update");
      }

      if (pane.index === 0) setPrimaryBars(pane);
      onPaneBarUpdate?.(pane);

      if (pane.index === getActivePaneIndex()) {
        refreshStatusLine();
        if (isNewBar) scrollPaneToLatest(pane);
      }
    });
  }

  function subscribePane(pane) {
    if (typeof datafeed.subscribeBars !== "function" || !pane.symbolInfo) return;
    unsubscribePane(pane.index);
    const uid = `pane-${pane.index}`;
    streamUidByPane.set(pane.index, uid);
    datafeed.subscribeBars(
      pane.symbolInfo,
      pane.resolution,
      (bar) => applyIncomingBar(pane, bar),
      uid,
    );
  }

  function scrollPaneToLatest(pane) {
    if (!pane.bars.length) return;
    const ts = pane.chart.timeScale();
    const range = ts.getVisibleLogicalRange();
    if (!range) return;
    const width = range.to - range.from;
    const offset = ts.options().rightOffset ?? FUTURE_RIGHT_OFFSET;
    ts.setVisibleLogicalRange({
      from: pane.bars.length - width + offset * 0.35,
      to: pane.bars.length + offset,
    });
  }

  /**
   * @param {object} pane
   * @param {number} [chunk]
   */
  async function prependHistory(pane, chunk = historyChunk) {
    if (pane._loadingHistory || !pane.bars.length || !pane.symbolInfo) return false;
    if (pane._historyErrorUntil && Date.now() < pane._historyErrorUntil) return false;
    pane._loadingHistory = true;
    try {
      const first = pane.bars[0];
      const barSec = getBarSecForPane?.(pane) ?? 60;
      const requestTo = first.time - barSec;
      const result = await chartDebugTimeAsync("data", `prependHistory pane ${pane.index}`, () =>
        datafeed.getBars(pane.symbolInfo, pane.resolution, {
          to: requestTo,
          countBack: chunk,
        }),
      );
      if (!result.bars?.length || result.noData) {
        pane._historyExhausted = true;
        return false;
      }

      const older = result.bars.filter((b) => b.time < first.time);
      if (!older.length) {
        pane._historyExhausted = true;
        return false;
      }

      const ts = pane.chart.timeScale();
      const range = ts.getVisibleLogicalRange();
      const beforeLen = pane.bars.length;

      pane.bars = mergeBarsDeduped(older, pane.bars);

      const added = pane.bars.length - beforeLen;
      if (added <= 0) {
        pane._historyExhausted = true;
        return false;
      }

      if (result.noData || older.length < chunk * 0.2) {
        pane._historyExhausted = true;
      }

      chartDebug("data", "history prepended", { pane: pane.index, added, total: pane.bars.length });
      refreshPaneCandleData(pane);
      if (pane.index === 0) setPrimaryBars(pane);
      onHistoryPrepended?.(pane, added);

      if (range) {
        ts.setVisibleLogicalRange({ from: range.from + added, to: range.to + added });
      }
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
    const ts = pane.chart.timeScale();
    const range = ts.getVisibleLogicalRange();
    if (!range) return false;
    const barSec = getBarSecForPane?.(pane) ?? 60;
    if (range.from < HISTORY_EDGE_BARS) return true;
    return hasLeadingGap(pane.bars, barSec);
  }

  /** TradingView-style burst load when panning near the left edge or into a gap. */
  async function ensureHistoryNearEdge(pane) {
    if (!needsMoreHistory(pane)) return false;
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
    if (inFlight) return inFlight;

    const task = chartDebugTimeAsync("data", `loadPaneBars pane ${pane.index}`, async () => {
      if (!pane.symbolInfo) pane.symbolInfo = await datafeed.resolveSymbol(pane.symbol);
      const result = await datafeed.getBars(pane.symbolInfo, pane.resolution, { countBack });
      pane.bars = result.bars;
      pane.futureWhitespaceBars = null;
      pane.mapBars = null;
      pane.shiftedBars = null;
      pane._shiftedKey = null;
      pane._historyExhausted = Boolean(result.noData);
      pane._historyErrorUntil = null;
      chartDebug("data", "history loaded", { pane: pane.index, bars: pane.bars.length });
      refreshPaneCandleData(pane);
      subscribePane(pane);
      if (pane.index === 0) setPrimaryBars(pane);
      if (pane.index === getActivePaneIndex()) {
        setHoverState(undefined, undefined);
        if (pane.bars.length) scrollPaneToLatest(pane);
      }
      return pane.bars.at(-1);
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

  async function loadBarsForPanes(panes) {
    const targets = panes.filter(Boolean);
    if (!targets.length) return undefined;

    if (loadBarsForPanesPromise) {
      await loadBarsForPanesPromise;
      const pending = targets.filter((p) => !p.bars?.length);
      if (!pending.length) return pending.at(-1)?.bars?.at(-1);
      return loadBarsForPanes(pending);
    }

    const task = (async () => {
      setBarsLoadingState(true);
      refreshStatusLine();
      try {
        const run = async () => {
          chartDebug("data", "loadBarsForPanes start", {
            panes: targets.map((p) => p.index),
          });
          await Promise.all(
            targets.map((pane) =>
              loadPaneBars(pane).catch((err) => {
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
    pushLiveBar: applyIncomingBar,
    prependHistory,
    ensureHistoryNearEdge,
    needsMoreHistory,
    setOverlayLoaderEnabled,
  };
}
