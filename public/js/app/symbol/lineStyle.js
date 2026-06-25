import { isBarUp } from "../../chart/bar/style.js";
import { barsForPane } from "../../chart/pane/data.js";

/** @param {object} sc @param {object} sym @param {object} [bar] @param {object} [prevBar] */
export function resolveSymbolLineColor(sc, sym, bar, prevBar) {
  const up = sc.symbolLabelLineUpColor ?? sym.bodyUpColor ?? "#089981";
  const down = sc.symbolLabelLineDownColor ?? sym.bodyDownColor ?? "#f23645";
  if (!bar) return up;
  return isBarUp(bar, prevBar, sym.colorBarsOnPrevClose) ? up : down;
}

/**
 * Bar used for custom price-line color — always the forming candle, not crosshair hover.
 * @param {object} pane
 * @param {ReturnType<import("../../ui/chart/settings.js").createChartSettings>} settingsStore
 * @param {object | null} symbolInfo
 */
export function priceLineBarForPane(pane, settingsStore, symbolInfo) {
  const visible = barsForPane(pane, settingsStore, symbolInfo);
  const bar = visible.at(-1);
  const prevBar = visible.length > 1 ? visible.at(-2) : undefined;
  return { bar, prevBar, close: bar?.close ?? null };
}

/**
 * @param {object} pane
 * @param {ReturnType<import("../../ui/chart/settings.js").createChartSettings>} settingsStore
 * @param {object | null} symbolInfo
 */
export function resolvePriceLineColorForPane(pane, settingsStore, symbolInfo) {
  const sc = settingsStore.get().scales ?? {};
  const sym = settingsStore.get().symbol ?? {};
  const { bar, prevBar } = priceLineBarForPane(pane, settingsStore, symbolInfo);
  return resolveSymbolLineColor(sc, sym, bar, prevBar);
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
      const { bar, prevBar } = priceLineBarForPane(pane, settingsStore, symbolInfo);
      const lineStyle = Number(sc.symbolLabelLineStyle ?? 2);
      const options = {
        lastValueVisible: false,
        priceLineVisible: false,
        priceLineColor: resolveSymbolLineColor(sc, sym, bar, prevBar),
        priceLineWidth: Number(sc.symbolLabelLineWidth) || 1,
        priceLineStyle: lineStyle,
        title: "",
      };
      const key = `${options.priceLineColor}|${options.priceLineWidth}|${lineStyle}`;
      if (paneStyleKeys.get(pane.index) === key) continue;
      paneStyleKeys.set(pane.index, key);
      pane.series.applyOptions(options);
      pane.priceLineLabel?.requestRefresh?.();
    }
  } finally {
    applyingSymbolLineStyle = false;
  }
}

/** Clear cached keys when settings change materially (e.g. symbol switch). */
export function resetSymbolLineStyleCache() {
  paneStyleKeys.clear();
}
