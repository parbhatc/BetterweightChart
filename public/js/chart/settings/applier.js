import { CrosshairMode, LineStyle, TickMarkType } from "lightweight-charts";
import { FUTURE_RIGHT_OFFSET } from "../view/index.js";
import { gridAxisVisible, resolveLayoutBackground } from "../canvas/settings.js";
import {
  priceScaleModeFromSettings,
  resolvePriceScaleModeKey,
  resolvePriceScalePlacement,
} from "../scale/settings.js";
import { invalidateChartTimeCache } from "../timezone/chartTime.js";
import { createTimezoneProvider, invalidateTimezoneProviderCache, toDisplayTime } from "../timezone/provider.js";
import { priceFormatFromPrecisionSetting, precisionFromSettings, resolveTimezone } from "../timezone/list.js";
import { formatDisplayPrice } from "../format.js";
import {
  formatAxisDateTick,
  formatAxisMonthTick,
  formatAxisTimeTick,
  formatChartTimeLabel,
} from "../time/labelFormat.js";
import { toDate } from "../format.js";
import { applyColorOpacity } from "../../ui/color/picker.js";
import { enforcePriceBarRatio, measurePriceBarRatio } from "../price/barRatio.js";
import { resolutionSec } from "../resolutions.js";

/** Label formatters treat display-shifted timestamps as UTC wall clock. */
const CHART_TIME_LABEL_TZ = "Etc/UTC";

/** @param {object} sc @param {object} cv @param {string} activeScale */
function priceScaleSettingsKey(sc, cv, activeScale) {
  return [
    sc.autoScale,
    sc.lockPriceToBarRatio,
    sc.invertScale,
    resolvePriceScaleModeKey(sc),
    cv.marginTop,
    cv.marginBottom,
    activeScale,
  ].join("\0");
}

/**
 * Apply chart + series options from the settings store to one pane.
 * @param {object} opts
 * @param {import("lightweight-charts").IChartApi} opts.targetChart
 * @param {import("lightweight-charts").ISeriesApi} opts.targetSeries
 * @param {object} opts.pane
 * @param {ReturnType<import("../../ui/chart/settings.js").createChartSettings>} opts.settingsStore
 * @param {object} opts.themeColors
 * @param {object | null} opts.symbolInfo
 * @param {() => string} opts.activePriceScaleId
 */
export function applySettingsToChart(opts) {
  const { targetChart, targetSeries, pane, settingsStore, themeColors, symbolInfo, activePriceScaleId } = opts;
  const s = settingsStore.get();
  const sc = s.scales ?? {};
  const cv = s.canvas ?? {};
  const sym = s.symbol ?? {};
  const gridMode = cv.gridLinesMode ?? "vertAndHorz";
  const placement = resolvePriceScalePlacement(sc.scalesPlacement);
  const marginTop = Number(cv.marginTop);
  const marginBottom = Number(cv.marginBottom);
  const marginRight = Number(cv.marginRight);
  const crosshairWidth = Number(cv.crosshairWidth) || 1;
  const crosshairStyleMap = {
    0: LineStyle.Solid,
    1: LineStyle.Dotted,
    2: LineStyle.Dashed,
  };
  const crosshairLineStyle = crosshairStyleMap[Number(cv.crosshairStyle)] ?? LineStyle.Dashed;
  const crosshairColor = applyColorOpacity(
    cv.crosshairColor ?? themeColors.crosshair,
    cv.crosshairOpacity ?? 100,
  );
  const activeScale = placement.left ? "left" : "right";
  const paneSymbolInfo = pane.symbolInfo ?? symbolInfo;
  const timeZone = resolveTimezone(sym.timezone, paneSymbolInfo);
  const timezoneProvider = createTimezoneProvider(timeZone);
  pane._timezoneProvider = timezoneProvider;

  targetChart.applyOptions({
    layout: {
      background: resolveLayoutBackground(cv, themeColors),
      textColor: cv.scalesTextColor || themeColors.text,
      fontSize: Number(cv.scalesFontSize) || 12,
      attributionLogo: Boolean(cv.attributionLogo),
    },
    grid: {
      vertLines: {
        visible: gridAxisVisible(gridMode, "vert"),
        color: cv.gridVertColor ?? themeColors.grid,
      },
      horzLines: {
        visible: gridAxisVisible(gridMode, "horz"),
        color: cv.gridHorzColor ?? themeColors.grid,
      },
    },
    crosshair: {
      mode: CrosshairMode.Normal,
      vertLine: { color: crosshairColor, width: crosshairWidth, style: crosshairLineStyle },
      horzLine: { color: crosshairColor, width: crosshairWidth, style: crosshairLineStyle },
    },
    rightPriceScale: {
      visible: placement.right,
      borderVisible: sc.scaleLines !== false,
      borderColor: cv.scalesLineColor ?? themeColors.border,
    },
    leftPriceScale: {
      visible: placement.left,
      borderVisible: sc.scaleLines !== false,
      borderColor: cv.scalesLineColor ?? themeColors.border,
    },
    timeScale: {
      borderColor: cv.scalesLineColor ?? themeColors.border,
      rightOffset: Number.isFinite(marginRight) ? marginRight : FUTURE_RIGHT_OFFSET,
      tickMarkFormatter: (time, tickMarkType) => {
        const displayTime = toDisplayTime(time, timezoneProvider);
        switch (tickMarkType) {
          case TickMarkType.Year:
            return String(toDate(displayTime).getUTCFullYear());
          case TickMarkType.Month:
            return formatAxisMonthTick(displayTime, sc, CHART_TIME_LABEL_TZ);
          case TickMarkType.DayOfMonth:
            return formatAxisDateTick(displayTime, sc, CHART_TIME_LABEL_TZ);
          case TickMarkType.Time:
            return formatAxisTimeTick(toDate(displayTime), CHART_TIME_LABEL_TZ, sc);
          default:
            return "";
        }
      },
    },
    timezoneProvider,
    localization: {
      locale: navigator.language,
      priceFormatter: (price) => formatDisplayPrice(price, precisionFromSettings(s, paneSymbolInfo)),
      timeFormatter: (t) => {
        const barSec = pane._chartView?.barSec ?? resolutionSec(pane.resolution) ?? 60;
        const displayTime = toDisplayTime(t, timezoneProvider);
        return formatChartTimeLabel(displayTime, sc, CHART_TIME_LABEL_TZ, {
          includeTime: barSec < 86400,
        });
      },
    },
  });

  const defaultMargins = {
    top: Number.isFinite(marginTop) ? marginTop / 100 : 0.08,
    bottom: Number.isFinite(marginBottom) ? marginBottom / 100 : 0.12,
  };
  const autoScale = sc.lockPriceToBarRatio ? false : sc.autoScale;

  /** @type {import("lightweight-charts").PriceScaleOptions} */
  const scaleOpts = {
    mode: priceScaleModeFromSettings(sc),
    invertScale: sc.invertScale,
  };

  if (autoScale) {
    pane._manualScaleLocked = false;
    scaleOpts.autoScale = true;
    scaleOpts.scaleMargins = defaultMargins;
  } else if (sc.lockPriceToBarRatio) {
    scaleOpts.autoScale = false;
    scaleOpts.scaleMargins = defaultMargins;
  }
  // Manual scale (autoScale: false): do not re-apply here — LWC tutorial sets this once
  // after data exists. Re-applying on every settings/layout restore breaks the axis.

  const scaleKey = priceScaleSettingsKey(sc, cv, activeScale);
  if (pane._lastPriceScaleSettingsKey !== scaleKey) {
    pane._lastPriceScaleSettingsKey = scaleKey;
    targetSeries.priceScale().applyOptions(scaleOpts);
    targetChart.priceScale(activePriceScaleId()).applyOptions(scaleOpts);
  }

  targetSeries.applyOptions({
    priceScaleId: activeScale,
    upColor: sym.bodyVisible ? sym.bodyUpColor : "transparent",
    downColor: sym.bodyVisible ? sym.bodyDownColor : "transparent",
    borderVisible: Boolean(sym.bordersVisible),
    borderUpColor: sym.bordersVisible ? sym.bordersUpColor : "transparent",
    borderDownColor: sym.bordersVisible ? sym.bordersDownColor : "transparent",
    wickVisible: Boolean(sym.wickVisible),
    wickUpColor: sym.wickVisible ? sym.wickUpColor : "transparent",
    wickDownColor: sym.wickVisible ? sym.wickDownColor : "transparent",
    priceFormat: priceFormatFromPrecisionSetting(sym.precision, paneSymbolInfo),
    title: pane.index === 0 && sc.symbolLabelName ? pane.symbol : "",
  });

  if (sc.lockPriceToBarRatio) {
    requestAnimationFrame(() => {
      applyLockPriceBarRatioForPane(pane, settingsStore, activePriceScaleId);
    });
  }
}

/**
 * TradingView-style lock: fixed px-per-price-per-bar; zoom time → adjust price scale, zoom price → bar spacing.
 * @param {object} pane
 * @param {ReturnType<import("../../ui/chart/settings.js").createChartSettings>} settingsStore
 * @param {() => "left" | "right"} activePriceScaleId
 * @param {{ capture?: boolean }} [opts]
 */
export function applyLockPriceBarRatioForPane(pane, settingsStore, activePriceScaleId, opts = {}) {
  const sc = settingsStore.get().scales ?? {};
  if (!sc.lockPriceToBarRatio || !pane?.chart || !pane?.series) return;

  let target = Number(sc.lockPriceToBarRatioValue);
  if (opts.capture) {
    const measured = measurePriceBarRatio(pane.chart, pane.series);
    if (measured != null && Number.isFinite(measured) && measured > 0) {
      target = measured;
      settingsStore.set("scales", "lockPriceToBarRatioValue", measured, { skipHistory: true });
      settingsStore.set("scales", "autoScale", false, { skipHistory: true });
    }
  }

  if (!Number.isFinite(target) || target <= 0) return;

  const scaleId = activePriceScaleId();
  const margins = scaleMarginsFromSettings(settingsStore);
  pane._manualScaleLocked = true;
  pane.series.priceScale().applyOptions({ autoScale: false, scaleMargins: margins });
  try {
    pane.chart.priceScale(scaleId).applyOptions({ autoScale: false, scaleMargins: margins });
  } catch {
    /* ignore */
  }
  enforcePriceBarRatio(pane.chart, pane.series, scaleId, target);
}

/**
 * @param {ReturnType<import("../../ui/chart/settings.js").createChartSettings>} settingsStore
 */
export function scaleMarginsFromSettings(settingsStore) {
  const cv = settingsStore.get().canvas ?? {};
  const marginTop = Number(cv.marginTop);
  const marginBottom = Number(cv.marginBottom);
  return {
    top: Number.isFinite(marginTop) ? marginTop / 100 : 0.08,
    bottom: Number.isFinite(marginBottom) ? marginBottom / 100 : 0.12,
  };
}

/**
 * High/low of real bars in the visible logical range.
 * @param {object} pane
 * @param {{ from: number, to: number } | null | undefined} logical
 */
export function priceRangeFromVisibleLogicalRange(pane, logical) {
  const bars = pane?.bars;
  if (!bars?.length || !logical) return null;
  const { from, to } = logical;
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;

  const startIdx = Math.max(0, Math.floor(from));
  const endIdx = Math.min(bars.length - 1, Math.ceil(to));
  if (startIdx > endIdx) return null;

  let minVal = Infinity;
  let maxVal = -Infinity;
  for (let i = startIdx; i <= endIdx; i += 1) {
    const b = bars[i];
    if (!b) continue;
    for (const v of [b.low, b.high, b.open, b.close]) {
      const n = Number(v);
      if (!Number.isFinite(n)) continue;
      minVal = Math.min(minVal, n);
      maxVal = Math.max(maxVal, n);
    }
  }
  if (!Number.isFinite(minVal) || !Number.isFinite(maxVal) || minVal >= maxVal) return null;
  return { minValue: minVal, maxValue: maxVal };
}

/**
 * Fit price scale to visible bar high/low, then lock manual scale (TradingView TF-change behavior).
 * @param {object} pane
 * @param {ReturnType<import("../../ui/chart/settings.js").createChartSettings>} settingsStore
 * @param {() => "left" | "right"} activePriceScaleId
 * @param {{ margins?: { top: number, bottom: number }, lockAfter?: boolean, onDone?: () => void }} [opts]
 */
export function refitPriceScaleToVisibleBars(pane, settingsStore, activePriceScaleId, opts = {}) {
  if (!pane?.chart || !pane?.series || !pane.bars?.length) return null;

  const sc = settingsStore.get().scales ?? {};
  const margins = opts.margins ?? scaleMarginsFromSettings(settingsStore);
  const scaleId = activePriceScaleId();
  const lockAfter = opts.lockAfter ?? (!sc.autoScale && !sc.lockPriceToBarRatio);

  /** @param {import("lightweight-charts").PriceScaleOptions} scaleOpts */
  const apply = (scaleOpts) => {
    pane.series.priceScale().applyOptions(scaleOpts);
    try {
      pane.chart.priceScale(scaleId).applyOptions(scaleOpts);
      pane.chart.priceScale("right").applyOptions(scaleOpts);
      pane.chart.priceScale("left").applyOptions(scaleOpts);
    } catch {
      /* ignore */
    }
  };

  const runFit = () => {
    const logical = pane.chart.timeScale().getVisibleLogicalRange?.();
    const barRange = priceRangeFromVisibleLogicalRange(pane, logical);
    const provider = barRange
      ? () => ({
          priceRange: {
            minValue: barRange.minValue,
            maxValue: barRange.maxValue,
          },
        })
      : undefined;

    apply({
      autoScale: true,
      autoscaleInfoProvider: provider,
      scaleMargins: margins,
    });

    requestAnimationFrame(() => {
      if (sc.autoScale) {
        pane._manualScaleLocked = false;
        opts.onDone?.();
        return;
      }

      if (sc.lockPriceToBarRatio) {
        apply({ autoScale: false, autoscaleInfoProvider: undefined, scaleMargins: margins });
        const target = Number(sc.lockPriceToBarRatioValue);
        if (Number.isFinite(target) && target > 0) {
          enforcePriceBarRatio(pane.chart, pane.series, scaleId, target);
        }
        opts.onDone?.();
        return;
      }

      if (lockAfter) {
        apply({ autoScale: false, autoscaleInfoProvider: undefined, scaleMargins: margins });
        pane._manualScaleLocked = true;
      }
      opts.onDone?.();
    });
  };

  requestAnimationFrame(() => requestAnimationFrame(runFit));

  return { margins, barRange: priceRangeFromVisibleLogicalRange(pane, pane.chart.timeScale().getVisibleLogicalRange?.()) };
}

/**
 * Apply price scale margins after bar data is on the chart (setData / refresh).
 * @param {object} pane
 * @param {ReturnType<import("../../ui/chart/settings.js").createChartSettings>} settingsStore
 * @param {() => "left" | "right"} activePriceScaleId
 */
export function applyPriceScaleMarginsAfterBarLoad(pane, settingsStore, activePriceScaleId) {
  if (!pane?.chart || !pane?.series || !pane.bars?.length) return;

  const sc = settingsStore.get().scales ?? {};
  const margins = scaleMarginsFromSettings(settingsStore);
  const priceScaleId = activePriceScaleId();

  if (sc.autoScale) {
    pane._manualScaleLocked = false;
    pane.series.priceScale().applyOptions({ autoScale: true, scaleMargins: margins });
    try {
      pane.chart.priceScale(priceScaleId).applyOptions({ autoScale: true, scaleMargins: margins });
    } catch {
      /* ignore */
    }
    return;
  }

  if (sc.lockPriceToBarRatio) {
    pane.series.priceScale().applyOptions({ autoScale: false, scaleMargins: margins });
    try {
      pane.chart.priceScale(priceScaleId).applyOptions({ autoScale: false, scaleMargins: margins });
    } catch {
      /* ignore */
    }
    const target = Number(sc.lockPriceToBarRatioValue);
    if (Number.isFinite(target) && target > 0) {
      requestAnimationFrame(() => {
        enforcePriceBarRatio(pane.chart, pane.series, priceScaleId, target);
      });
    }
    return;
  }

  refitPriceScaleToVisibleBars(pane, settingsStore, activePriceScaleId, { margins });
}

/**
 * Lock manual price scale once after bars exist (LWC customization guide pattern).
 * @param {object} pane
 * @param {ReturnType<import("../../ui/chart/settings.js").createChartSettings>} settingsStore
 * @param {() => "left" | "right"} activePriceScaleId
 */
export function ensureManualPriceScaleAfterLoad(pane, settingsStore, activePriceScaleId) {
  applyPriceScaleMarginsAfterBarLoad(pane, settingsStore, activePriceScaleId);
}

/**
 * Stable key for settings that require rebuilding chart bar times / candle series data.
 * @param {ReturnType<import("../../ui/chart/settings.js").createChartSettings>} settingsStore
 * @param {object | null | undefined} symbolInfo
 */
export function chartDataRefreshKey(settingsStore, symbolInfo) {
  const sym = settingsStore.get().symbol ?? {};
  const perBar = Boolean(sym.colorBarsOnPrevClose);
  const parts = [
    resolveTimezone(sym.timezone, symbolInfo),
    sym.session ?? "electronic",
    perBar ? "1" : "0",
  ];
  if (perBar) {
    parts.push(
      sym.bodyVisible,
      sym.bodyUpColor,
      sym.bodyDownColor,
      sym.bordersVisible,
      sym.bordersUpColor,
      sym.bordersDownColor,
      sym.wickVisible,
      sym.wickUpColor,
      sym.wickDownColor,
    );
  }
  return parts.join("\0");
}

/**
 * @param {object} opts
 * @param {ReturnType<import("../../ui/chart/settings.js").createChartSettings>} opts.settingsStore
 * @param {object} opts.symbolInfo
 * @param {() => void} [opts.refreshCandleData]
 * @param {object} [opts.tzClock]
 * @param {(setting: string | undefined, info: object) => string} opts.resolveTimezone
 * @param {string | undefined} [opts.previousTimezone]
 * @param {string | undefined} [opts.previousDataKey]
 * @returns {{ timezone: string, dataKey: string, dataChanged: boolean }}
 */
export function applyChartTimezone(opts) {
  const {
    settingsStore,
    symbolInfo,
    tzClock,
    refreshCandleData,
    resolveTimezone: resolveTz,
    previousTimezone,
    previousDataKey,
  } = opts;
  const sym = settingsStore.get().symbol ?? {};
  const timezone = resolveTz(sym.timezone, symbolInfo);
  const dataKey = chartDataRefreshKey(settingsStore, symbolInfo);
  const dataChanged = previousDataKey !== undefined && dataKey !== previousDataKey;

  if (previousTimezone !== undefined && timezone !== previousTimezone) {
    invalidateChartTimeCache(previousTimezone);
    invalidateChartTimeCache(timezone);
    invalidateTimezoneProviderCache(previousTimezone);
    invalidateTimezoneProviderCache(timezone);
  }

  if (dataChanged) {
    refreshCandleData?.();
  }

  tzClock?.update();
  return { timezone, dataKey, dataChanged };
}
