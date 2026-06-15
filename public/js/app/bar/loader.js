import { FUTURE_RIGHT_OFFSET } from "../../chart/view/index.js";
import { normalizeBar } from "../../datafeed/custom.js";
import {
  chartDebug,
  chartDebugCount,
  chartDebugTime,
  chartDebugTimeAsync,
} from "../../debug/chart/index.js";
/**
 * @param {object} opts
 */
export function createBarLoader(opts) {
  const {
    datafeed,
    countBack,
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
  } = opts;

  /** @type {Map<number, string>} */
  const streamUidByPane = new Map();

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

  async function prependHistory(pane) {
    if (pane._loadingHistory || !pane.bars.length || !pane.symbolInfo) return false;
    pane._loadingHistory = true;
    try {
      const first = pane.bars[0];
      const barSec = getBarSecForPane?.(pane) ?? 60;
      const result = await chartDebugTimeAsync("data", `prependHistory pane ${pane.index}`, () =>
        datafeed.getBars(pane.symbolInfo, pane.resolution, {
          to: first.time - barSec,
          countBack,
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

      const merged = [...older, ...pane.bars];
      const seen = new Set();
      pane.bars = merged.filter((b) => {
        if (seen.has(b.time)) return false;
        seen.add(b.time);
        return true;
      });

      const added = pane.bars.length - beforeLen;
      if (added <= 0) return false;

      chartDebug("data", "history prepended", { pane: pane.index, added, total: pane.bars.length });
      refreshPaneCandleData(pane);
      if (pane.index === 0) setPrimaryBars(pane);

      if (range) {
        ts.setVisibleLogicalRange({ from: range.from + added, to: range.to + added });
      }
      return true;
    } finally {
      pane._loadingHistory = false;
    }
  }

  async function loadPaneBars(pane) {
    return chartDebugTimeAsync("data", `loadPaneBars pane ${pane.index}`, async () => {
      if (!pane.symbolInfo) pane.symbolInfo = await datafeed.resolveSymbol(pane.symbol);
      const result = await datafeed.getBars(pane.symbolInfo, pane.resolution, { countBack });
      pane.bars = result.bars;
      pane.futureWhitespaceBars = null;
      pane._historyExhausted = false;
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
  }

  async function loadBarsForPanes(panes) {
    setBarsLoading(true);
    refreshStatusLine();
    try {
      return await loader.wrap(async () => {
        let last;
        for (const pane of panes) {
          last = await loadPaneBars(pane);
        }
        return last;
      });
    } finally {
      setBarsLoading(false);
      refreshStatusLine();
    }
  }

  async function loadBars(getAllChartPanes, getActivePane) {
    const layoutManager = getLayoutManager();
    const panes = getAllChartPanes();
    const sync = layoutManager?.getSync();
    const loadAll =
      sync?.symbol || sync?.interval || panes.length > 1;
    return loadBarsForPanes(loadAll ? panes : [getActivePane()].filter(Boolean));
  }

  return { loadPaneBars, loadBarsForPanes, loadBars, pushLiveBar: applyIncomingBar, prependHistory };
}
