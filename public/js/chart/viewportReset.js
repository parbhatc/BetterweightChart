import { FUTURE_RIGHT_OFFSET } from "./view/index.js";
import {
  applyPriceScaleMarginsAfterBarLoad,
  refitPriceScaleToVisibleBars,
  scaleMarginsFromSettings,
} from "./settings/applier.js";

/** Default bar spacing from createTvChart — used when resetting the time scale. */
export const DEFAULT_RESET_BAR_SPACING = 8;
const DEFAULT_VISIBLE_BARS = 96;

/**
 * @param {ReturnType<import("../ui/chart/settings.js").createChartSettings>} settingsStore
 */
export function rightOffsetFromSettings(settingsStore) {
  const marginRight = Number(settingsStore.get().canvas?.marginRight);
  return Number.isFinite(marginRight) ? marginRight : FUTURE_RIGHT_OFFSET;
}

/**
 * Scroll so the latest bar sits left of the future margin (settings `marginRight` / rightOffset).
 * @param {object} pane
 * @param {ReturnType<import("../ui/chart/settings.js").createChartSettings>} settingsStore
 * @param {{ width?: number }} [opts]
 */
export function scrollPaneToLatest(pane, settingsStore, opts = {}) {
  const count = pane.bars?.length ?? 0;
  if (!count || !pane.chart) return;

  const ts = pane.chart.timeScale();
  const range = ts.getVisibleLogicalRange();
  const offset = rightOffsetFromSettings(settingsStore);
  const width = opts.width ?? (range ? range.to - range.from : DEFAULT_VISIBLE_BARS);
  const lastIdx = count - 1;

  pane._suppressHistoryPrefetch = true;
  pane.chart.applyOptions({ timeScale: { rightOffset: offset } });
  ts.setVisibleLogicalRange({
    from: lastIdx - width + offset * 0.35,
    to: lastIdx + offset,
  });
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      pane._suppressHistoryPrefetch = false;
    });
  });
}

/**
 * Reset price + time viewport to defaults (margins from settings, latest bar in view).
 * @param {object} pane
 * @param {ReturnType<import("../ui/chart/settings.js").createChartSettings>} settingsStore
 * @param {() => "left" | "right"} activePriceScaleId
 */
export function resetPaneChartViewport(pane, settingsStore, activePriceScaleId) {
  if (!pane?.chart || !pane?.series) return;

  pane._manualScaleLocked = false;
  const offset = rightOffsetFromSettings(settingsStore);
  const margins = scaleMarginsFromSettings(settingsStore);
  const scaleId = activePriceScaleId();

  pane.chart.applyOptions({
    timeScale: {
      rightOffset: offset,
      barSpacing: DEFAULT_RESET_BAR_SPACING,
    },
  });

  pane.series.priceScale().applyOptions({ autoScale: true, scaleMargins: margins });
  try {
    pane.chart.priceScale(scaleId).applyOptions({ autoScale: true, scaleMargins: margins });
  } catch {
    /* ignore */
  }

  applyPriceScaleMarginsAfterBarLoad(pane, settingsStore, activePriceScaleId);
  scrollPaneToLatest(pane, settingsStore);
}

/**
 * Reset price scale margins + fit to visible bars (price-axis double-click).
 * LWC only toggles autoScale; restore settings margins and refit like reset chart.
 * @param {object} pane
 * @param {ReturnType<import("../ui/chart/settings.js").createChartSettings>} settingsStore
 * @param {() => "left" | "right"} activePriceScaleId
 */
export function resetPanePriceScale(pane, settingsStore, activePriceScaleId) {
  if (!pane?.chart || !pane?.series || !pane.bars?.length) return;

  pane._manualScaleLocked = false;
  const sc = settingsStore.get().scales ?? {};
  const margins = scaleMarginsFromSettings(settingsStore);
  const scaleId = activePriceScaleId();

  const clearProvider = () => {
    pane.series.priceScale().applyOptions({ autoscaleInfoProvider: undefined });
    try {
      pane.chart.priceScale(scaleId).applyOptions({ autoscaleInfoProvider: undefined });
    } catch {
      /* ignore */
    }
  };

  clearProvider();

  if (sc.autoScale) {
    pane.series.priceScale().applyOptions({ autoScale: true, scaleMargins: margins });
    try {
      pane.chart.priceScale(scaleId).applyOptions({ autoScale: true, scaleMargins: margins });
    } catch {
      /* ignore */
    }
    return;
  }

  refitPriceScaleToVisibleBars(pane, settingsStore, activePriceScaleId, { margins });
}

/**
 * Reset time scale only — bar spacing + right margin from settings, scroll to latest.
 * @param {object} pane
 * @param {ReturnType<import("../ui/chart/settings.js").createChartSettings>} settingsStore
 */
export function resetPaneTimeViewport(pane, settingsStore) {
  if (!pane?.chart) return;

  const offset = rightOffsetFromSettings(settingsStore);
  pane.chart.timeScale().resetTimeScale();
  pane.chart.applyOptions({ timeScale: { rightOffset: offset } });
  scrollPaneToLatest(pane, settingsStore);
}
