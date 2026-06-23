import {
  precisionFromSettings,
  priceFormatFromPrecisionSetting,
  resolveTimezone,
} from "../../../chart/timezone/list.js";
import { formatDisplayPrice } from "../../../chart/format.js";
import { applySettingsToChart, applyChartTimezone as applyChartTimezoneToPanes, applyLockPriceBarRatioForPane } from "../../../chart/settings/applier.js";
import { measurePriceBarRatio } from "../../../chart/price/barRatio.js";
import { withPreservedViewport } from "../../../chart/pane/viewport.js";
import { mountChartSettings } from "../../../ui/chart/settings.js";
import { loadShowMobilePlacementBar, saveShowMobilePlacementBar } from "../../../drawings/toolbars/utility/settings/store.js";
import { applyCanvasPresetForTheme } from "../themes.js";
import { saveThemePreference } from "../../../ui/theme/store.js";
import { chartThemeFallback } from "../themes.js";

/**
 * @param {import("./state.js").BootContext} ctx
 */
export function attachSettingsBoot(ctx) {
  /** @type {ReturnType<typeof mountChartSettings> | null} */
  let chartSettings = null;
  /** @type {string | undefined} */
  let lastChartDataRefreshKey = undefined;
  /** @type {string | undefined} */
  let lastChartTimezone = undefined;
  let lockRatioWasEnabled = false;

  function mountChartSettingsUi() {
    if (chartSettings) return chartSettings;
    chartSettings = mountChartSettings({
      store: ctx.settingsStore,
      triggerEl: document.getElementById("settings-btn") ?? undefined,
      onLiveChange: () => {
        const sc = ctx.settingsStore.get().scales ?? {};
        const lockOn = Boolean(sc.lockPriceToBarRatio);
        if (lockOn && !lockRatioWasEnabled) {
          const primary = ctx.chartPanes.get(0);
          if (primary) {
            applyLockPriceBarRatioForPane(primary, ctx.settingsStore, activePriceScaleId, {
              capture: true,
            });
          }
          chartSettings?.syncDraftFromStore?.();
        }
        ctx.applyChartSettings();
      },
      getTheme: () => ctx.currentTheme,
      onThemeChange: (mode) => {
        saveThemePreference(mode);
        applyThemeMode(mode);
      },
      getDrawingSettings: () => ({
        showMobilePlacementBar: ctx.drawing?.getShowMobilePlacementBar?.() ?? loadShowMobilePlacementBar(),
      }),
      getQuotesEnabled: () => Boolean(ctx.quotesEnabled),
      getLivePriceBarRatio: () => {
        const primary = ctx.chartPanes.get(0);
        if (!primary?.chart || !primary?.series) return null;
        return measurePriceBarRatio(primary.chart, primary.series);
      },
      setDrawingSetting: (key, value) => {
        if (key !== "showMobilePlacementBar") return;
        ctx.drawing?.setShowMobilePlacementBar?.(value);
        saveShowMobilePlacementBar(Boolean(value));
      },
    });
    return chartSettings;
  }

  function refreshWatermark() {
    if (!ctx.watermarkText) return;
    const cv = ctx.settingsStore.get().canvas ?? {};
    const lines = [];
    if (cv.watermarkTicker) lines.push(ctx.symbol);
    if (cv.watermarkInterval) {
      lines.push(ctx.resolutions.find((r) => r.id === ctx.resolution)?.label ?? ctx.resolution);
    }
    if (cv.watermarkDescription && ctx.symbolInfo?.description) {
      lines.push(ctx.symbolInfo.description);
    }
    ctx.watermarkText.textContent = lines.join("\n");
  }

  function applyThemeMode(mode) {
    ctx.currentTheme = mode === "light" ? "light" : "dark";
    const colors =
      ctx.cfg.themes?.[ctx.currentTheme] ??
      ctx.cfg.themes?.dark ??
      chartThemeFallback(ctx.currentTheme);
    document.documentElement.setAttribute("data-theme", ctx.currentTheme);
    ctx.applyTheme(colors);
    applyCanvasPresetForTheme(ctx.settingsStore, ctx.currentTheme);
    ctx.applyChartSettings();
    refreshWatermark();
  }

  function formatPrice(n) {
    if (n == null || !Number.isFinite(n)) return "—";
    return formatDisplayPrice(n, precisionFromSettings(ctx.settingsStore.get(), ctx.symbolInfo));
  }

  function activePriceScaleId() {
    const placement = ctx.settingsStore.get().scales?.scalesPlacement;
    return placement === "left" ? "left" : "right";
  }

  function applySettingsToChartLocal(targetChart, targetSeries, pane) {
    applySettingsToChart({
      targetChart,
      targetSeries,
      pane,
      settingsStore: ctx.settingsStore,
      themeColors: ctx.themeColors,
      symbolInfo: ctx.symbolInfo,
      activePriceScaleId,
    });
  }

  function applyChartTimezone() {
    const result = applyChartTimezoneToPanes({
      settingsStore: ctx.settingsStore,
      symbolInfo: ctx.symbolInfo,
      tzClock: ctx.tzClock,
      refreshCandleData: ctx.refreshCandleData,
      resolveTimezone,
      previousTimezone: lastChartTimezone,
      previousDataKey: lastChartDataRefreshKey,
    });
    lastChartTimezone = result.timezone;
    lastChartDataRefreshKey = result.dataKey;
    ctx._chartDataRefreshKey = result.dataKey;
    if (result.dataChanged) {
      ctx._chartDataRevision = (ctx._chartDataRevision ?? 0) + 1;
    }
    return result.dataChanged;
  }

  function applyChartSettings() {
    const s = ctx.settingsStore.get();
    const sc = s.scales ?? {};
    const cv = s.canvas ?? {};

    if (ctx.watermarkText && cv.watermarkColor) ctx.watermarkText.style.color = cv.watermarkColor;
    refreshWatermark();

    ctx.chartWrap?.classList.toggle("tv-nav-buttons-hover", cv.navButtonsVisibility === "visibleOnMouseOver");
    ctx.chartWrap?.classList.toggle("tv-pane-buttons-hover", cv.paneButtonsVisibility === "visibleOnMouseOver");

    for (const pane of ctx.getAllChartPanes()) {
      if (pane.chart) {
        withPreservedViewport(
          pane.chart,
          () => applySettingsToChartLocal(pane.chart, pane.series, pane),
          { followUpFrames: 2 },
        );
      } else {
        applySettingsToChartLocal(pane.chart, pane.series, pane);
      }
    }

    ctx.applySymbolLineStyleLocal();

    if (ctx.drawing) {
      ctx.applyDrawingCursorAll();
    }
    applyChartTimezone();
    ctx.refreshStatusLine();
    for (const pane of ctx.getAllChartPanes()) {
      pane.priceLineLabel?.requestRefresh();
      pane.bidAskLines?.requestRefresh();
    }

    if (sc.lockPriceToBarRatio) {
      ctx.maintainLockedRatio?.();
    }

    lockRatioWasEnabled = Boolean(sc.lockPriceToBarRatio);
  }

  function applySymbolFormat(info) {
    const sym = ctx.settingsStore.get().symbol ?? {};
    for (const pane of ctx.getAllChartPanes()) {
      pane.series.applyOptions({
        priceFormat: priceFormatFromPrecisionSetting(sym.precision, pane.symbolInfo ?? info),
      });
    }
  }

  Object.assign(ctx, {
    mountChartSettingsUi,
    refreshWatermark,
    applyThemeMode,
    formatPrice,
    activePriceScaleId,
    applySettingsToChartLocal,
    applyChartTimezone,
    applyChartSettings,
    applySymbolFormat,
    get chartSettingsUi() {
      return mountChartSettingsUi();
    },
  });
}
