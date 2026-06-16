import { ColorType, CrosshairMode, LineStyle } from "lightweight-charts";
import { FUTURE_RIGHT_OFFSET } from "../view/index.js";
import { gridAxisVisible } from "../canvas/settings.js";
import {
  isScaleVisible,
  priceScaleModeFromSettings,
  resolvePriceScalePlacement,
} from "../scale/settings.js";
import { invalidateChartTimeCache } from "../timezone/chartTime.js";
import { priceFormatFromPrecisionSetting } from "../timezone/list.js";
import { applyColorOpacity } from "../../ui/color/picker.js";

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
  const currencyVisible = isScaleVisible(sc.currencyUnitVisibility);
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

  targetChart.applyOptions({
    layout: {
      background: { type: ColorType.Solid, color: cv.backgroundColor || themeColors.bg },
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
      visible: placement.right && currencyVisible,
      borderVisible: sc.scaleLines !== false,
      borderColor: cv.scalesLineColor ?? themeColors.border,
    },
    leftPriceScale: {
      visible: placement.left && currencyVisible,
      borderVisible: sc.scaleLines !== false,
      borderColor: cv.scalesLineColor ?? themeColors.border,
    },
    timeScale: {
      borderColor: cv.scalesLineColor ?? themeColors.border,
      rightOffset: Number.isFinite(marginRight) ? marginRight : FUTURE_RIGHT_OFFSET,
    },
  });

  const scaleOpts = {
    mode: priceScaleModeFromSettings(sc),
    invertScale: sc.invertScale,
    autoScale: sc.lockPriceToBarRatio ? false : sc.autoScale,
    scaleMargins: {
      top: Number.isFinite(marginTop) ? marginTop / 100 : 0.08,
      bottom: Number.isFinite(marginBottom) ? marginBottom / 100 : 0.12,
    },
  };
  targetChart.priceScale(activePriceScaleId()).applyOptions(scaleOpts);

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
}

/**
 * @param {object} opts
 * @param {ReturnType<import("../../ui/chart/settings.js").createChartSettings>} opts.settingsStore
 * @param {object} opts.symbolInfo
 */
export function applyChartTimezone(opts) {
  const { settingsStore, symbolInfo, tzClock, refreshCandleData, resolveTimezone } = opts;
  const sym = settingsStore.get().symbol ?? {};
  invalidateChartTimeCache(resolveTimezone(sym.timezone, symbolInfo));
  refreshCandleData?.();
  tzClock?.update();
}
