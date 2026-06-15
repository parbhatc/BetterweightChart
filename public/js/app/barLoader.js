import { FUTURE_RIGHT_OFFSET } from "../chart/chartView.js";

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
  } = opts;

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
    const sync = layoutManager?.getSync();
    const panes =
      sync?.symbol || sync?.interval ? getAllChartPanes() : [getActivePane()].filter(Boolean);
    return loadBarsForPanes(panes);
  }

  return { loadPaneBars, loadBarsForPanes, loadBars };
}
