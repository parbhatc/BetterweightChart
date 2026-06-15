import { FUTURE_RIGHT_OFFSET } from "../../chart/view/index.js";

import { buildCandleSeriesData } from "../../chart/bar/data.js";

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
    setBarsLoading,
    refreshStatusLine,
    getActivePaneIndex,
    setHoverState,
    setPrimaryBars,
    settingsStore,
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

  function subscribePane(pane) {
    if (typeof datafeed.subscribeBars !== "function" || !pane.symbolInfo) return;
    unsubscribePane(pane.index);
    const uid = `pane-${pane.index}`;
    streamUidByPane.set(pane.index, uid);
    datafeed.subscribeBars(
      pane.symbolInfo,
      pane.resolution,
      (bar) => {
        if (!pane.bars.length) return;
        const last = pane.bars[pane.bars.length - 1];
        if (bar.time === last.time) {
          pane.bars[pane.bars.length - 1] = bar;
        } else if (bar.time > last.time) {
          pane.bars.push(bar);
        } else {
          return;
        }
        const sym = settingsStore?.get?.().symbol ?? {};
        pane.series.update(buildCandleSeriesData([bar], sym)[0]);
        if (pane.index === 0) setPrimaryBars(pane);
        if (pane.index === getActivePaneIndex()) refreshStatusLine();
      },
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

  async function loadPaneBars(pane) {
    if (!pane.symbolInfo) pane.symbolInfo = await datafeed.resolveSymbol(pane.symbol);
    const result = await datafeed.getBars(pane.symbolInfo, pane.resolution, { countBack });
    pane.bars = result.bars;
    pane.futureWhitespaceBars = null;
    refreshPaneCandleData(pane);
    subscribePane(pane);
    if (pane.index === 0) setPrimaryBars(pane);
    if (pane.index === getActivePaneIndex()) {
      setHoverState(undefined, undefined);
      if (pane.bars.length) scrollPaneToLatest(pane);
    }
    return pane.bars.at(-1);
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

  return { loadPaneBars, loadBarsForPanes, loadBars };
}
