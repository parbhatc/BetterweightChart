import { mountChartContextMenu } from "../../ui/context/chart.js";
import { mountPriceScaleContextMenu } from "../../ui/context/priceScale.js";
import { mountTimeScaleContextMenu } from "../../ui/context/timeScale.js";
import {
  measurePriceBarRatio,
} from "../../chart/price/barRatio.js";
import { resolvePriceScaleModeKey } from "../../chart/scale/settings.js";

/**
 * Wire chart, price-scale, and time-scale context menus.
 * @param {object} opts
 */
export function wireContextMenus(opts) {
  const {
    chartWrap,
    chart,
    el,
    series,
    getState,
    actions,
    settingsStore,
    chartSettings,
    activePriceScaleId,
    resetChartView,
    resetTimeScale,
  } = opts;

  const {
    getSymbol,
    getCrosshairPrice,
    formatPrice,
    getDrawingCount,
    getLockCursorByTime,
    getHoverBar,
    getBars,
    getLockedCrosshairTime,
    setCrosshairPrice,
    setLockCursorByTime,
    setLockedCrosshairTime,
    getDrawing,
  } = getState;

  mountChartContextMenu({
    container: chartWrap,
    chart,
    chartEl: el,
    getState: () => ({
      symbol: getSymbol(),
      price: getCrosshairPrice(),
      priceText: formatPrice(getCrosshairPrice()),
      drawingCount: getDrawingCount(),
      lockCursorByTime: getLockCursorByTime(),
      canPaste: true,
    }),
    actions: {
      resetChart: resetChartView,
      copyPrice: async () => {
        const price = getCrosshairPrice();
        if (price == null) return;
        try {
          await navigator.clipboard.writeText(formatPrice(price));
        } catch {
          /* ignore */
        }
      },
      paste: async () => {
        try {
          const text = await navigator.clipboard.readText();
          const n = parseFloat(text.replace(/,/g, ""));
          if (!Number.isFinite(n)) return;
          setCrosshairPrice(n);
          const time = getLockedCrosshairTime() ?? getHoverBar()?.time ?? getBars().at(-1)?.time;
          if (time != null) chart.setCrosshairPosition(n, time, series);
        } catch {
          /* ignore */
        }
      },
      toggleLockCursor: () => {
        const next = !getLockCursorByTime();
        setLockCursorByTime(next);
        if (next) {
          setLockedCrosshairTime(getHoverBar()?.time ?? getBars().at(-1)?.time ?? null);
        } else {
          setLockedCrosshairTime(null);
        }
      },
      removeDrawings: () => getDrawing()?.clearAll(),
      openSettings: () => chartSettings.open(),
    },
  });

  mountPriceScaleContextMenu({
    container: chartWrap,
    chartEl: el,
    chart,
    getState: (side) => {
      const sc = settingsStore.get().scales ?? {};
      const mode = resolvePriceScaleModeKey(sc);
      const liveRatio = measurePriceBarRatio(chart, series);
      return {
        autoScale: Boolean(sc.autoScale),
        lockPriceToBarRatio: Boolean(sc.lockPriceToBarRatio),
        lockRatioText: (liveRatio ?? Number(sc.lockPriceToBarRatioValue || 0)).toFixed(4),
        scalePriceChartOnly: Boolean(sc.scalePriceChartOnly),
        invertScale: Boolean(sc.invertScale),
        priceScaleMode: mode,
        moveScaleLabel: side === "right" ? "Move scale to left" : "Move scale to right",
      };
    },
    actions: {
      setAutoScale: () => {
        settingsStore.set("scales", "autoScale", true);
        resetChartView();
      },
      toggleLockRatio: () => {
        const sc = settingsStore.get().scales ?? {};
        const enabling = !sc.lockPriceToBarRatio;
        if (enabling) {
          const ratio = measurePriceBarRatio(chart, series);
          const ps = chart.priceScale(activePriceScaleId());
          ps.applyOptions({ autoScale: false });
          settingsStore.merge({
            scales: {
              lockPriceToBarRatio: true,
              lockPriceToBarRatioValue: ratio ?? sc.lockPriceToBarRatioValue,
            },
          });
          return;
        }
        settingsStore.set("scales", "lockPriceToBarRatio", false);
      },
      toggleScalePriceChartOnly: () => {
        const sc = settingsStore.get().scales ?? {};
        settingsStore.set("scales", "scalePriceChartOnly", !sc.scalePriceChartOnly);
      },
      toggleInvertScale: () => {
        const sc = settingsStore.get().scales ?? {};
        settingsStore.set("scales", "invertScale", !sc.invertScale);
      },
      setPriceScaleMode: (mode) => {
        settingsStore.merge({ scales: { priceScaleMode: mode, logarithmic: mode === "logarithmic" } });
      },
      moveScale: () => {
        const sc = settingsStore.get().scales ?? {};
        const next = sc.scalesPlacement === "left" ? "right" : "left";
        settingsStore.set("scales", "scalesPlacement", next);
      },
      openSettings: () => chartSettings.open("scales"),
    },
  });

  mountTimeScaleContextMenu({
    container: chartWrap,
    chartEl: el,
    chart,
    getState: () => {
      const sym = settingsStore.get().symbol ?? {};
      return {
        timezone: sym.timezone ?? "America/New_York",
        session: sym.session ?? "electronic",
        sessionBreaks: Boolean(sym.sessionBreaks),
      };
    },
    actions: {
      resetTimeScale,
      setTimezone: (tz) => settingsStore.set("symbol", "timezone", tz),
      toggleSessionBreaks: () => {
        const sym = settingsStore.get().symbol ?? {};
        settingsStore.set("symbol", "sessionBreaks", !sym.sessionBreaks);
      },
      setSession: (session) => settingsStore.set("symbol", "session", session),
      openSettings: () => chartSettings.open("symbol"),
    },
  });
}
