import { isBarUp } from "../../chart/bar/style.js";
import { barsForPane } from "../../chart/pane/data.js";

/** @param {object} sc @param {object} sym @param {object} [bar] @param {object} [prevBar] */
export function resolveSymbolLineColor(sc, sym, bar, prevBar) {
  const up = sc.symbolLabelLineUpColor ?? sym.bodyUpColor ?? "#089981";
  const down = sc.symbolLabelLineDownColor ?? sym.bodyDownColor ?? "#f23645";
  if (!bar) return up;
  return isBarUp(bar, prevBar, sym.colorBarsOnPrevClose) ? up : down;
}

/** @type {Map<number, string>} */
const paneStyleKeys = new Map();
let applyingSymbolLineStyle = false;

/**
 * @param {object} opts
 * @param {ReturnType<import("../../ui/chart/settings.js").createChartSettings>} opts.settingsStore
 * @param {() => object[]} opts.getAllChartPanes
 * @param {object | null} opts.symbolInfo
 */
export function applySymbolLineStyle(opts) {
  if (applyingSymbolLineStyle) return;
  applyingSymbolLineStyle = true;
  try {
    const { settingsStore, getAllChartPanes, symbolInfo } = opts;
    const sc = settingsStore.get().scales ?? {};
    const sym = settingsStore.get().symbol ?? {};
    for (const pane of getAllChartPanes()) {
      const visible = barsForPane(pane, settingsStore, symbolInfo);
      const bar = pane.hoverBar ?? visible.at(-1);
      const prevBar = pane.hoverBar != null ? pane.hoverPrev : visible.length > 1 ? visible.at(-2) : undefined;
      const options = {
        lastValueVisible: Boolean(sc.symbolLabelValue),
        priceLineVisible: Boolean(sc.symbolLabelLine),
        priceLineColor: resolveSymbolLineColor(sc, sym, bar, prevBar),
        priceLineWidth: Number(sc.symbolLabelLineWidth) || 1,
        title: sc.symbolLabelName ? pane.symbol : "",
      };
      const key = `${options.lastValueVisible}|${options.priceLineVisible}|${options.priceLineColor}|${options.priceLineWidth}|${options.title}`;
      if (paneStyleKeys.get(pane.index) === key) continue;
      paneStyleKeys.set(pane.index, key);
      pane.series.applyOptions(options);
    }
  } finally {
    applyingSymbolLineStyle = false;
  }
}

/** Clear cached keys when settings change materially (e.g. symbol switch). */
export function resetSymbolLineStyleCache() {
  paneStyleKeys.clear();
}
