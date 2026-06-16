import { mountChartContextMenu } from "../../ui/context/chart.js";
import { mountPriceScaleContextMenu } from "../../ui/context/priceScale.js";
import { mountTimeScaleContextMenu } from "../../ui/context/timeScale.js";
import {
  measurePriceBarRatio,
} from "../../chart/price/barRatio.js";
import { resolvePriceScaleModeKey } from "../../chart/scale/settings.js";

/**
 * Wire chart, price-scale, and time-scale context menus for one pane.
 * @param {object} opts
 */
export function wirePaneContextMenus(opts) {
  const {
    pane,
    wrapEl,
    settingsStore,
    chartSettings,
    getChartSettings = () => chartSettings,
    activePriceScaleId,
    activatePane,
    formatPrice,
    ui,
    getDrawing,
    getDrawingCount,
    resetChartView,
    resetTimeScale,
  } = opts;

  const { chart, series, el: chartEl } = pane;

  mountChartContextMenu({
    container: wrapEl,
    chart,
    chartEl,
    onBeforeOpen: async () => {
      await activatePane(pane.index);
    },
    getState: () => ({
      symbol: pane.symbol,
      price: ui.crosshairPrice,
      priceText: formatPrice(ui.crosshairPrice),
      drawingCount: getDrawingCount(pane.index),
      lockCursorByTime: ui.lockCursorByTime,
      canPaste: Boolean(getDrawing()?.hasDrawingClipboard?.()) || true,
      hasSelectedDrawing: Boolean(getDrawing()?.getSelectedDrawing?.()),
    }),
    actions: {
      resetChart: () => resetChartView(pane),
      copyPrice: async () => {
        const price = ui.crosshairPrice;
        if (price == null) return;
        try {
          await navigator.clipboard.writeText(formatPrice(price));
        } catch {
          /* ignore */
        }
      },
      copyDrawing: () => {
        getDrawing()?.copySelectedDrawing?.();
      },
      paste: async () => {
        if (await getDrawing()?.pasteDrawingFromSystemClipboard?.()) return;
        try {
          const text = await navigator.clipboard.readText();
          const n = parseFloat(text.replace(/,/g, ""));
          if (!Number.isFinite(n)) return;
          ui.crosshairPrice = n;
          const utcTime = ui.lockedCrosshairTime ?? pane.hoverBar?.time ?? pane.bars.at(-1)?.time;
          if (utcTime != null) {
            const chartTime = pane.timeAdapter?.time.toChart(utcTime) ?? utcTime;
            chart.setCrosshairPosition(n, chartTime, series);
          }
        } catch {
          /* ignore */
        }
      },
      toggleLockCursor: () => {
        const next = !ui.lockCursorByTime;
        ui.lockCursorByTime = next;
        if (next) {
          ui.lockedCrosshairTime = pane.hoverBar?.time ?? pane.bars.at(-1)?.time ?? null;
        } else {
          ui.lockedCrosshairTime = null;
        }
      },
      removeDrawings: () => getDrawing()?.clearAll(),
      openSettings: () => getChartSettings().open(),
    },
  });

  mountPriceScaleContextMenu({
    container: wrapEl,
    chartEl,
    chart,
    onBeforeOpen: async () => {
      await activatePane(pane.index);
    },
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
        resetChartView(pane);
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
      openSettings: () => getChartSettings().open("scales"),
    },
  });

  mountTimeScaleContextMenu({
    container: wrapEl,
    chartEl,
    chart,
    onBeforeOpen: async () => {
      await activatePane(pane.index);
    },
    getState: () => {
      const sym = settingsStore.get().symbol ?? {};
      return {
        timezone: sym.timezone ?? "America/New_York",
        session: sym.session ?? "electronic",
        sessionBreaks: Boolean(sym.sessionBreaks),
      };
    },
    actions: {
      resetTimeScale: () => resetTimeScale(pane),
      setTimezone: (tz) => settingsStore.set("symbol", "timezone", tz),
      toggleSessionBreaks: () => {
        const sym = settingsStore.get().symbol ?? {};
        settingsStore.set("symbol", "sessionBreaks", !sym.sessionBreaks);
      },
      setSession: (session) => settingsStore.set("symbol", "session", session),
      openSettings: () => getChartSettings().open("symbol"),
    },
  });
}

/**
 * @param {object} opts — legacy single-pane API; prefer wirePaneContextMenus.
 */
export function wireContextMenus(opts) {
  const { chartWrap, chart, el, series, getState, settingsStore, chartSettings, activePriceScaleId, resetChartView, resetTimeScale } = opts;
  const ui = {
    get crosshairPrice() {
      return getState.getCrosshairPrice();
    },
    set crosshairPrice(v) {
      getState.setCrosshairPrice?.(v);
    },
    get lockCursorByTime() {
      return getState.getLockCursorByTime();
    },
    set lockCursorByTime(v) {
      getState.setLockCursorByTime?.(v);
    },
    get lockedCrosshairTime() {
      return getState.getLockedCrosshairTime();
    },
    set lockedCrosshairTime(v) {
      getState.setLockedCrosshairTime?.(v);
    },
    hoverBar: undefined,
  };
  wirePaneContextMenus({
    pane: {
      index: 0,
      chart,
      series,
      el,
      symbol: getState.getSymbol(),
      bars: getState.getBars(),
      hoverBar: getState.getHoverBar?.(),
    },
    wrapEl: chartWrap,
    settingsStore,
    chartSettings,
    activePriceScaleId,
    activatePane: opts.activatePane ?? (() => {}),
    formatPrice: getState.formatPrice,
    ui,
    getDrawing: getState.getDrawing,
    getDrawingCount: () => getState.getDrawingCount(),
    resetChartView: (pane) => resetChartView(pane ?? { chart, bars: getState.getBars() }),
    resetTimeScale: (pane) => resetTimeScale(pane ?? { chart, bars: getState.getBars() }),
  });
}
